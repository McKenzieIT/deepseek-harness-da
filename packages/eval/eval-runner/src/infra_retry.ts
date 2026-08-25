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
 * @returns the function result and retry records.
 */
export async function withInfraRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_INFRA_RETRIES,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ result: T; retries: InfraRetryRecord[] }> {
  const retries: InfraRetryRecord[] = []

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn()
      return { result, retries }
    } catch (err) {
      const kind = classifyInfraFailure(err)

      // Not an infra failure — propagate immediately
      if (kind === null) throw err

      // Permanent classification — do not retry
      if (kind === 'permanent') throw err

      retries.push({
        attempt: attempt + 1,
        kind,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })

      // Budget exhausted
      if (attempt >= maxRetries) {
        const infraErr = new Error(`infra failure after ${attempt + 1} attempts: ${err instanceof Error ? err.message : String(err)}`)
        ;(infraErr as InfraError).infraRetries = retries
        ;(infraErr as InfraError).isInfraFailure = true
        throw infraErr
      }

      // Backoff and retry
      const backoffMs = INFRA_BACKOFF_MS[attempt] ?? INFRA_BACKOFF_MS[INFRA_BACKOFF_MS.length - 1]!
      await sleep(backoffMs!)
    }
  }
}

/** An error augmented with infra retry metadata. */
export interface InfraError extends Error {
  infraRetries: InfraRetryRecord[]
  isInfraFailure: boolean
}

/** Whether an error is an InfraError (duck-type check). */
export function isInfraError(err: unknown): err is InfraError {
  return err instanceof Error && 'isInfraFailure' in err && (err as InfraError).isInfraFailure === true
}

/** Default sleep implementation. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
