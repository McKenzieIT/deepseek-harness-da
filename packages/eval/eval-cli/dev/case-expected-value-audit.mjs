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
 * Scope: only `match_mode: scalar_exact` cases with a numeric expected value are
 * checked; multi-row/array expectations are reported SKIPPED rather than guessed
 * at (comparing those faithfully means mirroring the runner's row-set matcher).
 *
 * Usage:
 *   ONLY_DS=event|dws|all CONC=3 node packages/eval/eval-cli/dev/case-expected-value-audit.mjs [caseDir]
 *
 * Requires the curated case set (not git-tracked) + a working `maxc` config.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'

const CASE_DIR = process.argv[2] ?? '/Users/mckenzie/workspace/dsh-eventdef/packages/eval/eval/cases/rbi-10000251-exec'
const MAXC = join(homedir(), 'Library/Python/3.13/bin/maxc')
const CONFIG = join(homedir(), '.maxc/config_ieu_cdm.yaml')
const ONLY = process.env.ONLY_DS ?? 'event'   // 'event' | 'dws' | 'all'
const CONC = Number(process.env.CONC ?? 3)
const TODAY = '20260806'

function shiftDays(yyyymmdd, delta) {
  const y = Number(yyyymmdd.slice(0, 4)), m = Number(yyyymmdd.slice(4, 6)) - 1, d = Number(yyyymmdd.slice(6, 8))
  const dt = new Date(Date.UTC(y, m, d + delta))
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`
}
const SUBS = { ds_yesterday: shiftDays(TODAY, -1), ds_7d_ago: shiftDays(TODAY, -7) }

function runSql(sql) {
  return new Promise((resolve) => {
    const child = spawn(MAXC, ['--config', CONFIG, 'query', 'run', '--wait', '300', '--stdin', '--json'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', () => {})
    child.on('error', e => resolve({ _error: e.message }))
    child.on('close', () => {
      try { resolve(JSON.parse(out)) } catch { resolve({ _error: out.slice(0, 200) }) }
    })
    child.stdin.write(sql)
    child.stdin.end()
  })
}

const cases = []
for (const f of readdirSync(CASE_DIR).filter(n => n.endsWith('.yaml')).sort()) {
  const doc = yaml.load(readFileSync(join(CASE_DIR, f), 'utf8'))
  const ds = doc?.dimensions?.data_source
  if (ONLY !== 'all' && ds !== ONLY) continue
  const sqlRaw = doc?.expected?.sql
  if (typeof sqlRaw !== 'string') continue
  const sql = sqlRaw.replace(/\{\{(\w+)\}\}/g, (m, k) => SUBS[k] ?? m).trim().replace(/;\s*$/, '')
  cases.push({
    id: doc.case_id.replace('eval_10000251_', ''),
    ds,
    question: doc.input?.question ?? '',
    expected: doc?.expected?.result_value?.value,
    matchMode: doc?.expected?.match_mode,
    sql,
  })
}

console.log(`auditing ${cases.length} cases (data_source=${ONLY}), subs=${JSON.stringify(SUBS)}\n`)

const results = []
let cursor = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) {
    const i = cursor++
    const c = cases[i]
    if (c === undefined) return
    const env = await runSql(c.sql)
    const rows = env?.data?.result?.rows ?? env?.data?.rows ?? null
    const err = env?._error ?? env?.error?.message ?? null
    const first = Array.isArray(rows) && rows.length > 0 ? Object.values(rows[0])[0] : null
    results.push({ ...c, live: first, rowCount: Array.isArray(rows) ? rows.length : null, err, rows })
    console.log(`[${c.id}] live=${JSON.stringify(first)} expected=${JSON.stringify(c.expected)} rows=${Array.isArray(rows) ? rows.length : '?'}${err ? ' ERR=' + String(err).slice(0, 90) : ''}`)
  }
}))

results.sort((a, b) => a.id.localeCompare(b.id))
console.log('\n=== audit ===')
let ok = 0, mismatch = 0, unknown = 0
for (const r of results) {
  const isScalar = r.matchMode === 'scalar_exact'
  let verdict
  if (r.err !== null) { verdict = 'SQL_ERROR'; unknown++ }
  else if (!isScalar || typeof r.expected !== 'number') { verdict = `SKIPPED(multi-row/non-numeric)`; unknown++ }
  else if (Number(r.live) === Number(r.expected)) { verdict = 'MATCH'; ok++ }
  else { verdict = 'STALE_EXPECTED'; mismatch++ }
  console.log(`${verdict.padEnd(20)} ${r.id} expected=${JSON.stringify(r.expected)} live=${JSON.stringify(r.live)}  ${r.question}`)
}
console.log(`\nMATCH=${ok}  STALE_EXPECTED=${mismatch}  SKIPPED=${unknown}  (of ${results.length})`)
