/**
 * P3 C4 comparison runner — runs a join eval case set twice (graph ON vs OFF)
 * to surface the ontology's structural effect (join-constraint injection +
 * undeclared-JOIN critic). See the honest note below on scripted-LLM limits.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/comparison-runner
 */
import { EVAL_CASES, FIXTURE_EVENT_DEF, type EvalCase } from './cases.ts'
import { Nl2sqlEngine, type EngineDeps } from '../engine.ts'
import { ReplayLlm } from '../replay-llm.ts'
import { StandInOdps } from '../stand-in-odps.ts'
import { scoreMatch } from './scorer.ts'
import { type EvalResult, type EvalDetail } from './runner.ts'
import type { RelationGraphLike } from '../ontology.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { QueryOutcome } from '../types.ts'

/** The comparison eval result: graph-on vs graph-off eval results + whether join constraints were injected. */
export interface ComparisonResult {
  readonly withGraph: EvalResult
  readonly withoutGraph: EvalResult
  /** true iff at least one with-graph case's trace carried a join constraint. */
  readonly joinConstraintsInjected: boolean
}

/**
 * Run an eval case set twice — once with the live graph (ontology on) and once
 * without (ontology off) — to compare multi-table join behavior (P3 C4).
 *
 * Honest note: scripted LLMs return fixed SQL per question, so pass-rates are
 * driven by the scripted SQL + ODPS, not by the ontology steering the LLM.
 * The ontology value here is demonstrated structurally — join constraints are
 * injected into the prompt when the graph is on (`joinConstraintsInjected`),
 * and the undeclared-JOIN critic fires on bad joins. A real accuracy delta
 * requires live-LLM eval (P11); this runner surfaces the mechanism.
 * @param options - the eval case set, data sources, and live relation graph to compare.
 * @returns the graph-on vs graph-off comparison result (pass-rates + whether join constraints were injected).
 */
export async function runComparisonEval(options: {
  cases?: readonly EvalCase[]
  dataSources: readonly DataSourceDoc[]
  graph: RelationGraphLike
}): Promise<ComparisonResult> {
  const { cases = EVAL_CASES, dataSources, graph } = options
  const runSet = async (graphDep?: RelationGraphLike): Promise<{ result: EvalResult; injected: boolean }> => {
    let pass = 0
    const details: EvalDetail[] = []
    let injected = false
    for (const c of cases) {
      const llm = new ReplayLlm({ [c.question]: c.llm })
      const scripted: Record<string, QueryOutcome> = c.odps ? { [c.odps.sub]: c.odps.out } : {}
      const odps = new StandInOdps(scripted)
      const deps: EngineDeps = {
        dataSources,
        llm,
        odps,
        ...(graphDep !== undefined ? { graph: graphDep } : {}),
      }
      const engine = new Nl2sqlEngine(deps)
      const r = await engine.run({ question: c.question, eventDef: FIXTURE_EVENT_DEF })
      const ok = scoreMatch(r, c.expected)
      if (ok) pass += 1
      details.push({ id: c.id, ok, sql: r.sql, decline: r.decline, reason: r.reason })
      if (r.trace.some(t => t.step === 'join_constraints')) injected = true
    }
    return {
      result: { pass, total: cases.length, pass_rate: cases.length > 0 ? pass / cases.length : 0, details },
      injected,
    }
  }
  const withG = await runSet(graph)
  const withoutG = await runSet(undefined)
  return { withGraph: withG.result, withoutGraph: withoutG.result, joinConstraintsInjected: withG.injected }
}
