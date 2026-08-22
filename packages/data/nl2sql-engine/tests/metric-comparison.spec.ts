import { test, expect } from 'vitest'
import { METRIC_EVAL_CASES, METRIC_FIXTURE_DS } from '../src/eval/metric-cases.ts'
import { runMetricComparisonEval } from '../src/eval/metric-comparison-runner.ts'

test('D4 — runMetricComparisonEval runs >=5 metric cases Level 2.5 vs Level 2', async () => {
  expect(METRIC_EVAL_CASES.length).toBeGreaterThanOrEqual(5)
  const r = await runMetricComparisonEval({ cases: METRIC_EVAL_CASES, dataSources: METRIC_FIXTURE_DS })
  expect(r.level25.total).toBe(METRIC_EVAL_CASES.length)
  expect(r.level2.total).toBe(METRIC_EVAL_CASES.length)
  // Level 2.5 bypasses the LLM on pure-metric cases (deterministic)
  expect(r.level25.llmCalls).toBe(0)
  // Level 2 (metrics stripped => no metric hit => normal LLM loop) calls the LLM
  expect(r.level2.llmCalls).toBeGreaterThan(0)
})
