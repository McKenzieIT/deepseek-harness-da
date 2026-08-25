/**
 * Maps eval core verdicts and attempt results to the runner's verdict taxonomy.
 *
 * The eval core uses `Verdict` = 'pass' | 'partial' | 'fail'. The runner maps
 * these to a broader classification that includes infrastructure and behavioral
 * distinctions (correct/wrong/declined/unjudged/infra_failure).
 *
 * @module @deepseek-ai/dsh-eval-runner/verdict_mapper
 */

import type { MultiTurnCaseResult, MultiTurnAttempt } from '@deepseek-ai/dsh-eval'
import type { RunnerVerdict, AttemptResult } from './types.ts'

/**
 * Map an eval core `MultiTurnCaseResult` to a `RunnerVerdict`.
 *
 * Mapping rules:
 * - All attempts passed → 'correct'
 * - Any attempt has an infra error → 'infra_failure'
 * - Any attempt has error + timeout → 'infra_failure'
 * - No verdict could be produced → 'unjudged'
 * - Agent explicitly declined (detected via reply heuristics) → 'declined'
 * - Otherwise → 'wrong'
 */
export function mapVerdict(result: MultiTurnCaseResult): RunnerVerdict {
  // All attempts passed — correct
  if (result.passed) return 'correct'

  // Check if any attempt had an infra failure
  const hasInfraFailure = result.attempts.some(a => a.error !== null && isInfraLikeError(a.error))
  if (hasInfraFailure) return 'infra_failure'

  // Check if all attempts had errors (unjudged)
  const allErrored = result.attempts.every(a => a.error !== null || a.verdict === null)
  if (allErrored) return 'unjudged'

  // Check if any attempt's error looks like a decline
  const hasDecline = result.attempts.some(a => a.verdict === null && a.error !== null && isDeclineError(a.error))
  if (hasDecline && !result.attempts.some(a => a.verdict === 'fail')) return 'declined'

  // Default: wrong
  return 'wrong'
}

/**
 * Map eval core attempts to runner `AttemptResult` records.
 */
export function mapAttempts(attempts: readonly MultiTurnAttempt[]): AttemptResult[] {
  return attempts.map(a => mapOneAttempt(a))
}

/**
 * Map a single eval core attempt to a runner `AttemptResult`.
 */
function mapOneAttempt(attempt: MultiTurnAttempt): AttemptResult {
  const execMatch = attempt.l1 ? hasExecutionMatch(attempt) : undefined
  const delMatch = attempt.l1 ? hasDeliveryMatch(attempt) : undefined
  const infraError = attempt.error && isInfraLikeError(attempt.error) ? attempt.error : undefined

  return {
    attempt_k: attempt.attempt,
    ...(execMatch !== undefined ? { execution_match: execMatch } : {}),
    ...(delMatch !== undefined ? { delivery_match: delMatch } : {}),
    ...(infraError !== undefined ? { infra_error: infraError } : {}),
  }
}

/**
 * Whether an attempt's execution assertions all passed.
 */
function hasExecutionMatch(attempt: MultiTurnAttempt): boolean | undefined {
  if (!attempt.l1) return undefined
  const assertions = attempt.l1.assertions
  const execKeys = ['sql_executable', 'result_non_empty', 'result_match']
  const execAssertions = execKeys.filter(k => k in assertions)
  if (execAssertions.length === 0) return undefined
  return execAssertions.every(k => assertions[k]?.status === 'pass')
}

/**
 * Whether an attempt's delivery assertion passed.
 */
function hasDeliveryMatch(attempt: MultiTurnAttempt): boolean | undefined {
  if (!attempt.l1) return undefined
  const delivery = attempt.l1.assertions['delivery']
  if (!delivery) return undefined
  return delivery.status === 'pass'
}

/**
 * Heuristic: does this error string look like an infra failure?
 * (connectivity, timeout, warehouse unavailable — not a model logic error)
 */
function isInfraLikeError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('timeout') ||
    lower.includes('connection') ||
    lower.includes('infrastructure') ||
    lower.includes('sql execution failed') ||
    lower.includes('wall-clock timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset')
}

/**
 * Heuristic: does this error string look like the agent declined to answer?
 */
function isDeclineError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('decline') ||
    lower.includes('cannot answer') ||
    lower.includes('unable to') ||
    lower.includes('i cannot') ||
    lower.includes("i can't")
}
