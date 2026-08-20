/**
 * P6b semantic-layer substrate — reader/writer/sync.
 * Mirrors reverse-bi/libs/rbi-semantic/src/rbi_semantic/{reader,writer,sync}.py.
 *
 * All functions take an explicit `semanticLayer` path (dependency injection, no
 * module globals for the layer root). Atomic write reuses
 * `@deepseek-ai/dsh-atomic-write` (`writeFileAtomic`: temp+wx+rename, mode
 * stamped through) — the prototype's hand-rolled `openSync/fsync/renameSync` is
 * replaced. Tier-2 audit routes through `ctx.audit.recordTier2Write` via the
 * `Tier2Recorder` interface (P6b grilling Q4; the prototype's flat JSON
 * `auditLog` is removed). Readers are sync (readFileSync, fast lookup); writers
 * are async (writeFileAtomic).
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/io
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  EventDefinitionSchema,
  TableDefinitionSchema,
  type EventDefinition,
  type TableDefinition,
  type TableMeta,
} from './types.ts'

/** Tier-2 recorder contract — `ctx.audit` satisfies this (P6b grilling Q4). */
export interface Tier2Recorder {
  recordTier2Write(
    toolName: string,
    payload: unknown,
    opts?: {
      readonly scope_id?: string
      readonly session_id?: string
      readonly tenant_id?: string
      readonly user_id?: string
    },
  ): string
}

export interface Tier2Opts {
  /** ctx.audit (or a test double) — required; Tier-2 audit is non-disableable (D5 "不可关"). */
  readonly recorder: Tier2Recorder
  readonly scope_id?: string
}

// ── YAML dump (mirrors RBI _LiteralDumper: literal block |, sort_keys=False) ──
export function dumpYaml(obj: unknown): string {
  return yaml.dump(obj, { sortKeys: false, lineWidth: -1, noRefs: true, quotingType: '"' })
}
function readYaml(path: string): unknown {
  return yaml.load(readFileSync(path, 'utf-8'))
}

// ── Atomic write (mirrors writer._atomic_write via @deepseek-ai/dsh-atomic-write) ──
const YAML_MODE = 0o644
async function atomicWrite(path: string, obj: unknown): Promise<void> {
  const text = typeof obj === 'string' ? obj : dumpYaml(obj)
  await writeFileAtomic(path, text, { mode: YAML_MODE })
}

// ── Cache-invalidation hooks (ADR-0011 contract) ─────────────────────────
const _invalidationHooks: Array<(semanticLayer: string) => void> = []
export function registerInvalidationHook(hook: (semanticLayer: string) => void): void {
  _invalidationHooks.push(hook)
}
export function invalidateCaches(semanticLayer: string): void {
  for (const hook of _invalidationHooks) {
    try {
      hook(semanticLayer)
    } catch {
      // best-effort — a broken hook must not block the write
    }
  }
}

// ── Reader (mirrors reader.py: lenient scan, strict validate-on-match) ──
export function resolveSemanticLayer(semanticRoot: string): string {
  if (!semanticRoot) return semanticRoot
  if (existsSync(join(semanticRoot, 'config.yaml'))) return semanticRoot
  for (const child of readdirSync(semanticRoot).sort()) {
    const c = join(semanticRoot, child)
    try {
      if (statSync(c).isDirectory() && existsSync(join(c, 'config.yaml'))) return c
    } catch {
      // not a directory or inaccessible — skip
    }
  }
  return semanticRoot
}
export function loadConfig(semanticLayer: string): Record<string, unknown> {
  return readYaml(join(semanticLayer, 'config.yaml')) as Record<string, unknown>
}
export function loadDomains(semanticLayer: string): Record<string, unknown> {
  const p = join(semanticLayer, 'domains.yaml')
  if (!existsSync(p)) return {}
  try {
    const d = readYaml(p)
    return typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
export function loadTerminology(semanticLayer: string): unknown {
  const p = join(semanticLayer, 'terminology.yaml')
  if (!existsSync(p)) return null
  return readYaml(p)
}
export interface RawEvent {
  readonly name: string
  readonly raw: Record<string, unknown>
  readonly domain: string
}
export function loadEvents(semanticLayer: string): RawEvent[] {
  const eventsDir = join(semanticLayer, 'events')
  const out: RawEvent[] = []
  if (!existsSync(eventsDir)) return out
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    try {
      if (!statSync(dp).isDirectory()) continue
    } catch {
      continue
    }
    for (const f of readdirSync(dp).sort()) {
      if (!f.endsWith('.yaml') || f === '_index.yaml') continue
      try {
        const raw = readYaml(join(dp, f))
        if (typeof raw !== 'object' || raw === null) continue
        const r = raw as Record<string, unknown>
        const name = r.name
        if (typeof name !== 'string') continue
        out.push({ name, raw: r, domain: domainDir })
      } catch {
        continue // lenient: YAML-broken file skipped, doesn't poison others
      }
    }
  }
  return out
}
export interface RawTable {
  readonly path: string
  readonly table_name: string
  readonly raw: Record<string, unknown>
}
export function loadTables(semanticLayer: string): RawTable[] {
  const tdir = join(semanticLayer, 'tables')
  const out: RawTable[] = []
  if (!existsSync(tdir)) return out
  for (const f of readdirSync(tdir).sort()) {
    if (!f.endsWith('.yaml') || f.startsWith('_')) continue
    try {
      const raw = readYaml(join(tdir, f))
      if (typeof raw !== 'object' || raw === null) continue
      const r = raw as Record<string, unknown>
      const tn = r.table_name
      if (typeof tn !== 'string') continue
      out.push({ path: join(tdir, f), table_name: tn, raw: r })
    } catch {
      continue
    }
  }
  return out
}
export function loadEventDefinition(semanticLayer: string, name: string): EventDefinition | null {
  for (const e of loadEvents(semanticLayer)) {
    if (e.name === name) return EventDefinitionSchema.parse(e.raw)
  }
  return null
}
export function loadTableDefinition(semanticLayer: string, name: string): TableDefinition | null {
  for (const t of loadTables(semanticLayer)) {
    if (t.table_name === name) return TableDefinitionSchema.parse(t.raw)
  }
  return null
}
function findEventPath(semanticLayer: string, name: string): string | null {
  const eventsDir = join(semanticLayer, 'events')
  if (!existsSync(eventsDir)) return null
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    const candidate = join(dp, `${name}.yaml`)
    if (existsSync(candidate)) {
      try {
        const raw = readYaml(candidate) as Record<string, unknown> | null
        if (raw !== null && raw.name === name) return candidate
      } catch {
        // fall through to broad scan
      }
    }
  }
  for (const domainDir of readdirSync(eventsDir).sort()) {
    const dp = join(eventsDir, domainDir)
    for (const f of readdirSync(dp).sort()) {
      if (!f.endsWith('.yaml') || f === '_index.yaml') continue
      try {
        const raw = readYaml(join(dp, f)) as Record<string, unknown> | null
        if (raw !== null && raw.name === name) return join(dp, f)
      } catch {
        // lenient
      }
    }
  }
  return null
}

// ── Writer (mirrors writer.py: validate-before-dump, atomic, invalidate) ──
export class WriteValidationError extends Error {}
export async function writeTable(
  semanticLayer: string,
  name: string,
  data: unknown,
  opts: { skipValidation?: boolean } = {},
): Promise<string> {
  if (!opts.skipValidation) {
    const r = TableDefinitionSchema.safeParse(data)
    if (!r.success) throw new WriteValidationError(`Table validation failed: ${r.error.message}`)
  }
  const tablesPath = join(semanticLayer, 'tables')
  const target = join(tablesPath, `${name}.yaml`)
  await atomicWrite(target, data)
  invalidateCaches(semanticLayer)
  return target
}
export type WriteEventYamlResult = { ok: true; path: string } | { ok: false; error: string }
// writeEventYaml = raw-edit surface (mirrors writer.write_event_yaml used by approve_event_yaml):
// no model_validate (the write IS the repair surface; load validates on read). Name-match check.
export async function writeEventYaml(
  semanticLayer: string,
  name: string,
  content: string,
): Promise<WriteEventYamlResult> {
  let defn: unknown
  try {
    defn = yaml.load(content)
  } catch (e) {
    return { ok: false, error: `YAML parse failed: ${(e as Error).message}` }
  }
  if (typeof defn !== 'object' || defn === null) return { ok: false, error: 'YAML is not an object' }
  const r = defn as Record<string, unknown>
  const yamlName = r.name
  if (typeof yamlName !== 'string' || yamlName !== name) {
    return { ok: false, error: `name mismatch: YAML name=${String(yamlName)} vs event_name=${name}` }
  }
  const target = findEventPath(semanticLayer, name) ?? join(semanticLayer, 'events', '_suggested', `${name}.yaml`)
  await atomicWrite(target, content)
  invalidateCaches(semanticLayer)
  return { ok: true, path: target }
}
// Tier-2 per-scope persistent write: read-merge-validate-write + audit (mirrors writer.update_table_meta).
// D5 contract: "Tier-2 不可关" — audit is NON-OPTIONAL. The `recorder` (ctx.audit)
// records the Tier-2 audit (hash, not body); omitting it is a fail-loud programmer error.
export type UpdateTableMetaResult = { ok: true; table_name: string } | { ok: false; error: string }
export async function updateTableMeta(
  semanticLayer: string,
  name: string,
  updates: Record<string, unknown>,
  opts: Tier2Opts,
): Promise<UpdateTableMetaResult> {
  const tf = join(semanticLayer, 'tables', `${name}.yaml`)
  if (!existsSync(tf)) return { ok: false, error: `Table not found: ${name}` }
  const data = readYaml(tf)
  if (typeof data !== 'object' || data === null) return { ok: false, error: `Table malformed: ${name}` }
  const merged: Record<string, unknown> = { ...(data as Record<string, unknown>), ...updates }
  const r = TableDefinitionSchema.safeParse(merged)
  if (!r.success) return { ok: false, error: `Validation failed after update: ${r.error.message}` }
  await atomicWrite(tf, merged)
  invalidateCaches(semanticLayer)
  opts.recorder.recordTier2Write('update_table_meta', { table_name: name, updates }, opts.scope_id !== undefined ? { scope_id: opts.scope_id } : {})
  return { ok: true, table_name: name }
}

// ── Sync-write (mirrors rbi_semantic/sync.py: YAML-write-only, receives pre-fetched schema dicts) ──
// ODPS-DECOUPLED: receives TableMeta[] (from ctx.schema.discover/describe) and writes YAML.
// Does NOT touch ODPS — that lives in the query-engine MaxCompute sidecar (P4 / ⑤a).
const MEASURE_TYPES = new Set(['BIGINT', 'INT', 'DOUBLE', 'FLOAT', 'DECIMAL'])
const MEASURE_SUFFIXES = ['_count', '_cnt', '_sum', '_amt', '_amount', '_avg', '_total', '_num']
const LABEL_SUFFIXES = ['_name', '_desc', '_label', '_title']
type MergeColumn = { name: string; type: string; role?: string; comment?: string }
export function inferRole(col: { name?: string; type?: string }): string {
  const t = (col.type ?? '').toUpperCase()
  const n = (col.name ?? '').toLowerCase()
  if (n === 'ds' || n === 'dt' || n === 'date') return 'dimension'
  if (n.endsWith('_id')) return 'dimension'
  if (MEASURE_TYPES.has(t) && MEASURE_SUFFIXES.some(s => n.endsWith(s))) return 'measure'
  if (t === 'STRING') return 'dimension'
  if (MEASURE_TYPES.has(t)) return 'measure'
  return 'attribute'
}
export function generateTableYaml(meta: TableMeta): Record<string, unknown> {
  const columns = meta.columns.map(c => ({ name: c.name, type: c.type, comment: c.comment ?? '', role: inferRole(c) }))
  return {
    table_name: meta.table_name,
    table_comment: meta.comment ?? '',
    description: '',
    domains: [],
    granularity: '',
    columns,
    metrics: {},
    partitions: meta.partitions.map(p => ({ name: p.name, type: p.type })),
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  }
}
export function generateDimYaml(meta: TableMeta): Record<string, unknown> {
  const columns = meta.columns.map(c => ({ name: c.name, type: c.type, comment: c.comment ?? '', role: inferRole(c) }))
  const pkCol = meta.columns.find(c => c.name.endsWith('_id'))
  const primaryKey = pkCol !== undefined ? [pkCol.name] : []
  const labelColumns = meta.columns
    .filter(c => c.type.toUpperCase() === 'STRING' && LABEL_SUFFIXES.some(s => c.name.toLowerCase().endsWith(s)))
    .map(c => c.name)
  return {
    table_name: meta.table_name,
    table_comment: meta.comment ?? '',
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
    partitions: meta.partitions.map(p => ({ name: p.name, type: p.type })),
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  }
}
// merge_columns: preserve analyst role corrections (existing role overrides inferred).
export function mergeColumns(
  existingCols: ReadonlyArray<MergeColumn>,
  newMetaCols: ReadonlyArray<{ name: string; type: string; comment?: string | null | undefined }>,
): Array<{ name: string; type: string; role: string; comment: string }> {
  const existing = new Map(existingCols.map(c => [c.name, c]))
  const out: Array<{ name: string; type: string; role: string; comment: string }> = []
  for (const col of newMetaCols) {
    const old = existing.get(col.name)
    if (old !== undefined) {
      out.push({ name: col.name, type: col.type, role: old.role || inferRole(col), comment: col.comment ?? old.comment ?? '' })
    } else {
      out.push({ name: col.name, type: col.type, role: inferRole(col), comment: col.comment ?? '' })
    }
  }
  return out
}
export function mergeChangedYaml(existing: Record<string, unknown>, newMeta: TableMeta): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing }
  const existingColsRaw = existing.columns
  if (newMeta.columns.length > 0 && Array.isArray(existingColsRaw)) {
    out.columns = mergeColumns(existingColsRaw, newMeta.columns)
  }
  out.partitions = newMeta.partitions.map(p => ({ name: p.name, type: p.type }))
  return out
}
// sync_write_definitions: batch write a list of TableMeta (mirrors rbi_semantic.sync.sync_write_definitions).
// D5: sync-write = ops/admin Tier-2, "不可关" — audit is NON-OPTIONAL (recorder required).
export async function syncWriteDefinitions(
  semanticLayer: string,
  tableMetas: readonly TableMeta[],
  opts: Tier2Opts & {
    readonly dimTableNames?: Set<string>
    readonly existingTables?: Map<string, Record<string, unknown>>
  },
): Promise<{ written: number; skipped: number; errors: string[] }> {
  let written = 0
  let skipped = 0
  const errors: string[] = []
  const dimTableNames = opts.dimTableNames ?? new Set<string>()
  const existingTables = opts.existingTables ?? new Map<string, Record<string, unknown>>()
  for (const meta of tableMetas) {
    const tname = meta.table_name
    if (!tname) {
      skipped += 1
      continue
    }
    try {
      let doc: Record<string, unknown>
      let isDim = false
      const existing = existingTables.get(tname)
      if (existing !== undefined) {
        doc = mergeChangedYaml(existing, meta)
      } else if (dimTableNames.has(tname)) {
        doc = generateDimYaml(meta)
        isDim = true
      } else {
        doc = generateTableYaml(meta)
      }
      // DIM path validates against .superRefine (pk + label_columns) — do NOT silently
      // emit primary_key:[] / label_columns:[] that fails .superRefine on read.
      // DWS/merge keep skipValidation (generation pre-validates; DWS has no kind constraint).
      await writeTable(semanticLayer, tname, doc, { skipValidation: !isDim })
      opts.recorder.recordTier2Write('sync_write_definitions', { table_name: tname }, opts.scope_id !== undefined ? { scope_id: opts.scope_id } : {})
      written += 1
    } catch (e) {
      errors.push(`${tname}: ${(e as Error).message}`)
    }
  }
  return { written, skipped, errors }
}
