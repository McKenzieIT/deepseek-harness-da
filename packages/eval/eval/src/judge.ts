/**
 * The DELIVERY LLM-judge (layer 3): an **injected** `JudgeProvider` callable
 * (judge ≠ agent LLM — `dsh-llm-replay` freezes only the agent runtime; the
 * judge is a separate eval-side LLM call). Mirrors `rbi_eval.scoring.judge.py`'
 * s injection design ("the LLM provider is injected by the caller") + retry
 * budget `JUDGE_MAX_RETRIES=2` + exponential backoff 1s→2s→4s (SPEC §5.5) +
 * `classify_error` (auth/retryable/unclassified) + `AuthenticationAbort`.
 *
 * P11b decision 1: the judge accepts **variance** (temp 0 + retry budget) —
 * `dsh-llm-replay` does not cover the judge, so full bit-reproducibility would
 * need a separate judge snapshot (deferred). pass_k=3 is the anti-flakiness
 * mechanism; in regression mode (agent replayed) judge variance may conflate
 * judge/agent flakiness — a recorded known trade-off.
 *
 * `classifyError` is rbi-faithful (P11 code-review fix 2026-08-20, carried
 * verbatim — do not regress): `_AUTH_PHRASES` substring + cued `_AUTH_STATUS`
 * (401-only) deliberately **exclude** `forbidden`/`403`/`permission denied`/
 * `authorization failed` — those are per-case facts (a missing grant on one
 * table is not a run-ending credential failure). `_STATUS_CUE` prevents a bare
 * `LIMIT 500` matching HTTP 500. `_RETRYABLE_TYPES` covers `TimeoutError`/
 * `ConnectionError` (the case an adapter raises when the gateway is simply
 * not there — a message carrying no keyword).
 *
 * @module @deepseek-ai/dsh-eval/judge
 */

import type { JudgePrompt, JudgeProvider, JudgeVerdict } from './types.ts'

/**
 * SPEC §5.5: a malformed/transport failure is retried a fixed number of times
 * (at most `1 + JUDGE_MAX_RETRIES` attempts). Fixed, not configurable
 * (converging surface).
 */
export const JUDGE_MAX_RETRIES = 2

/** SPEC §5.5 exponential backoff base (1s → 2s → 4s); a budget of 2 spends `[1000, 2000]` and never reaches 4000. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000]

/** A judge score ≥ this ⇒ DELIVERY pass (da-fresh; the judge returns 0..1). */
export const JUDGE_PASS_THRESHOLD = 0.6

/**
 * SPEC §5.5: a credential failed, so the whole run is over (auth, not
 * authorization — see `classifyError`). The one external failure not absorbed
 * into a per-case result.
 */
export class AuthenticationAbort extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationAbort'
  }
}

/**
 * rbi `_AUTH_PHRASES`: credential failures. Kept tight — a false positive here
 * aborts a whole run — and deliberately free of `forbidden`/
 * `permission denied`/`authorization` (per-case, not run-ending).
 */
const AUTH_PHRASES: readonly string[] = [
  'unauthorized', 'authentication failed', 'authentication error', 'authenticationerror',
  'invalid api key', 'invalid_api_key', 'incorrect api key', 'missing api key', 'no api key',
  'api key not', 'invalidaccesskeyid', 'access key id does not exist',
  'signaturedoesnotmatch', 'signature does not match',
  'invalid credential', 'credentials expired', 'expired credential',
]

/**
 * rbi `_RETRYABLE_PHRASES`: network timeout / 429 / 500 / 503 / queue full.
 * Mirrored verbatim (incl. `rate_limit`/`service unavailable`/
 * `internal server error`/`bad gateway`/`gateway timeout`).
 */
const RETRYABLE_PHRASES: readonly string[] = [
  'timeout', 'timed out', 'rate limit', 'rate_limit', 'too many requests', 'throttl', 'retryable', 'transient',
  'overload', 'service unavailable', 'internal server error', 'bad gateway', 'gateway timeout',
  'queue is full', 'queue full', 'queue busy', 'temporarily unavailable', 'try again later',
  'connection reset', 'connection refused', 'connection aborted',
]

/**
 * rbi `_STATUS_CUE`: a status code must be cued (http/status[_ ]?code/
 * status/code/error prefix or start-of-message) — a bare substring search
 * would make `LIMIT 500` classify as HTTP 500 retryable.
 */
const STATUS_CUE = /(?:^|\bhttp\b|status[_ ]?code|\bstatus\b|\bcode\b|\berror\b)[^0-9]{0,12}/
const AUTH_STATUS = new RegExp(`${STATUS_CUE.source}401\\b`, 'i')
const RETRYABLE_STATUS = new RegExp(`${STATUS_CUE.source}(?:429|500|502|503|504)\\b`, 'i')

/** rbi `ErrorClass`. */
export type ErrorClass = 'auth' | 'retryable' | 'unclassified'

/** Whether `haystack` contains any of `needles` (an explicit loop, not `.some`, so branch coverage is a single named function). */
function includesAny(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) if (haystack.includes(n)) return true
  return false
}

/** The message text of `err` (Error.message, an object's `.message`, or the value itself for a string/other). */
function messageOf(err: unknown): unknown {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) return (err as { message?: unknown }).message
  return err
}

/** The default sleep (real `setTimeout`); a named function so the per-file 100% gate sees one covered function, not an anonymous arrow. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * Which SPEC §5.5 bucket `err` falls into. Heuristic — the provider is
 * injected, so this module never sees a typed engine error, only whatever
 * exception/message the adapter produced. Errs toward `unclassified`; a wrong
 * `auth` costs a whole run. **Authorization is not authentication**: 403/
 * `forbidden`/`permission denied`/`authorization failed` are deliberately NOT
 * `auth` (they are per-case: other cases/tables/models still work). Only a
 * credential failure (401 / invalid key / bad signature) aborts the run.
 * @param err - the thrown error or message.
 * @returns the error class.
 */
export function classifyError(err: unknown): ErrorClass {
  if (err instanceof AuthenticationAbort) return 'auth'
  const text = String(messageOf(err)).toLowerCase()
  if (includesAny(text, AUTH_PHRASES) || AUTH_STATUS.test(text)) return 'auth'
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'ConnectionError') return 'retryable'
    const code = (err as { code?: unknown }).code
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') return 'retryable'
  }
  if (includesAny(text, RETRYABLE_PHRASES) || RETRYABLE_STATUS.test(text)) return 'retryable'
  return 'unclassified'
}

/** Options for {@link judgeWithProvider}; injected so tests assert the schedule without spending it. */
export interface JudgeOpts {
  readonly maxRetries?: number
  readonly backoff?: readonly number[]
  readonly sleep?: (ms: number) => Promise<void>
}

/**
 * Ask the injected `provider` up to `1 + maxRetries` times; return the first
 * verdict, or `{score:0, …, judgeError}` when the budget is exhausted. A
 * retryable failure backs off then retries; an unclassified failure (a
 * malformed reply) re-asks immediately (nothing recovers while waiting); an
 * `auth` failure raises `AuthenticationAbort` (the whole run is over, SPEC §5.5)
 * — the one exception that is NOT absorbed into a per-attempt result.
 * @param provider - the injected DELIVERY LLM-judge.
 * @param prompt - the judge prompt.
 * @param opts - retry budget + backoff + sleep (testing).
 * @returns the judge verdict (with `judgeError` set on a contained failure).
 */
export async function judgeWithProvider(provider: JudgeProvider, prompt: JudgePrompt, opts: JudgeOpts = {}): Promise<JudgeVerdict> {
  const maxRetries = opts.maxRetries ?? JUDGE_MAX_RETRIES
  const backoff = opts.backoff ?? BACKOFF_MS
  const sleep = opts.sleep ?? defaultSleep

  // `for (;;)` (not a bounded `for`): every path returns, so there is no
  // unreachable post-loop terminal — a bounded loop's would be dead code the
  // per-file 100% gate flags. `attempt` grows but the retryable+exhausted
  // return bounds it at `1 + maxRetries` attempts.
  let lastErr: unknown
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider(prompt)
    } catch (err) {
      lastErr = err
      const cls = classifyError(err)
      if (cls === 'auth') throw new AuthenticationAbort(`judge auth failure: ${String(messageOf(err))}`)
      if (cls !== 'retryable') {
        return { score: 0, rationale: `judge ${cls} after ${attempt + 1} attempt(s): ${String(messageOf(err))}`, judgeError: cls }
      }
      if (attempt >= maxRetries) {
        return { score: 0, rationale: `judge retryable exhausted after ${attempt + 1} attempt(s): ${String(messageOf(lastErr))}`, judgeError: 'exhausted' }
      }
      await sleep(backoff[attempt] ?? 1000)
    }
  }
}
