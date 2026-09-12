/**
 * Stdout summary formatter for eval run results.
 *
 * Outputs:
 *  1. Overall summary table (all runner verdict counts plus pass_rate)
 *  2. Per-intent breakdown (from case dimensions.query_intent)
 *  3. Top 5 failures (case_id + question excerpt)
 */
import type { RunResult, CaseVerdict } from '@deepseek-ai/dsh-eval-runner'
import type { EvalCase } from '@deepseek-ai/dsh-eval'

/**
 *  formatReport
 * @param result - result
 * @param cases - cases
 * @returns the result
 */
export function formatReport(result: RunResult, cases: readonly EvalCase[]): string {
  const lines: string[] = []
  const { summary } = result

  // ── Header ──
  lines.push(`\n  Eval Run: ${result.run_id}`)
  lines.push(`  Timestamp: ${result.timestamp}`)
  lines.push('')

  // ── Summary table ──
  lines.push(formatSummaryTable(summary))
  lines.push('')

  // ── Per-intent breakdown ──
  const intentBreakdown = buildIntentBreakdown(result.cases, cases)
  if (intentBreakdown.length > 0) {
    lines.push('  Per-Intent Breakdown:')
    lines.push('  ' + pad('intent', 20) + pad('total', 7) + pad('attrib', 7) + pad('correct', 9) + pad('wrong', 7) + pad('rate', 8))
    lines.push('  ' + '─'.repeat(58))
    for (const row of intentBreakdown) {
      const rate = row.attributable > 0 ? (row.correct / row.attributable * 100).toFixed(1) + '%' : '—'
      lines.push('  ' + pad(row.intent, 20) + pad(String(row.total), 7) + pad(String(row.attributable), 7) + pad(String(row.correct), 9) + pad(String(row.wrong), 7) + pad(rate, 8))
    }
    lines.push('')
  }

  // ── Top 5 failures ──
  const failures = result.cases.filter(c =>
    c.verdict === 'wrong'
    || c.verdict === 'unjudged'
    || c.verdict === 'infra_failure'
    || c.verdict === 'case_defect',
  )
  if (failures.length > 0) {
    lines.push('  Top Failures:')
    const top = failures.slice(0, 5)
    for (const f of top) {
      const evalCase = cases.find(c => c.case_id === f.case_id)
      const q = evalCase?.input.question ?? '?'
      const excerpt = q.length > 50 ? q.slice(0, 47) + '...' : q
      lines.push(`    ${f.case_id}  [${f.verdict}]  "${excerpt}"`)
    }
    if (failures.length > 5) {
      lines.push(`    ... and ${failures.length - 5} more`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

interface SummaryStats {
  total: number
  correct: number
  wrong: number
  declined: number
  unjudged: number
  infra_failure: number
  case_defect: number
  pass_rate: number
}

function formatSummaryTable(s: SummaryStats): string {
  const attributable = s.correct + s.wrong + s.declined
  const excluded = s.unjudged + s.infra_failure + s.case_defect
  const rate = (s.pass_rate * 100).toFixed(1)
  const lines = [
    '  ┌─────────────────────────────────────┐',
    `  │  total: ${pad(String(s.total), 5)}  attributable: ${pad(String(attributable), 4)} │`,
    `  │  correct: ${pad(`${s.correct}/${attributable}`, 8)} pass_rate: ${pad(rate + '%', 7)} │`,
    `  │  excluded: ${pad(String(excluded), 2)}                       │`,
    `  │  wrong: ${pad(String(s.wrong), 4)}  declined: ${pad(String(s.declined), 4)}      │`,
    `  │  infra_failure: ${pad(String(s.infra_failure), 3)}              │`,
    `  │  unjudged: ${pad(String(s.unjudged), 3)}  case_defect: ${pad(String(s.case_defect), 4)}│`,
    '  └─────────────────────────────────────┘',
  ]
  return lines.join('\n')
}

interface IntentRow {
  intent: string
  total: number
  attributable: number
  correct: number
  wrong: number
}

function buildIntentBreakdown(verdicts: readonly CaseVerdict[], cases: readonly EvalCase[]): IntentRow[] {
  const caseMap = new Map(cases.map(c => [c.case_id, c]))
  const intentMap = new Map<string, { total: number; attributable: number; correct: number; wrong: number }>()

  for (const v of verdicts) {
    const evalCase = caseMap.get(v.case_id)
    const rawIntent = evalCase?.dimensions.query_intent
    const intent = typeof rawIntent === 'string' ? rawIntent : 'unknown'
    const entry = intentMap.get(intent) ?? { total: 0, attributable: 0, correct: 0, wrong: 0 }
    entry.total++
    if (v.verdict === 'correct') entry.correct++
    if (v.verdict === 'wrong') entry.wrong++
    if (v.verdict === 'correct' || v.verdict === 'wrong' || v.verdict === 'declined') entry.attributable++
    intentMap.set(intent, entry)
  }

  return [...intentMap.entries()]
    .map(([intent, stats]) => ({ intent, ...stats }))
    .sort((a, b) => b.total - a.total)
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}
