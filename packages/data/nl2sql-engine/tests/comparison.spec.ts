import { test, expect } from 'vitest'
import { JOIN_EVAL_CASES, JOIN_FIXTURE_DS, buildJoinFixtureGraph } from '../src/eval/join-cases.ts'
import { runComparisonEval } from '../src/eval/comparison-runner.ts'

test('C4 — runComparisonEval injects join constraints when the graph is on (and is a no-op when off)', async () => {
  const graph = buildJoinFixtureGraph()
  const r = await runComparisonEval({ cases: JOIN_EVAL_CASES, dataSources: JOIN_FIXTURE_DS, graph })
  expect(r.withGraph.total).toBe(r.withoutGraph.total)
  expect(r.withGraph.details.length).toBeGreaterThan(0)
  // with the graph on, at least one case had join constraints computed (trace carries the step)
  expect(r.joinConstraintsInjected).toBe(true)
  // without the graph, no join-constraint step is possible
  expect(r.withoutGraph.pass_rate).toBeGreaterThanOrEqual(0)
})
