/**
 * P4 D4 metric comparison runner — runs metric eval cases two ways:
 *  - level25: engine WITH a partitionResolver (pure-metric cases short-circuit to
 *    deterministic Level 2.5 execution — 0 LLM calls).
 *  - level2: engine with the metric corpus items STRIPPED (no metric hit => route
 *    null => normal LLM loop — LLM is called).
 *
 * Honest note: stripping metrics is the mechanism to force the LLM path (the engine
 * has no "force Level 2" flag). The signal is `level25.llmCalls === 0` (deterministic)
 * vs `level2.llmCalls > 0` (LLM-driven). A real accuracy delta needs live-LLM eval (P11);
 * the scripted-LLM pass-rates are an artifact of the corpus, not ontology steering.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/metric-comparison-runner
 */
import { FIXTURE_EVENT_DEF, type EvalCase } from './cases.ts'
import { Nl2sqlEngine, type EngineDeps } from '../engine.ts'
import { ReplayLlm } from '../replay-llm.ts'
import { StandInOdps } from '../stand-in-odps.ts'
import { scoreMatch } from './scorer.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { QueryOutcome } from '../types.ts'

export interface MetricEvalResult {
  readonly pass: number
  readonly total: number
  readonly pass_rate: number
  readonly llmCalls: number
}
export interface MetricComparisonResult {
  readonly level25: MetricEvalResult
  readonly level2: MetricEvalResult
}

/** Resolve a metric source's partition columns for the Level 2.5 run. */
function fixturePartitionResolver(tableName: string): readonly string[] {
  return tableName.includes('ods_login') || tableName.includes('dws_') ? ['ds'] : []
}

export async function runMetricComparisonEval(options: {
  cases: readonly EvalCase[]
  dataSources: readonly DataSourceDoc[]
}): Promise<MetricComparisonResult> {
  const { cases, dataSources } = options
  const run = async (resolver: ((t: string) => readonly string[]) | undefined, stripMetrics: boolean): Promise<MetricEvalResult> => {
    let pass = 0
    let llmCalls = 0
    const corpus = stripMetrics ? dataSources.filter(d => (d.payload as { kind?: string } | undefined)?.kind !== 'metric') : dataSources
    for (const c of cases) {
      const llm = new ReplayLlm({ [c.question]: c.llm })
      const scripted: Record<string, QueryOutcome> = c.odps ? { [c.odps.sub]: c.odps.out } : {}
      const odps = new StandInOdps(scripted)
      const deps: EngineDeps = {
        dataSources: corpus,
        llm,
        odps,
        ...(resolver !== undefined ? { partitionResolver: resolver } : {}),
      }
      const engine = new Nl2sqlEngine(deps)
      const r = await engine.run({
        question: c.question,
        eventDef: FIXTURE_EVENT_DEF,
        ...(c.today !== undefined ? { today: c.today } : {}),
      })
      if (scoreMatch(r, c.expected)) pass += 1
      llmCalls += llm.callCount
    }
    return { pass, total: cases.length, pass_rate: cases.length > 0 ? pass / cases.length : 0, llmCalls }
  }
  const level25 = await run(fixturePartitionResolver, false)
  const level2 = await run(undefined, true)
  return { level25, level2 }
}
