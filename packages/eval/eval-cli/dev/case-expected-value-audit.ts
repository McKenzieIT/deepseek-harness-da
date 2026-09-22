/**
 * Case-set instrument check — is `expected.result_value` still what
 * `expected.sql` actually returns?
 *
 * real-exec scoring compares the agent's rows against `expected.result_value`
 * (`scalar_exact`); `expected.sql` is reference documentation that the runner
 * never executes. Nothing keeps the two in sync, so a case whose value was
 * captured months ago can become unpassable by ANY agent — and the failure is
 * indistinguishable from the agent computing a wrong number. This runs each
 * case's own reference SQL live and reports where they have parted ways.
 *
 * Found by GA-EVAL-EVENTDEF-PREFETCH (2026-09-06), which needed it: (a) made the
 * eval agent emit case 119's reference SQL byte-for-byte and the case still
 * scored `wrong`. Result on rbi-10000251-exec at that date, anchor ds=20260805:
 *
 *   data_source=event : MATCH=2  STALE=16 (of 18)   ← both matches are 0 == 0
 *   data_source=dws   : MATCH=13 STALE=0  (of 21)   ← 8 skipped (multi-row)
 *
 * i.e. the DWS summary tables still answer exactly what was recorded a month
 * earlier, while the raw event ODS view has drifted on every non-zero case. Two
 * of the drifted values (119: 552, 136: 482) are numbers an earlier session had
 * recorded as the AGENT's wrong answers.
 *
 * Cases load through `loadCase`, reference SQL resolves through
 * `resolveReferenceSql`, and execution goes through the same `ctx.query`
 * capability and executor port the grader uses — so this reconciliation and a
 * graded run read the corpus and reach the warehouse the same way. Each case's
 * placeholders bind to its own `meta.anchor_ds`, and a template that cannot be
 * resolved is reported rather than executed unresolved.
 *
 * Scope: only `match_mode: scalar_exact` cases with a numeric expected value are
 * checked; multi-row/array expectations are reported SKIPPED rather than guessed
 * at (comparing those faithfully means mirroring the runner's row-set matcher).
 *
 * Usage:
 *   MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml MAXC_WAIT_SECONDS=300 ONLY_DS=event|dws|all CONC=3 \
 *     node --import tsx/esm packages/eval/eval-cli/dev/case-expected-value-audit.ts [caseDir]
 *
 * `MAXC_CONFIG` is required (it selects the warehouse project, so defaulting it
 * would silently reconcile against the wrong data). `--sidecar`'s equivalent is
 * `MAXC_SIDECAR`: it must point at the real `maxc-sidecar.mjs`, because the
 * boot default is a throwaway stand-in that owns no warehouse.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCase, resolveReferenceSql, executeAndNormalize, resolveComparatorPolicy } from '@deepseek-ai/dsh-eval'
import { boot } from '../src/context.ts'

const CASE_DIR = process.argv[2] ?? join(import.meta.dirname, '../../eval/cases/rbi-10000251-exec')
const ONLY = process.env.ONLY_DS ?? 'event'   // 'event' | 'dws' | 'all'
const CONC = Number(process.env.CONC ?? 3)
const SCOPE_ID = process.env.EVAL_SCOPE_ID ?? '10000251'

if ((process.env.MAXC_CONFIG ?? '') === '') {
  throw new Error('MAXC_CONFIG must name a maxc config file (it selects the warehouse project)')
}
const SIDECAR = process.env.MAXC_SIDECAR
if (SIDECAR === undefined || SIDECAR === '') {
  throw new Error('MAXC_SIDECAR must point at query-maxcompute/dev/maxc-sidecar.mjs; the boot default is a stand-in that owns no warehouse')
}

// Row cap and column semantics do not affect this reconciliation — it reads the
// first cell of the first row — but the policy is a required, explicit input.
const policy = resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 200 })

const { collaborators, executorIdentity } = await boot({
  schemaDir: join(import.meta.dirname, '../../../../examples/k11-semantic-layer'),
  provider: 'dashscope',
  model: 'qwen3.7-max',
  today: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
  withQuery: true,
  noSqlJudge: true,
  queryExpansion: false,
  scopeId: SCOPE_ID,
  sidecarPath: SIDECAR,
})
const executor = collaborators.executor
if (executor === null || executor === undefined) throw new Error('boot mounted no query executor')

/** A case queued for reconciliation, with its reference SQL already resolved. */
type AuditCase = {
  id: string
  ds: unknown
  question: string
  expected: unknown
  matchMode: string | null
  sql: string
}

const cases: AuditCase[] = []
/** Cases whose reference SQL could not be resolved — reported, never executed unresolved. */
const unresolvable: string[] = []

for (const f of readdirSync(CASE_DIR).filter(n => n.endsWith('.yaml')).sort()) {
  const c = loadCase(join(CASE_DIR, f))
  const ds = c.dimensions.data_source
  if (ONLY !== 'all' && ds !== ONLY) continue
  const resolved = resolveReferenceSql(c)
  if (resolved.kind === 'absent') continue
  if (resolved.kind === 'unresolvable') {
    unresolvable.push(`${c.case_id}: ${resolved.reason} — ${resolved.detail}`)
    continue
  }
  cases.push({
    id: c.case_id.replace('eval_10000251_', ''),
    ds,
    question: c.input.question,
    expected: c.expected.result_value?.value,
    matchMode: c.expected.match_mode,
    sql: resolved.sql.trim().replace(/;\s*$/, ''),
  })
}

console.log(`auditing ${cases.length} cases (data_source=${ONLY}) from ${CASE_DIR}`)
console.log(`executor=${executorIdentity ?? 'none'} config=${process.env.MAXC_CONFIG} wait=${process.env.MAXC_WAIT_SECONDS ?? '60'}s conc=${CONC}\n`)
if (unresolvable.length > 0) console.log(`UNRESOLVABLE (${unresolvable.length}):\n  ${unresolvable.join('\n  ')}\n`)

/** One reconciled case: its recorded expectation beside what its reference SQL returns now. */
type AuditResult = AuditCase & { live: unknown; rowCount: number | null; err: string | null }

const results: AuditResult[] = []
let cursor = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) {
    const i = cursor++
    const c = cases[i]
    if (c === undefined) return
    const artifact = await executeAndNormalize(executor, c.sql, policy)
    const rows = artifact.kind === 'completed' ? artifact.rows : null
    const err = artifact.kind === 'completed' ? null : artifact.error
    const first = rows !== null && rows.length > 0 ? Object.values(rows[0]!)[0] : null
    results.push({ ...c, live: first, rowCount: rows === null ? null : artifact.rowCount, err })
    console.log(`[${c.id}] live=${JSON.stringify(first)} expected=${JSON.stringify(c.expected)} rows=${rows === null ? '?' : rows.length}${err === null ? '' : ' ERR=' + err.slice(0, 90)}`)
  }
}))

results.sort((a, b) => a.id.localeCompare(b.id))
console.log('\n=== audit ===')
let ok = 0, mismatch = 0, unknown = 0
for (const r of results) {
  const isScalar = r.matchMode === 'scalar_exact'
  let verdict
  if (r.err !== null) { verdict = 'SQL_ERROR'; unknown++ }
  else if (!isScalar || typeof r.expected !== 'number') { verdict = 'SKIPPED(multi-row/non-numeric)'; unknown++ }
  else if (Number(r.live) === Number(r.expected)) { verdict = 'MATCH'; ok++ }
  else { verdict = 'STALE_EXPECTED'; mismatch++ }
  console.log(`${verdict.padEnd(20)} ${r.id} expected=${JSON.stringify(r.expected)} live=${JSON.stringify(r.live)}  ${r.question}`)
}
console.log(`\nMATCH=${ok}  STALE_EXPECTED=${mismatch}  SKIPPED=${unknown}  (of ${results.length})`)
if (unresolvable.length > 0) console.log(`UNRESOLVABLE=${unresolvable.length}`)
// The mounted sidecar is a live subprocess; exit rather than waiting on it.
process.exit(0)
