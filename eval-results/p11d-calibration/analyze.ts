/**
 * Analyze P11d calibration results: pass rate + per-dimension breakdown.
 * Usage: npx tsx eval-results/p11d-calibration/analyze.ts eval-results/p11d-calibration/p11d-calibration-fewshot.json
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('Usage: npx tsx analyze.ts <result.json>')
  process.exit(1)
}

interface SqlJudge {
  score: number
  rationale: string
  dimensions: Record<string, 0 | 1>
}

interface Attempt {
  attempt_k: number
  execution_match?: boolean
  delivery_match?: boolean
  sql_judge?: SqlJudge
  generated_sql?: string | null
}

interface Case {
  case_id: string
  pass_k_results: Attempt[]
  verdict: string
  latency_ms: number
}

interface Result {
  run_id: string
  timestamp: string
  cases: Case[]
  summary: { total: number; correct: number; wrong: number; pass_rate: number }
}

const data: Result = JSON.parse(readFileSync(path, 'utf8'))

// Overall pass rate (execution_match based)
console.log(`\n=== P11d Calibration Results ===`)
console.log(`Run: ${data.run_id}`)
console.log(`Cases: ${data.summary.total}`)
console.log(`Pass rate (execution_match): ${(data.summary.pass_rate * 100).toFixed(1)}%`)
console.log(`  correct: ${data.summary.correct}  wrong: ${data.summary.wrong}`)

// SQL Judge analysis
const judged: SqlJudge[] = []
for (const c of data.cases) {
  const a = c.pass_k_results[0]
  if (a?.sql_judge) judged.push(a.sql_judge)
}

console.log(`\n--- SQL Judge Breakdown ---`)
console.log(`Cases with sql_judge: ${judged.length}/${data.summary.total}`)

if (judged.length === 0) {
  console.log('(no sql_judge verdicts found)')
  process.exit(0)
}

// Pass rate by judge threshold (0.6)
const judgePass = judged.filter(j => j.score >= 0.6).length
console.log(`Judge pass rate (>=0.6): ${(judgePass / judged.length * 100).toFixed(1)}% (${judgePass}/${judged.length})`)

// Per-dimension breakdown
const dims = ['table_selection', 'field_selection', 'filter_conditions', 'aggregation_logic', 'overall_semantics']
console.log(`\nPer-dimension pass rates:`)
for (const dim of dims) {
  const passed = judged.filter(j => j.dimensions[dim] === 1).length
  const rate = (passed / judged.length * 100).toFixed(1)
  console.log(`  ${dim.padEnd(20)} ${rate}% (${passed}/${judged.length})`)
}

// Score distribution
const buckets = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
console.log(`\nScore distribution:`)
for (let i = 0; i < buckets.length - 1; i++) {
  const lo = buckets[i]!
  const hi = buckets[i + 1]!
  const count = judged.filter(j => j.score >= lo && j.score < hi).length
  console.log(`  [${lo.toFixed(1)}, ${hi.toFixed(1)}): ${count}`)
}
const perfect = judged.filter(j => j.score === 1.0).length
console.log(`  [1.0, 1.0]: ${perfect}`)
