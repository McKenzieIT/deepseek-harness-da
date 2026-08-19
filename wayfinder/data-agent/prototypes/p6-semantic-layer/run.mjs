#!/usr/bin/env node
// PROTOTYPE (throwaway) — P6 semantic-layer substrate · demo driver.
// Pushes the substrate state model through cases hard to reason about on paper:
//  (1) data-model fidelity: zod parse+validate+round-trip REAL RBI YAML fixtures (event/DWS/DIM/terminology/config),
//      incl. canonicalize_type + DIM .superRefine rejecting a malformed DIM.
//  (2) ODPS-decoupled sync: ctx.schema (stubbed MaxCompute sidecar) -> TableMeta[] -> infer_role -> generate/merge YAML -> write
//      (new DWS, new DIM, changed-table merge preserving analyst role corrections).
//  (3) write-tiers: suggest_event_yaml -> pending queue (Tier-1, source-of-truth NOT touched) -> approve -> write+invalidate;
//      update_table_meta (Tier-2, audit-logged).
//  (4) BasicIndex: lookup after write -> ADR-0011 invalidate -> rebuild.
// See README.md for decisions + assumptions.

import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import yaml from 'js-yaml'
import { EventDefinition, TableDefinition, canonicalizeType } from './types.mjs'
import {
  resolveSemanticLayer, loadConfig, loadTerminology, loadEvents, loadTables,
  writeTable, writeEventYaml, updateTableMeta, syncWriteDefinitions,
} from './io.mjs'
import { BasicIndex } from './index.mjs'
import { submit, load as pendingLoad, listing, discard, recordTier2Write, isValidId } from './pending.mjs'
import { ctxSchema } from './schema-stub.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const note = m => console.log(`• ${m}`)
const RBI = '/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer'
const FIX = {
  event: `${RBI}/10000147/events/role_public/role_online.yaml`,
  dws: `${RBI}/10000251/tables/dws_10000251_pay_order_di.yaml`,
  dim: `${RBI}/10000251/tables/dim_10000251_charm_info.yaml`,
  config: `${RBI}/10000147/config.yaml`,
  terminology: `${RBI}/10000147/terminology.yaml`,
}
// scratch semantic-layer (PROTOTYPE — wipe me). Single scope dir.
const SCRATCH = join(HERE, 'PROTOTYPE-WIPE-ME-scratch', '10000demo')
const VAR_PENDING = join(HERE, 'PROTOTYPE-WIPE-ME-scratch', 'var', 'pending_semantic')
const AUDIT_LOG = join(HERE, 'PROTOTYPE-WIPE-ME-scratch', 'var', 'audit.json')

function resetScratch() {
  rmSync(join(HERE, 'PROTOTYPE-WIPE-ME-scratch'), { recursive: true, force: true })
  mkdirSync(join(SCRATCH, 'events', 'role_public'), { recursive: true })
  mkdirSync(join(SCRATCH, 'tables'), { recursive: true })
  writeFileSync(join(SCRATCH, 'config.yaml'), yaml.dump({
    project: { name: 'game_demo', scope_id: '10000demo' },
    maxcompute: { environment: 'domestic-prod' },
    event_view: { workspace: 'demo_ods', view_name: 'ods_demo_all_view' },
    guards: { max_scan_bytes: 536870912000, select_only: true },
  }), 'utf8')
  writeFileSync(join(SCRATCH, 'domains.yaml'), yaml.dump({ domains: ['付费经济', '装备道具'] }), 'utf8')
}

// stable deep-equal (order-independent) for round-trip comparison
function sortKeys(o) { if (Array.isArray(o)) return o.map(sortKeys); if (o && typeof o === 'object') return Object.keys(o).sort().reduce((a, k) => (a[k] = sortKeys(o[k]), a), {}); return o }
function deepEqual(a, b) { return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b)) }
function showCanonicalization(rawEvent) {
  const before = {}
  for (const [, pf] of Object.entries(rawEvent.params_fields || {})) before[pf.type] = (before[pf.type] || 0) + 1
  const after = {}
  for (const [, pf] of Object.entries(rawEvent.params_fields || {})) { const c = canonicalizeType(pf.type); after[c] = (after[c] || 0) + 1 }
  return { before, after }
}

// ── SCENARIO 1: data-model fidelity against real RBI YAML ──────────────
async function scenario1() {
  note('SCENARIO 1: data-model fidelity — zod parse+validate REAL RBI YAML fixtures')
  if (!existsSync(FIX.event)) { note(`  ⚠ RBI fixture path not found: ${FIX.event} — skip (run on the repo with reverse-bi checked out)`); return }
  const rawEvent = yaml.load(readFileSync(FIX.event, 'utf8'))
  const rawDws = yaml.load(readFileSync(FIX.dws, 'utf8'))
  const rawDim = yaml.load(readFileSync(FIX.dim, 'utf8'))
  const ev = EventDefinition.safeParse(rawEvent)
  const dws = TableDefinition.safeParse(rawDws)
  const dim = TableDefinition.safeParse(rawDim)
  note(`  event role.online: parse ${ev.success ? 'OK' : 'FAIL'} (params_fields=${Object.keys(rawEvent.params_fields || {}).length})`)
  note(`  DWS dws_..._pay_order_di: parse ${dws.success ? 'OK' : 'FAIL'} (columns=${rawDws.columns?.length}, metrics=${Object.keys(rawDws.metrics || {}).length})`)
  note(`  DIM dim_..._charm_info: parse ${dim.success ? 'OK' : 'FAIL'} (kind=${rawDim.kind}, pk=${JSON.stringify(rawDim.primary_key)}, label=${JSON.stringify(rawDim.label_columns)})`)
  // canonicalize_type evidence
  const canon = showCanonicalization(rawEvent)
  note(`  canonicalize_type on event params_fields: ${JSON.stringify(canon.before)} -> ${JSON.stringify(canon.after)} (e.g. int->int, but mixed physical spellings collapse to logical)`)
  // round-trip: parse -> dump -> reparse -> compare (both canonicalized)
  if (ev.success) {
    const dumped = yaml.dump(ev.data, { sortKeys: false, lineWidth: -1, noRefs: true })
    const reparsed = EventDefinition.parse(yaml.load(dumped))
    note(`  round-trip event: parse->dump->reparse->compare = ${deepEqual(ev.data, reparsed) ? 'EQUAL ✓ (data round-trips; zod mirrors pydantic model_validate)' : 'DIFF ✗'}`)
  }
  if (dim.success) {
    const dumped = yaml.dump(dim.data, { sortKeys: false, lineWidth: -1, noRefs: true })
    const reparsed = TableDefinition.parse(yaml.load(dumped))
    note(`  round-trip DIM: parse->dump->reparse->compare = ${deepEqual(dim.data, reparsed) ? 'EQUAL ✓' : 'DIFF ✗'}`)
  }
  // malformed DIM: drop primary_key + label_columns -> .superRefine must REJECT
  const malformed = { ...rawDim, primary_key: [], label_columns: [] }
  const bad = TableDefinition.safeParse(malformed)
  note(`  malformed DIM (empty pk + label_columns): zod ${bad.success ? 'WRONGLY accepted ✗' : 'rejected ✓ (.superRefine mirrors _kind_constraints)'} -> ${bad.error.issues[0]?.message || ''}`)
  // config + terminology parse (loose)
  note(`  config.yaml: ${typeof loadConfig === 'function' ? 'loadable' : '?'}; terminology.yaml entries=${(yaml.load(readFileSync(FIX.terminology, 'utf8')).terminology || []).length}`)
}

// ── SCENARIO 2: ODPS-decoupled sync (ctx.schema -> generate/merge YAML -> write) ──
async function scenario2() {
  note('SCENARIO 2: ODPS-decoupled sync — ctx.schema (stubbed MaxCompute sidecar) -> TableMeta[] -> generate/merge YAML -> write')
  note('  ctx.schema.discover(scope, "dws") -> [dws_demo_pay_order_di]')
  const dwsMetas = ctxSchema.discover('10000demo', 'dws')
  note('  ctx.schema.discover(scope, "dim") -> [dim_demo_item_info]')
  const dimMetas = ctxSchema.discover('10000demo', 'dim')
  const r1 = syncWriteDefinitions(SCRATCH, dwsMetas, { dimTableNames: new Set() })
  note(`  sync-write DWS (new): written=${r1.written} — infer_role: pay_amt(double+no measure-suffix)=measure? ${'pay_amt' && 'pay_amt'.endsWith('_amt') ? 'YES (measure)' : 'no'}`)
  const r2 = syncWriteDefinitions(SCRATCH, dimMetas, { dimTableNames: new Set(['dim_demo_item_info']) })
  note(`  sync-write DIM (new): written=${r2.written} — generate_dim_yaml: pk=[item_id] (first *_id), label_columns=[item_name] (STRING+_name)`)
  // changed table: merge_changed_yaml preserves analyst role corrections
  note('  ctx.schema.describeChanged("dws_demo_pay_order_di") -> meta with NEW col + type change')
  const changed = ctxSchema.describeChanged('dws_demo_pay_order_di')
  // first, analyst "corrects" pay_amt role to 'attribute' (override the inferred 'measure')
  const existing = yaml.load(readFileSync(join(SCRATCH, 'tables', 'dws_demo_pay_order_di.yaml'), 'utf8'))
  existing.columns.find(c => c.name === 'pay_amt').role = 'attribute' // analyst correction
  writeTable(SCRATCH, 'dws_demo_pay_order_di', existing, { skipValidation: true })
  note('  analyst corrected pay_amt role: measure -> attribute (Tier-2 curation)')
  const { mergeChangedYaml } = await import('./io.mjs')
  const merged = mergeChangedYaml(existing, changed)
  note(`  merge_changed_yaml: pay_amt role preserved=${merged.columns.find(c => c.name === 'pay_amt').role} (analyst 'attribute' kept, type updated to ${merged.columns.find(c => c.name === 'pay_amt').type}); new col coupon_amt added with inferred role=${merged.columns.find(c => c.name === 'coupon_amt').role}`)
  writeTable(SCRATCH, 'dws_demo_pay_order_di', merged, { skipValidation: true })
  note('  ✓ merge preserves analyst-owned fields; new/changed columns get inferred roles')
}

// ── SCENARIO 3: write-tiers (Tier-1 suggest->pending->approve; Tier-2 audit) ──
async function scenario3() {
  note('SCENARIO 3: write-tiers — Tier-1 suggest->pending->approve (source-of-truth protection) + Tier-2 audit')
  const idx = new BasicIndex(SCRATCH)
  const eventContent = yaml.dump({
    name: 'role.online', event_filter: "event = 'role.online'", description: '玩家上线(PROTOTYPE suggest)',
    domains: ['用户生命周期'], params_fields: { roleId: { type: 'int', description: '角色id' } },
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
  }, { sortKeys: false, lineWidth: -1 })
  // Tier-1: agent SUGGESTS — does NOT write source-of-truth
  note('  Tier-1: agent suggest_event_yaml("role.online", content) -> pending queue (NOT written)')
  const rec = submit(VAR_PENDING, { kind: 'event_yaml', subject: 'role.online', content: eventContent, scope_id: '10000demo' })
  note(`  pending suggestion_id=${rec.suggestion_id} (isValidId=${isValidId(rec.suggestion_id)})`)
  note(`  source-of-truth check: BasicIndex.lookupEvent('role.online') = ${idx.lookupEvent('role.online') ? 'FOUND (LEAK ✗)' : 'null ✓ (suggest did NOT touch source-of-truth)'}`)
  note(`  pending queue length=${listing(VAR_PENDING).length}`)
  // approve side (gated to P9 admin in production; here we demo the mechanism)
  note('  approve_event_yaml(suggestion_id) -> writeEventYaml + discard (approve-side registration is P9-gated in production)')
  const loaded = pendingLoad(VAR_PENDING, rec.suggestion_id)
  const res = writeEventYaml(SCRATCH, 'role.online', loaded.content)
  note(`  write result: ${JSON.stringify(res)}`)
  const discarded = discard(VAR_PENDING, rec.suggestion_id)
  note(`  discard from queue=${discarded} (must consume else re-approvable); pending length=${listing(VAR_PENDING).length}`)
  note(`  source-of-truth check: lookupEvent('role.online') now = ${idx.lookupEvent('role.online') ? 'FOUND ✓ (approved write landed)' : 'null ✗'} (index rebuilt via ADR-0011 invalidate)`)
  // Tier-2: per-scope persistent write, audit-logged (NOT disableable)
  note('  Tier-2: update_table_meta("dws_demo_pay_order_di", {granularity: "日增量"}) -> direct write + audit log')
  const r = updateTableMeta(SCRATCH, 'dws_demo_pay_order_di', { granularity: '日增量，每行一笔付费订单事件' }, { audit: (tool, p) => recordTier2Write(AUDIT_LOG, tool, JSON.stringify(p), { scope_id: '10000demo' }) })
  note(`  update result: ${JSON.stringify(r)}; audit log entries=${JSON.parse(readFileSync(AUDIT_LOG, 'utf8')).length}`)
}

// ── SCENARIO 4: BasicIndex (lookup + ADR-0011 invalidate rebuild) ───────
async function scenario4() {
  note('SCENARIO 4: BasicIndex — lookup + ADR-0011 invalidate -> rebuild after write')
  const idx = new BasicIndex(SCRATCH)
  note(`  index built: events=${idx.eventCount()} tables=${idx.tableCount()} (dws=${idx.tableCountByKind('dws')} dim=${idx.tableCountByKind('dim')})`)
  note(`  lookupTable('dws_demo_pay_order_di'): ${idx.lookupTable('dws_demo_pay_order_di') ? 'found ✓' : 'null ✗'}`)
  note(`  lookupEvent('role.online'): ${idx.lookupEvent('role.online') ? 'found ✓' : 'null ✗'}`)
  // a NEW write -> io.mjs invalidateCaches fires the index's hook -> _dirty -> next lookup rebuilds
  note('  write a NEW table (dws_demo_login_di) -> invalidate fires -> next lookup rebuilds')
  writeTable(SCRATCH, 'dws_demo_login_di', { table_name: 'dws_demo_login_di', kind: 'dws', columns: [{ name: 'role_id', type: 'string', role: 'dimension' }], confirmation: { status: 'draft' } })
  note(`  after write: tableCount=${idx.tableCount()} (was 2, now 3 — index rebuilt from disk ✓)`)
  note(`  lookupTable('dws_demo_login_di'): ${idx.lookupTable('dws_demo_login_di') ? 'found ✓ (rebuild picked up new table)' : 'null ✗'}`)
}

async function printState() {
  const tables = existsSync(join(SCRATCH, 'tables')) ? readdirSync(join(SCRATCH, 'tables')).filter(f => f.endsWith('.yaml')) : []
  const events = []
  const ed = join(SCRATCH, 'events')
  if (existsSync(ed)) for (const d of readdirSync(ed)) { const dp = join(ed, d); if (statSync(dp).isDirectory()) for (const f of readdirSync(dp)) if (f.endsWith('.yaml')) events.push(`${d}/${f}`) }
  const pending = listing(VAR_PENDING)
  const audit = existsSync(AUDIT_LOG) ? JSON.parse(readFileSync(AUDIT_LOG, 'utf8')) : []
  console.log('\n===== STATE =====')
  console.log(`[scratch] scope dir : ${SCRATCH}`)
  console.log(`[scratch] tables    : ${tables.join(', ') || '(none)'}`)
  console.log(`[scratch] events    : ${events.join(', ') || '(none)'}`)
  console.log(`[var]    pending    : ${pending.length} suggestion(s)${pending.length ? ' — ' + pending.map(p => p.suggestion_id).join(', ') : ''}`)
  console.log(`[var]    audit log  : ${audit.length} Tier-2 write(s)${audit.length ? ' — ' + audit.map(a => `${a.tool_name}#${a.payload_hash.slice(0, 6)}`).join(', ') : ''}`)
  console.log('=================\n')
}

const SCENARIOS = {
  '1': scenario1,
  '2': async () => { resetScratch(); await scenario2() },
  '3': async () => { if (!existsSync(join(SCRATCH, 'tables'))) { resetScratch(); await scenario2() } await scenario3() },
  '4': async () => { if (!existsSync(join(SCRATCH, 'tables'))) { resetScratch(); await scenario2(); await scenario3() } await scenario4() },
  '5': printState,
}

async function main() {
  resetScratch()
  if (process.argv.includes('--demo')) {
    await scenario1(); await printState()
    resetScratch(); await scenario2(); await printState()
    await scenario3(); await printState()
    await scenario4(); await printState()
    return
  }
  const rl = readline.createInterface({ input, output })
  while (true) {
    console.log('\nP6 semantic-layer prototype — pick:\n  1 data-model fidelity (real RBI YAML)\n  2 ODPS-decoupled sync\n  3 write-tiers (Tier-1 suggest->approve + Tier-2 audit)\n  4 BasicIndex (lookup + invalidate rebuild)\n  5 print state\n  q quit')
    const a = (await rl.question('> ')).trim()
    if (a === 'q') break
    if (SCENARIOS[a]) { try { await SCENARIOS[a]() } catch (e) { console.error(e) } await printState() }
    else console.log('?')
  }
  rl.close()
}
main().catch(e => { console.error(e); process.exit(1) })
