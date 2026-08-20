/**
 * da (ii) scoring: DELIVERY + EXECUTION, **no sqlglot** (G2 Q1). Replaces rbi
 * `score_l1`'s 7 assertions + 3 sqlglot-bound + auto-fix + multi-step branch.
 * da is L1's strict subset + a DELIVERY dimension rbi-eval lacks (research
 * Claim D). The assertions:
 *
 * - `sql_executable`   — the agent's query ran (`execution_result.success`);
 * carries `failureClass` (decision 3) so a reader tells "the SQL is wrong"
 * from "the warehouse was not there".
 * - `result_non_empty` — `execution_result.rows.length > 0`.
 * - `result_match`     — the 5 `match_mode` (match_modes.ts): fixture `result_value` vs `execution_result.rows`.
 * - `delivery`         — the DELIVERY 3-layer (delivery.ts): `finalResponse` vs `expected.answer`.
 *
 * Verdict: `pass` iff every **declared** assertion `pass`; `fail` otherwise. A
 * case declares EXECUTION (`result_value`+`match_mode`) and/or DELIVERY
 * (`answer`); `partial` arises only from the derailment mapping in
 * `MultiTurnSession`, not from these assertions.
 *
 * Known trade-off (G2, recorded not as a bug): rbi L1's sqlglot-bound
 * SQL-hygiene assertions (`field_coverage`/`limit_reasonable`/
 * `partition_compliant`) are dropped — an agent whose result set is right but
 * SQL is "dirty" (SELECT *, missing LIMIT, missing partition predicate) PASSES
 * da (ii); rbi-eval would score it partial/fail.
 *
 * @module @deepseek-ai/dsh-eval/scoring
 */

import { checkResultMatch } from './match_modes.ts'
import { scoreDelivery, type DeliveryOpts } from './delivery.ts'
import type { EvalCase } from './eval_case.ts'
import type { AssertionResult, ExecutionResult, JudgeProvider, ScoreDaResult, Verdict } from './types.ts'

/** Inputs to {@link scoreDa}. */
export interface ScoreDaContext {
  readonly generatedSql: string | null
  readonly executionResult: ExecutionResult | null
  readonly finalResponse: string
  readonly provider: JudgeProvider | null
  /** Optional DELIVERY tunables (fuzzy + judge backoff); threaded so tests inject instant backoff. */
  readonly deliveryOpts: DeliveryOpts | undefined
}

/** The "no execution was attempted" sentinel for a DELIVERY-only case. */
const NO_EXECUTION: ExecutionResult = { success: false, rows: [], rowCount: 0, error: null, failureClass: null }

/**
 * Score one case on its declared da (ii) assertions. Only runs the assertions
 * the case declares (EXECUTION-only, DELIVERY-only, or both).
 * @param case_ - the validated case.
 * @param ctx - the generated SQL, execution result, final response, injected judge, + optional DELIVERY tunables.
 * @returns the score (verdict + assertions + the execution result that produced them).
 */
export async function scoreDa(case_: EvalCase, ctx: ScoreDaContext): Promise<ScoreDaResult> {
  const er = ctx.executionResult ?? NO_EXECUTION
  const assertions: Record<string, AssertionResult> = {}

  const hasExecution = case_.expected.result_value !== null && case_.expected.match_mode !== null
  const hasDelivery = case_.expected.answer !== null

  if (hasExecution) {
    assertions.sql_executable = {
      status: er.success ? 'pass' : 'fail',
      detail: er.success ? 'query ran' : `query failed: ${er.error ?? 'unknown'}`,
      ...(er.success || er.failureClass === null ? {} : { failureClass: er.failureClass }),
    }
    assertions.result_non_empty = {
      status: er.rows.length > 0 ? 'pass' : 'fail',
      detail: `${er.rows.length} rows`,
    }
    assertions.result_match = checkResultMatch(
      case_.expected.result_value as Record<string, unknown>,
      er.rows,
      case_.expected.match_mode as string,
    )
  }
  if (hasDelivery) {
    const d = await scoreDelivery(case_.expected, ctx.finalResponse, ctx.provider, case_.input.question, ctx.deliveryOpts ?? {})
    assertions.delivery = { status: d.status, detail: d.detail }
  }

  return { verdict: aggregateVerdict(assertions), assertions, executionResult: er }
}

/**
 * Fold the assertions into one verdict: `pass` iff all declared assertions
 * `pass`; else `fail`. (No `partial` from assertions — `partial` arises only
 * from the derailment mapping in `MultiTurnSession`.)
 * @param assertions - the declared assertions.
 * @returns the verdict.
 */
export function aggregateVerdict(assertions: Record<string, AssertionResult>): Verdict {
  const statuses = Object.values(assertions).map(a => a.status)
  if (statuses.length > 0 && statuses.every(s => s === 'pass')) return 'pass'
  return 'fail'
}
