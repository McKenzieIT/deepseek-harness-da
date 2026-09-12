/** Deterministic eval runner for the model-visible trigger_eval summary snapshot. */

import type { Context } from '@deepseek-ai/cordis'
import type { EvalRunnerService } from '@deepseek-ai/dsh-tool-trigger-eval'
import type { CaseVerdict, RunConfig, RunResult } from '@deepseek-ai/dsh-eval-runner'

export const name = 'trigger-eval-summary-fixture'

const CONFIG: RunConfig = {
  provider: 'snapshot',
  model: 'snapshot-model',
  pass_k: 1,
  concurrency: 1,
  sql_judge: false,
  verdict_semantics: 'pass^k',
  responder: 'engine',
  scope_id: 'snapshot-scope',
  today: '20260912',
  query_expansion: false,
  with_query: false,
  comparator_policy_version: 2,
  column_semantics: 'by-name',
  max_stored_rows: 200,
  skip_health_gate: true,
}

const VERDICTS: readonly CaseVerdict['verdict'][] = [
  'correct',
  'correct',
  'correct',
  'correct',
  'correct',
  'correct',
  'correct',
  'wrong',
  'declined',
  'unjudged',
  'infra_failure',
  'case_defect',
]

function runResult(): RunResult {
  const cases = VERDICTS.map((verdict, index): CaseVerdict => ({
    case_id: `snapshot-${String(index + 1)}`,
    pass_k_results: [],
    verdict,
    latency_ms: 0,
  }))
  return {
    run_id: 'snapshot-run',
    timestamp: '2026-09-12T00:00:00.000Z',
    cases,
    summary: {
      total: 12,
      correct: 7,
      wrong: 1,
      declined: 1,
      unjudged: 1,
      infra_failure: 1,
      case_defect: 1,
      pass_rate: 7 / 9,
    },
    config: CONFIG,
  }
}

/** Provide a stable runner and bind the headless Agent to one test scope. */
export function apply(ctx: Context): void {
  const service: EvalRunnerService = {
    runBatch: async () => runResult(),
    getLastRun: () => null,
    computeDelta: () => ({
      run_a_id: 'unused-a',
      run_b_id: 'unused-b',
      flips: [],
      summary: { improved: 0, regressed: 0, unchanged: 0 },
    }),
    getCaseCount: () => VERDICTS.length,
    getResultsDir: () => '/tmp/snapshot-eval-results',
  }
  ctx.provide('evalRunner', service)
  ctx.on('agent/created', ({ agent }) => {
    Object.assign(agent.options, { scopeId: 'snapshot-scope' })
  })
}
