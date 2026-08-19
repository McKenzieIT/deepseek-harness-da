// PROTOTYPE (throwaway) — P6 semantic-layer substrate · reader/writer/sync.
// Mirrors reverse-bi/libs/rbi-semantic/src/rbi_semantic/{reader,writer,sync}.py.
// All functions take explicit semantic_layer: Path (dependency injection, no module globals).

import { readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, fsyncSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import yaml from 'js-yaml'
import { EventDefinition, TableDefinition } from './types.mjs'

// ── YAML dump (mirrors RBI _LiteralDumper: multi-line -> literal block |, sort_keys=False, allow_unicode) ──
// js-yaml uses literal block | for strings with newlines; sortKeys:false preserves insertion order.
// NOTE (see README): exact byte-fidelity to pyyaml is NOT claimed — DATA round-trips; style is js-yaml's.
export function dumpYaml(obj) {
  return yaml.dump(obj, { sortKeys: false, lineWidth: -1, noRefs: true, quotingType: '"' })
}
function readYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'))
}

// ── Atomic write (mirrors writer._atomic_write: temp file in same dir + fsync + os.replace) ──
// NOTE: fcntl.flock skipped in this prototype (Node has no built-in fcntl; production uses a lock lib
// like proper-lockfile). The atomic temp+rename+fsync pattern is what's being validated.
export function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  const text = typeof obj === 'string' ? obj : dumpYaml(obj)
  const tmp = `${path}.tmp.${process.pid}`
  const fd = openSync(tmp, 'w')
  writeFileSync(fd, text)
  fsyncSync(fd)
  closeSync(fd)
  renameSync(tmp, path) // atomic on same filesystem
}

// ── Cache-invalidation hooks (ADR-0011 contract) ───────────────────────
const _invalidationHooks = []
export function registerInvalidationHook(hook) { _invalidationHooks.push(hook) }
export function invalidateCaches(semanticLayer) {
  for (const hook of _invalidationHooks) {
    try { hook(semanticLayer) } catch { /* best-effort — a broken hook must not block the write */ }
  }
}

// ── Reader (mirrors reader.py: lenient scan, strict validate-on-match) ──
export function resolveSemanticLayer(semanticRoot) {
  if (!semanticRoot) return null
  if (existsSync(join(semanticRoot, 'config.yaml'))) return semanticRoot
  for (const child of readdirSync(semanticRoot).sort()) {
    const c = join(semanticRoot, child)
    try { if (statSync(c).isDirectory() && existsSync(join(c, 'config.yaml'))) return c } catch {}
  }
  return semanticRoot
}
export function loadConfig(semanticLayer) { return readYaml(join(semanticLayer, 'config.yaml')) }
export function loadDomains(semanticLayer) {
  const p = join(semanticLayer, 'domains.yaml')
  if (!existsSync(p)) return {}
  try { const d = readYaml(p); return typeof d === 'object' && d !== null ? d : {} } catch { return {} }
}
export function loadTerminology(semanticLayer) {
  const p = join(semanticLayer, 'terminology.yaml')
  if (!existsSync(p)) return null
  return readYaml(p)
}
export function loadEvents(semanticLayer) {
  const eventsDir = join(semanticLayer, 'events')
  const out = []
  if (!existsSync(eventsDir)) return out
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    try { if (!statSync(dp).isDirectory()) continue } catch { continue }
    for (const f of readdirSync(dp).sort()) {
      if (!f.endsWith('.yaml') || f === '_index.yaml') continue
      try {
        const raw = readYaml(join(dp, f))
        if (typeof raw !== 'object' || raw === null) continue
        const name = raw.name
        if (!name) continue
        out.push({ name, raw, domain: domainDir })
      } catch { continue } // lenient: YAML-broken file skipped, doesn't poison others
    }
  }
  return out
}
export function loadTables(semanticLayer) {
  const tdir = join(semanticLayer, 'tables')
  const out = []
  if (!existsSync(tdir)) return out
  for (const f of readdirSync(tdir).sort()) {
    if (!f.endsWith('.yaml') || f.startsWith('_')) continue
    try {
      const raw = readYaml(join(tdir, f))
      if (typeof raw !== 'object' || raw === null || raw.table_name == null) continue
      out.push({ path: join(tdir, f), raw })
    } catch { continue }
  }
  return out
}
export function loadEventDefinition(semanticLayer, name) {
  for (const e of loadEvents(semanticLayer)) if (e.name === name) return EventDefinition.parse(e.raw)
  return null
}
export function loadTableDefinition(semanticLayer, name) {
  for (const t of loadTables(semanticLayer)) if (t.raw.table_name === name) return TableDefinition.parse(t.raw)
  return null
}
function findEventPath(semanticLayer, name) {
  const eventsDir = join(semanticLayer, 'events')
  if (!existsSync(eventsDir)) return null
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    const candidate = join(dp, `${name}.yaml`)
    if (existsSync(candidate)) {
      try { const raw = readYaml(candidate); if (raw && raw.name === name) return candidate } catch {}
    }
  }
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    for (const f of readdirSync(dp).sort()) {
      if (!f.endsWith('.yaml') || f === '_index.yaml') continue
      try { const raw = readYaml(join(dp, f)); if (raw && raw.name === name) return join(dp, f) } catch {}
    }
  }
  return null
}

// ── Writer (mirrors writer.py: validate-before-dump, atomic, invalidate) ──
export class WriteValidationError extends Error {}
export function writeTable(semanticLayer, name, data, { skipValidation = false } = {}) {
  if (!skipValidation) {
    const r = TableDefinition.safeParse(data)
    if (!r.success) throw new WriteValidationError(`Table validation failed: ${r.error.message}`)
  }
  const tablesPath = join(semanticLayer, 'tables')
  const target = join(tablesPath, `${name}.yaml`)
  atomicWrite(target, data)
  invalidateCaches(semanticLayer)
  return target
}
// writeEventYaml = raw-edit surface (mirrors writer.write_event_yaml used by approve_event_yaml):
// no model_validate (the write IS the repair surface; load validates on read). Name-match check.
export function writeEventYaml(semanticLayer, name, content) {
  let defn
  try { defn = yaml.load(content) } catch (e) { return { error: `YAML parse failed: ${e}` } }
  if (typeof defn !== 'object' || defn === null || defn.name !== name) {
    const found = defn && typeof defn === 'object' ? defn.name : null
    return { error: `name mismatch: YAML name=${found} vs event_name=${name}` }
  }
  const target = findEventPath(semanticLayer, name) ?? join(semanticLayer, 'events', '_suggested', `${name}.yaml`)
  atomicWrite(target, content)
  invalidateCaches(semanticLayer)
  return { ok: true, path: target }
}
// Tier-2 per-scope persistent write: read-merge-validate-write + audit (mirrors writer.update_table_meta).
export function updateTableMeta(semanticLayer, name, updates, { audit } = {}) {
  const tf = join(semanticLayer, 'tables', `${name}.yaml`)
  if (!existsSync(tf)) return { error: `Table not found: ${name}` }
  const data = readYaml(tf)
  if (typeof data !== 'object' || data === null) return { error: `Table malformed: ${name}` }
  Object.assign(data, updates)
  const r = TableDefinition.safeParse(data)
  if (!r.success) return { error: `Validation failed after update: ${r.error.message}` }
  atomicWrite(tf, data)
  invalidateCaches(semanticLayer)
  if (audit) audit('update_table_meta', { table_name: name, updates })
  return { ok: true, table_name: name }
}

// ── Sync-write (mirrors rbi_semantic/sync.py: YAML-write-only, receives pre-fetched schema dicts) ──
// NOTE: this is the ODPS-DECOUPLED sync — it receives TableMeta[] (from ctx.schema.discover/describe,
// stubbed in schema-stub.mjs) and writes YAML. It does NOT touch pyodps/ODPS — that lives in the
// query-engine MaxCompute sidecar (P4 / decision ⑤a).
const MEASURE_TYPES = new Set(['BIGINT', 'INT', 'DOUBLE', 'FLOAT', 'DECIMAL'])
const MEASURE_SUFFIXES = ['_count', '_cnt', '_sum', '_amt', '_amount', '_avg', '_total', '_num']
const LABEL_SUFFIXES = ['_name', '_desc', '_label', '_title']
export function inferRole(col) {
  const t = (col.type || '').toUpperCase()
  const n = (col.name || '').toLowerCase()
  if (n === 'ds' || n === 'dt' || n === 'date') return 'dimension'
  if (n.endsWith('_id')) return 'dimension'
  if (MEASURE_TYPES.has(t) && MEASURE_SUFFIXES.some(s => n.endsWith(s))) return 'measure'
  if (t === 'STRING') return 'dimension'
  if (MEASURE_TYPES.has(t)) return 'measure'
  return 'attribute'
}
export function generateTableYaml(meta) {
  const columns = (meta.columns || []).map(c => ({ name: c.name, type: c.type, comment: c.comment || '', role: inferRole(c) }))
  return {
    table_name: meta.table_name,
    table_comment: meta.comment || '',
    description: '',
    domains: [],
    granularity: '',
    columns,
    metrics: {},
    partitions: (meta.partitions || []).map(p => ({ name: p.name, type: p.type })),
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  }
}
export function generateDimYaml(meta) {
  const columns = (meta.columns || []).map(c => ({ name: c.name, type: c.type, comment: c.comment || '', role: inferRole(c) }))
  const pkCol = (meta.columns || []).find(c => c.name.endsWith('_id'))
  const primaryKey = pkCol ? [pkCol.name] : []
  const labelColumns = (meta.columns || [])
    .filter(c => (c.type || '').toUpperCase() === 'STRING' && LABEL_SUFFIXES.some(s => (c.name || '').toLowerCase().endsWith(s)))
    .map(c => c.name)
  return {
    table_name: meta.table_name,
    table_comment: meta.comment || '',
    description: '',
    domains: [],
    kind: 'dim',
    primary_key: primaryKey,
    primary_key_unique: null,
    label_columns: labelColumns,
    freshness: '静态参考',
    granularity: '维表(非分区,全量参考,无时间维度)',
    columns,
    metrics: {},
    partitions: (meta.partitions || []).map(p => ({ name: p.name, type: p.type })),
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  }
}
// merge_columns: preserve analyst role corrections (existing role overrides inferred).
export function mergeColumns(existingCols, newMetaCols) {
  const existing = new Map((existingCols || []).map(c => [c.name, c]))
  const out = []
  for (const col of newMetaCols) {
    const old = existing.get(col.name)
    if (old) out.push({ ...col, role: old.role || inferRole(col), comment: col.comment || old.comment || '' })
    else out.push({ ...col, role: inferRole(col) })
  }
  return out
}
export function mergeChangedYaml(existing, newMeta) {
  const out = { ...existing }
  if (newMeta.columns) out.columns = mergeColumns(existing.columns, newMeta.columns)
  if (newMeta.partitions) out.partitions = newMeta.partitions.map(p => ({ name: p.name, type: p.type }))
  return out
}
// sync_write_definitions: batch write a list of TableMeta (mirrors rbi_semantic.sync.sync_write_definitions).
export function syncWriteDefinitions(semanticLayer, tableMetas, { dimTableNames = new Set(), existingTables = new Map() } = {}) {
  let written = 0, skipped = 0; const errors = []
  for (const meta of tableMetas) {
    const tname = meta.table_name
    if (!tname) { skipped++; continue }
    try {
      let doc
      if (existingTables.has(tname)) doc = mergeChangedYaml(existingTables.get(tname), meta)
      else if (dimTableNames.has(tname)) doc = generateDimYaml(meta)
      else doc = generateTableYaml(meta)
      writeTable(semanticLayer, tname, doc, { skipValidation: true }) // sync writes pre-validated by generation (mirrors RBI)
      written++
    } catch (e) { errors.push(`${tname}: ${e.message}`) }
  }
  return { written, skipped, errors }
}
