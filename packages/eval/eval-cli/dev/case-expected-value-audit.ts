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
 * Cases load through `loadCase`, and reference SQL resolves through
 * `resolveReferenceSql`, so this reconciliation and the grader read the corpus
 * the same way: each case's placeholders bind to its own `meta.anchor_ds`, and a
 * template that cannot be resolved is reported rather than executed unresolved.
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
 * would silently reconcile against the wrong data). `MAXC_BIN` overrides the
 * `maxc` executable, otherwise it resolves from `PATH`.
 */
import { readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { loadCase, resolveReferenceSql } from '@deepseek-ai/dsh-eval'

const CASE_DIR = process.argv[2] ?? join(import.meta.dirname, '../../eval/cases/rbi-10000251-exec')
const MAXC = process.env.MAXC_BIN ?? 'maxc'
const CONFIG = requireMaxcConfig()
const ONLY = process.env.ONLY_DS ?? 'event'   // 'event' | 'dws' | 'all'
const CONC = Number(process.env.CONC ?? 3)
const WAIT_SECONDS = Number(process.env.MAXC_WAIT_SECONDS ?? 300)

/**
 * Read `MAXC_CONFIG`, refusing to run without it: the config selects the
 * warehouse project, so a default would reconcile against the wrong data.
 * @returns the config path.
 */
function requireMaxcConfig(): string {
  const configPath = process.env.MAXC_CONFIG
  if (configPath === undefined || configPath === '') {
    throw new Error('MAXC_CONFIG must name a maxc config file (it selects the warehouse project)')
  }
  return configPath
}

/** One `maxc query run --json` envelope, or a local failure to invoke it. */
type MaxcEnvelope = {
  data?: { result?: { rows?: unknown[] }; rows?: unknown[] }
  error?: { message?: string }
  _error?: string
}

/**
 * Run one SQL statement through the `maxc` CLI.
 * @param sql - executable SQL (placeholders already resolved).
 * @returns the parsed envelope, or `{ _error }` when maxc could not be invoked or its output was not JSON.
 */
function runSql(sql: string): Promise<MaxcEnvelope> {
  return new Promise((resolve) => {
    const child = spawn(MAXC, ['--config', CONFIG, 'query', 'run', '--wait', String(WAIT_SECONDS), '--stdin', '--json'])
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d })
    child.stderr.on('data', () => {})
    child.on('error', (e: Error) => resolve({ _error: e.message }))
    child.on('close', () => {
      try { resolve(JSON.parse(out) as MaxcEnvelope) } catch { resolve({ _error: out.slice(0, 200) }) }
    })
    child.stdin.write(sql)
    child.stdin.end()
  })
}

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
console.log(`maxc=${MAXC} config=${CONFIG} wait=${WAIT_SECONDS}s conc=${CONC}\n`)
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
    const env = await runSql(c.sql)
    const rows = env.data?.result?.rows ?? env.data?.rows ?? null
    const err = env._error ?? env.error?.message ?? null
    const first = Array.isArray(rows) && rows.length > 0 ? Object.values(rows[0] as Record<string, unknown>)[0] : null
    results.push({ ...c, live: first, rowCount: Array.isArray(rows) ? rows.length : null, err })
    console.log(`[${c.id}] live=${JSON.stringify(first)} expected=${JSON.stringify(c.expected)} rows=${Array.isArray(rows) ? rows.length : '?'}${err === null ? '' : ' ERR=' + err.slice(0, 90)}`)
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
