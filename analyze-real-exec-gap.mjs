// GA-EVAL-REAL-EXEC gap analysis: real-exec execution_match vs dual-score
// sql_judge (judge blind to query_result) within ONE real-exec run.
//
// The dual-score judge (runner.ts executeAttempt) runs {question, generated_sql,
// schema_context} — NO query_result — so its score is identical to a standalone
// judge-only run on the same SQL. Thus the judge ceiling + the judge false-pass
// gap are derivable from the real-exec run's own sql_judge fields.
//
// Precision (ticket): "judge false-pass" = judge passed (all-k score >= 0.6)
// AND verdict='wrong' (real-executed value genuinely WRONG) — NOT
// 'infra_failure' (SQL may be right, ODPS/infra failed) — infra is reported
// separately as contamination, not counted in the gap.
//
// Usage: node /tmp/analyze-real-exec-gap.mjs <result.json> <cases-dir>
import { readFileSync, readdirSync } from 'node:fs'
import { load as parseYaml } from 'js-yaml'

const resultPath = process.argv[2]
const casesDir = process.argv[3]
if (!resultPath || !casesDir) {
  console.error('Usage: node analyze-real-exec-gap.mjs <result.json> <cases-dir>')
  process.exit(1)
}

const result = JSON.parse(readFileSync(resultPath, 'utf8'))

// Load case yamls -> case_id -> { query_intent, sql_complexity, expected }
const caseMap = new Map()
for (const f of readdirSync(casesDir).filter(f => /\.(yaml|yml)$/.test(f))) {
  const raw = parseYaml(readFileSync(`${casesDir}/${f}`, 'utf8'))
  caseMap.set(raw.case_id, raw)
}

const JUDGE_PASS = 0.6
const cases = result.cases

let realExecPass = 0, realExecWrong = 0, realExecInfra = 0, realExecUnjudged = 0
let judgePass = 0
let judgeFalsePass = 0      // judge passed AND verdict='wrong' (the ticket's measure)
let judgePassButInfra = 0   // judge passed AND verdict='infra_failure' (not a false-pass)
const perIntent = {}
const falsePassCases = []
const infraCases = []

for (const c of cases) {
  const meta = caseMap.get(c.case_id)
  const intent = meta?.dimensions?.query_intent ?? 'unknown'
  const complexity = meta?.dimensions?.sql_complexity ?? '?'
  perIntent[intent] ??= { total: 0, realPass: 0, judgePass: 0, judgeFalsePass: 0, infra: 0 }
  const I = perIntent[intent]
  I.total++

  const realPass = c.verdict === 'correct'
  if (realPass) { realExecPass++; I.realPass++ }
  else if (c.verdict === 'wrong') { realExecWrong++ }
  else if (c.verdict === 'infra_failure') { realExecInfra++; I.infra++; infraCases.push(c.case_id) }
  else { realExecUnjudged++ }

  const attempts = c.pass_k_results || []
  const judgePassed = attempts.length > 0 && attempts.every(a => a.sql_judge && typeof a.sql_judge.score === 'number' && a.sql_judge.score >= JUDGE_PASS)
  if (judgePassed) { judgePass++; I.judgePass++ }

  if (judgePassed && !realPass) {
    if (c.verdict === 'wrong') { judgeFalsePass++; I.judgeFalsePass++; falsePassCases.push(c.case_id) }
    else if (c.verdict === 'infra_failure') { judgePassButInfra++ }
  }
}

const total = cases.length
const pct = (n) => total > 0 ? (n / total * 100).toFixed(1) : '0.0'
const cfg = result.config || {}

console.log(`Run: ${result.run_id}`)
console.log(`Timestamp: ${result.timestamp}`)
console.log(`Total cases: ${total}`)
console.log(`Config: with_query=${cfg.with_query} verdict_semantics=${cfg.verdict_semantics} pass_k=${cfg.pass_k} concurrency=${cfg.concurrency} today=${cfg.today} scope_id=${cfg.scope_id} model=${cfg.provider}/${cfg.model}`)
console.log()
console.log('=== Overall ===')
console.log(`real-exec pass_rate  (verdict=correct):        ${realExecPass}/${total} = ${pct(realExecPass)}%`)
console.log(`judge pass_rate (dual-score, execution-blind): ${judgePass}/${total} = ${pct(judgePass)}%`)
console.log(`real-exec wrong (value mismatch):              ${realExecWrong}/${total} = ${pct(realExecWrong)}%`)
console.log(`real-exec infra_failure (ODPS/infra):          ${realExecInfra}/${total} = ${pct(realExecInfra)}%`)
console.log(`real-exec unjudged:                            ${realExecUnjudged}/${total} = ${pct(realExecUnjudged)}%`)
console.log()
console.log('=== Gap (the ticket measure: judge false-pass rate) ===')
console.log(`judge false-pass (judge pass AND real-exec wrong): ${judgeFalsePass}/${total} = ${pct(judgeFalsePass)}pp`)
console.log(`  = judge pass_rate - real-exec pass_rate = ${(judgePass/total*100 - realExecPass/total*100).toFixed(1)}pp (if 0 infra)` + (realExecInfra > 0 ? ` [NOTE: ${realExecInfra} infra cases excluded from gap; raw arith gap = ${(judgePass/total*100 - realExecPass/total*100).toFixed(1)}pp]` : ''))
console.log(`judge-pass-but-infra (not a false-pass):           ${judgePassButInfra}/${total}`)
console.log()
console.log('=== Per-intent ===')
console.log('  ' + 'intent'.padEnd(22) + 'total'.padStart(5) + ' real'.padStart(5) + ' judge'.padStart(6) + ' gap'.padStart(6) + ' infra'.padStart(6))
console.log('  ' + '─'.repeat(50))
for (const [intent, s] of Object.entries(perIntent).sort((a, b) => b[1].total - a[1].total)) {
  const r = s.total > 0 ? (s.realPass / s.total * 100) : 0
  const j = s.total > 0 ? (s.judgePass / s.total * 100) : 0
  const g = s.judgeFalsePass // count (small n -> show count not pct)
  console.log('  ' + intent.padEnd(22) + String(s.total).padStart(5) + String(s.realPass).padStart(5) + String(s.judgePass).padStart(6) + String(g).padStart(6) + String(s.infra).padStart(6))
}
console.log()
console.log(`=== Judge false-pass case_ids (${falsePassCases.length}) ===`)
console.log(falsePassCases.length ? falsePassCases.sort().join('\n') : '(none)')
console.log()
console.log(`=== Infra_failure case_ids (${infraCases.length}) ===`)
console.log(infraCases.length ? infraCases.sort().join('\n') : '(none)')
