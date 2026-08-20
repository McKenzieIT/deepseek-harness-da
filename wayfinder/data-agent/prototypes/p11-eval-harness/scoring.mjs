// PROTOTYPE (throwaway) — P11 eval harness · da (ii) scoring — DELIVERY + EXECUTION, NO sqlglot (G2 Q1).
// Replaces rbi score_l1 (7 assertions + 3 sqlglot-bound + auto-fix + multi-step branch). da is L1's
// strict subset + a DELIVERY dimension rbi-eval lacks (research Claim D).
//
// Assertions (da ii):
//   sql_executable   — execution_result.success (the agent's query ran)
//   result_non_empty — execution_result.rows.length > 0
//   result_match     — 5 match_mode (match_modes.mjs): fixture.result_value vs execution_result.rows
//   delivery         — DELIVERY 3-layer (delivery.mjs): finalResponse vs expected.answer
//
// Verdict: pass iff all DECLARED assertions pass; fail if any fail. (rbi _aggregate_verdict is
// fail>partial>pass; da has no 'partial' from assertions — partial only from derailment mapping in
// session.mjs, which mirrors rbi session.py _handle_derailment.)
//
// Only run assertions the case DECLARES: EXECUTION-only (no answer), DELIVERY-only (no result_value),
// or both. A DELIVERY-only case ("summarize the trend") has no SQL -> no sql_executable/result_match.
//
// KNOWN TRADE-OFF (G2, recorded not as a bug): DROPPED rbi L1's sqlglot-bound SQL-hygiene assertions
// field_coverage / limit_reasonable / partition_compliant. An agent whose result set is right but SQL
// is "dirty" (SELECT *, missing LIMIT, missing partition predicate) PASSES da (ii). rbi-eval would
// score it partial/fail. This is a product trade-off (data-equivalence priority over SQL form).

import { checkResultMatch } from './match_modes.mjs'
import { scoreDelivery } from './delivery.mjs'

export async function scoreDa(case_, ctx) {
  const { generatedSql, executionResult, finalResponse, provider } = ctx
  const er = executionResult ?? { success: false, rows: [], error: 'no execution result' }
  const assertions = {}

  const hasExecution = case_.expected.result_value != null && case_.expected.match_mode != null
  const hasDelivery = case_.expected.answer != null

  if (hasExecution) {
    assertions.sql_executable = {
      status: er.success ? 'pass' : 'fail',
      detail: er.success ? 'query ran' : `query failed: ${er.error ?? 'unknown'}`,
    }
    assertions.result_non_empty = {
      status: er.rows.length > 0 ? 'pass' : 'fail',
      detail: `${er.rows.length} rows`,
    }
    assertions.result_match = checkResultMatch(
      case_.expected.result_value,
      er.rows,
      case_.expected.match_mode
    )
  }
  if (hasDelivery) {
    assertions.delivery = await scoreDelivery(
      case_.expected,
      finalResponse,
      provider,
      case_.input.question
    )
  }

  return { verdict: aggregateVerdict(assertions), assertions, executionResult: er }
}

export function aggregateVerdict(assertions) {
  const statuses = Object.values(assertions).map((a) => a.status)
  if (statuses.length && statuses.every((s) => s === 'pass')) return 'pass'
  return 'fail'
}
