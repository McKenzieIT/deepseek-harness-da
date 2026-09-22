/**
 * Infra-retry: bounded retry for infrastructure failures, distinct from model
 * attempts (pass_k). An infra failure means the evaluation infrastructure
 * (network, warehouse, judge endpoint) was unavailable — not that the model
 * produced a wrong answer.
 *
 * Infra retries are labeled separately from pass_k attempts so that a reader
 * can distinguish "the model failed 3 times" from "the warehouse was down
 * twice then the model failed once".
 *
 * @module @deepseek-ai/dsh-eval-runner/infra_retry
 */

import type { InfraFailureKind, InfraRetryRecord } from './types.ts'

/** Default maximum infra retries before giving up. */
export const DEFAULT_MAX_INFRA_RETRIES = 2

/** Backoff schedule for infra retries (ms): 2s, 4s, 8s. */
export const INFRA_BACKOFF_MS: readonly number[] = [2000, 4000, 8000]

/**
 * Classify an error as an infra failure kind. Returns `null` if the error
 * is not an infra failure (i.e., it is a model/logic failure).
 *
 * @param error - the error to classify.
 * @returns the infra failure kind, or null if not infra.
 */
export function classifyInfraFailure(error: unknown): InfraFailureKind | null {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()

  // Connectivity failures
  if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') ||
      msg.includes('connection refused') || msg.includes('connection reset') || msg.includes('dns')) {
    return 'connectivity'
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return 'timeout'
  }

  // Rate limiting
  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests') ||
      msg.includes('429') || msg.includes('throttl')) {
    return 'rate_limit'
  }

  // Transient server errors
  if (msg.includes('503') || msg.includes('502') || msg.includes('500') ||
      msg.includes('service unavailable') || msg.includes('bad gateway') ||
      msg.includes('internal server error') || msg.includes('temporarily unavailable')) {
    return 'transient'
  }

  // Not an infra failure
  return null
}

/**
 * Execute a function with infra-level retry. Only retries on infra failures;
 * non-infra errors propagate immediately.
 *
 * @param fn - the function to execute.
 * @param maxRetries - maximum retry count (default: 2).
 * @param sleep - sleep function (injectable for tests).
 * @param classifyResult - identifies returned infrastructure failures that need the same retry policy as thrown failures.
 * @returns the function result and retry records.
 */
export async function withInfraRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_INFRA_RETRIES,
  sleep: (ms: number) => Promise<void> = defaultSleep,
  classifyResult: (result: T) => { kind: InfraFailureKind; error: string } | null = () => null,
): Promise<{ result: T; retries: InfraRetryRecord[] }> {
  const retries: InfraRetryRecord[] = []

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn()
      const failure = classifyResult(result)
      if (failure === null) return { result, retries }

      recordRetry(retries, attempt, failure.kind, failure.error)
      if (attempt >= maxRetries) throw exhaustedInfraError(attempt, failure.error, retries)
      await sleep(backoffFor(attempt))
    } catch (err) {
      if (isInfraError(err)) throw err
      const kind = classifyInfraFailure(err)

      // Not an infra failure — propagate immediately
      if (kind === null) throw err

      const message = err instanceof Error ? err.message : String(err)
      recordRetry(retries, attempt, kind, message)

      // Budget exhausted
      if (attempt >= maxRetries) throw exhaustedInfraError(attempt, message, retries)

      // Backoff and retry
      await sleep(backoffFor(attempt))
    }
  }
}

function recordRetry(
  retries: InfraRetryRecord[],
  attempt: number,
  kind: InfraFailureKind,
  error: string,
): void {
  retries.push({
    attempt: attempt + 1,
    kind,
    error,
    timestamp: new Date().toISOString(),
  })
}

function exhaustedInfraError(attempt: number, message: string, retries: InfraRetryRecord[]): InfraError {
  const error = new Error(`infra failure after ${attempt + 1} attempts: ${message}`) as InfraError
  error.infraRetries = retries
  error.isInfraFailure = true
  return error
}

function backoffFor(attempt: number): number {
  return INFRA_BACKOFF_MS[attempt] ?? INFRA_BACKOFF_MS[INFRA_BACKOFF_MS.length - 1] ?? 0
}

/** An error augmented with infra retry metadata. */
export interface InfraError extends Error {
  infraRetries: InfraRetryRecord[]
  isInfraFailure: boolean
}

/**
 *  Whether an error is an InfraError (duck-type check).
 * @param err - err
 * @returns the result
 */
export function isInfraError(err: unknown): err is InfraError {
  return err instanceof Error && 'isInfraFailure' in err &&  (err as InfraError).isInfraFailure
}

/** Default sleep implementation. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
