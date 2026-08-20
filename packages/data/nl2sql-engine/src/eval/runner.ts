/**
 * P13b NL→SQL engine — lightweight eval runner (calls `engine.run` +
 * dsh-llm-replay + computes L1 pass-rate). Not via a real harness session
 * (P13 grilling Q1: prototype-level self-proof; the cases are consumed
 * seamlessly by P11 later). Ported from
 * `prototypes/p13-nl2sql-engine/eval/runner.mjs`. Honest gate < RBI 73.8%
 * upper bound ((B) dropped sqlglot + bge-m3 + cross-encoder; research §4.5).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/runner
 */
import { EVAL_CASES, FIXTURE_DATA_SOURCES, FIXTURE_EVENT_DEF, type EvalCase } from './cases.ts'
import { scoreMatch } from './scorer.ts'
import { Nl2sqlEngine } from '../engine.ts'
import { ReplayLlm, type ScriptedGen } from '../replay-llm.ts'
import { StandInOdps } from '../stand-in-odps.ts'
import type { QueryOutcome } from '../types.ts'

export interface EvalDetail {
  readonly id: string
  readonly ok: boolean
  readonly sql?: string | undefined
  readonly decline?: boolean | undefined
  readonly reason?: string | undefined
}

export interface EvalResult {
  readonly pass: number
  readonly total: number
  readonly pass_rate: number
  readonly details: readonly EvalDetail[]
}

export async function runEval({
  cases = EVAL_CASES,
  verbose = false,
}: { cases?: readonly EvalCase[]; verbose?: boolean } = {}): Promise<EvalResult> {
  let pass = 0
  const details: EvalDetail[] = []
  for (const c of cases) {
    // each case gets its own engine + scripted LLM/ODPS (deterministic, reproducible)
    const llm = new ReplayLlm({ [c.question]: c.llm } as Record<string, ScriptedGen>)
    const scripted = c.odps ? ({ [c.odps.sub]: c.odps.out } as Record<string, QueryOutcome>) : {}
    const odps = new StandInOdps(scripted)
    const engine = new Nl2sqlEngine({ dataSources: FIXTURE_DATA_SOURCES, llm, odps })
    const r = await engine.run({ question: c.question, eventDef: FIXTURE_EVENT_DEF })
    const ok = scoreMatch(r, c.expected)
    if (ok) pass += 1
    details.push({ id: c.id, ok, sql: r.sql, decline: r.decline, reason: r.reason })
    if (verbose) {
      console.log(`  ${c.id} ${ok ? '✓' : '✗'} q="${c.question}" ${r.decline ? `DECLINE(${r.reason})` : `sql=${r.sql}`}`)
    }
  }
  const pass_rate = cases.length > 0 ? pass / cases.length : 0
  return { pass, total: cases.length, pass_rate, details }
}
