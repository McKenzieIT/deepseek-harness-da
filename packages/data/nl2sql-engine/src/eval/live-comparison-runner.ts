/**
 * P3 live comparison runner — runs K11 join eval cases with a REAL LLM (not
 * scripted) twice: graph ON vs graph OFF. Scores structurally (does the SQL
 * reference the correct tables + join keys?) since no live ODPS is available.
 *
 * Usage:
 *   import { runLiveComparison } from './live-comparison-runner.ts'
 *   const result = await runLiveComparison({ llm, dataSources, graph })
 *
 * Falls back to scripted LLM when `llm` is not provided (caveat mode).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/live-comparison-runner
 */
import { K11_JOIN_CASES, scoreJoinStructural, type K11JoinCase } from './k11-join-cases.ts'
import { Nl2sqlEngine, type EngineDeps, type EngineRunResult } from '../engine.ts'
import { StandInOdps } from '../stand-in-odps.ts'
import type { RelationGraphLike } from '../ontology.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { Llm } from '../replay-llm.ts'

/** Per-case detail from the live comparison run. */
export interface LiveCaseDetail {
  readonly id: string
  readonly question: string
  readonly withGraph: { sql: string | undefined; joinCorrect: boolean; declined: boolean; traceHasConstraints: boolean }
  readonly withoutGraph: { sql: string | undefined; joinCorrect: boolean; declined: boolean }
}

/** Aggregate live comparison result. */
export interface LiveComparisonResult {
  readonly withGraphPassRate: number
  readonly withoutGraphPassRate: number
  readonly delta: number
  readonly cases: readonly LiveCaseDetail[]
  readonly joinConstraintsInjected: boolean
  readonly isLiveLlm: boolean
}

/**
 * Run a live comparison eval: each K11 join case is run twice (graph ON/OFF)
 * with the provided LLM, corpus, and graph. Scoring is structural — does the
 * SQL reference the expected tables + join key?
 *
 * A permissive StandInOdps is used (returns dummy success for any SQL) since
 * this runner measures join-awareness, not query-result correctness.
 *
 * @param options - LLM, corpus, graph, and optional case/resolver overrides.
 * @returns Aggregate comparison result with per-case details and pass rates.
 */
export async function runLiveComparison(options: {
  llm: Llm
  dataSources: readonly DataSourceDoc[]
  graph: RelationGraphLike
  cases?: readonly K11JoinCase[]
  partitionResolver?: (tableName: string) => readonly string[] | null
  isLiveLlm?: boolean
}): Promise<LiveComparisonResult> {
  const { llm, dataSources, graph, cases = K11_JOIN_CASES, partitionResolver, isLiveLlm = true } = options

  const permissiveOdps = new StandInOdps({})
  const details: LiveCaseDetail[] = []
  let withGraphPass = 0
  let withoutGraphPass = 0
  let constraintsInjected = false

  for (const c of cases) {
    const runOnce = async (graphDep?: RelationGraphLike): Promise<EngineRunResult> => {
      const deps: EngineDeps = {
        dataSources,
        llm,
        odps: permissiveOdps,
        ...(graphDep !== undefined ? { graph: graphDep } : {}),
        ...(partitionResolver !== undefined ? { partitionResolver } : {}),
      }
      const engine = new Nl2sqlEngine(deps)
      return engine.run({ question: c.question, today: '20260822' })
    }

    const withG = await runOnce(graph)
    const withoutG = await runOnce(undefined)

    const withGJoinOk = scoreJoinStructural(withG.sql, c.joinExpectation)
    const withoutGJoinOk = scoreJoinStructural(withoutG.sql, c.joinExpectation)

    if (withGJoinOk) withGraphPass += 1
    if (withoutGJoinOk) withoutGraphPass += 1

    const traceHasConstraints = withG.trace.some(t => t.step === 'join_constraints')
    if (traceHasConstraints) constraintsInjected = true

    details.push({
      id: c.id,
      question: c.question,
      withGraph: { sql: withG.sql, joinCorrect: withGJoinOk, declined: !!withG.decline, traceHasConstraints },
      withoutGraph: { sql: withoutG.sql, joinCorrect: withoutGJoinOk, declined: !!withoutG.decline },
    })
  }

  const total = cases.length
  const withGraphPassRate = total > 0 ? withGraphPass / total : 0
  const withoutGraphPassRate = total > 0 ? withoutGraphPass / total : 0

  return {
    withGraphPassRate,
    withoutGraphPassRate,
    delta: withGraphPassRate - withoutGraphPassRate,
    cases: details,
    joinConstraintsInjected: constraintsInjected,
    isLiveLlm,
  }
}
