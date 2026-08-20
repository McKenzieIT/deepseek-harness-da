// PROTOTYPE (throwaway) — P11 eval harness · LLM-judge — da DELIVERY layer 3 (complex semantic).
// Mirror rbi scoring/judge.py's INJECTION design: "the LLM provider is injected by the caller".
// Retry budget JUDGE_MAX_RETRIES=2, exponential backoff 1s->2s->4s (research Claim D / HOLE D2).
// classify_error: auth | retryable | unclassified (rbi judge.py). AuthenticationAbort terminates
// the whole run (SPEC §5.5; submit_turn/drive_session let it through).
//
// Per locked decision #4: the judge LLM is STUBBED in proto. dsh-llm-replay only freezes the AGENT
// LLM (the system under test); the judge is a separate LLM call, so a stub judge keeps proto
// deterministic. The stub validates the injection + retry/backoff + classify_error + AuthenticationAbort
// LOGIC — not real LLM judging. Real llm-dashscope judge = P11b (with its own replay or accepted variance).

export const JUDGE_MAX_RETRIES = 2
export const BACKOFF_MS = [1000, 2000, 4000] // rbi exponential 1s -> 2s -> 4s
export const JUDGE_PASS_THRESHOLD = 0.6 // da-fresh: judge returns score 0..1; >= threshold => DELIVERY pass

export class AuthenticationAbort extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthenticationAbort'
  }
}

// rbi judge.py classify_error: auth | retryable | unclassified. Faithful mirror of rbi's heuristic
// (code-review fix 2026-08-20: was a \b-word-boundary regex that (a) wrongly matched forbidden/403 as
// auth and (b) missed "unauthorized"/"authentication failed" substrings — reversing rbi's deliberate
// design below).
//
// 🔴 rbi judge.py:190-198 — "Authorization is not authentication": MaxCompute reports a missing grant
// as `Authorization Failed [4002]`, an LLM gateway can 403 a model the key isn't entitled to — those
// are PER-CASE facts (other cases/tables/models still work), NOT run-ending. Only a CREDENTIAL failure
// (401 / invalid key / bad signature) makes every remaining case futile → only that aborts the run.
// So `forbidden`/`403`/`permission denied`/`authorization failed` are DELIBERATELY EXCLUDED from auth
// ("classifying them as auth would kill a 143-case run because one table lacked a grant"). Mirror that.
const AUTH_PHRASES = [
  'unauthorized', 'authentication failed', 'authentication error', 'authenticationerror',
  'invalid api key', 'invalid_api_key', 'incorrect api key', 'missing api key', 'no api key',
  'api key not', 'invalidaccesskeyid', 'access key id does not exist',
  'signaturedoesnotmatch', 'signature does not match',
  'invalid credential', 'credentials expired', 'expired credential',
]
const RETRYABLE_PHRASES = [
  'timeout', 'timed out', 'rate limit', 'too many requests', 'throttl', 'retryable', 'transient',
  'overload', 'queue is full', 'queue full', 'queue busy', 'temporarily unavailable', 'try again later',
  'connection reset', 'connection refused', 'connection aborted',
]
// rbi _STATUS_CUE: a status code must be cued (http/status[_ ]?code/status/code/error prefix or
// start-of-message), NOT a bare substring — else "LIMIT 500" would classify as HTTP 500 retryable
// (rbi judge.py:162 "a bare substring search would be a live bug... engine errors echo the statement").
const AUTH_STATUS = /(?:^|\bhttp\b|status[_ ]?code|\bstatus\b|\bcode\b|\berror\b)[^0-9]{0,12}401\b/i
const RETRYABLE_STATUS = /(?:^|\bhttp\b|status[_ ]?code|\bstatus\b|\bcode\b|\berror\b)[^0-9]{0,12}(?:429|500|502|503|504)\b/i

export function classifyError(err) {
  if (err instanceof AuthenticationAbort) return 'auth'
  const text = String(err?.message ?? err).toLowerCase()
  if (AUTH_PHRASES.some((p) => text.includes(p)) || AUTH_STATUS.test(text)) return 'auth'
  // rbi _RETRYABLE_TYPES: TimeoutError, ConnectionError (covers DNS/reset/refused; the case an adapter
  // raises when the gateway is simply not there — a message carrying no keyword at all).
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'ConnectionError') return 'retryable'
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return 'retryable'
  }
  if (RETRYABLE_PHRASES.some((p) => text.includes(p)) || RETRYABLE_STATUS.test(text)) return 'retryable'
  return 'unclassified'
}

// Injectable LLMProvider: a function judgeProvider(prompt) -> { score: 0..1, rationale }.
// It may throw (retryable / auth / unclassified). Caller injects (production: llm-dashscope;
// proto: a scripted stub in harness-stub.mjs that returns canned verdicts + simulates failures).
//
// Returns { score, rationale, judgeError? }. On auth failure throws AuthenticationAbort.
// On unclassified OR exhausted retries, returns score=0 (caller scores DELIVERY fail) — does NOT throw,
// because a judge failure is not a run-ending condition (unlike auth). Mirrors rbi: auth aborts the run,
// everything else is contained per-attempt.
export async function judgeWithProvider(provider, prompt, opts = {}) {
  const maxRetries = opts.maxRetries ?? JUDGE_MAX_RETRIES
  const backoff = opts.backoff ?? BACKOFF_MS
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))

  let lastErr
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await provider(prompt)
    } catch (err) {
      lastErr = err
      const cls = classifyError(err)
      if (cls === 'auth')
        throw new AuthenticationAbort(`judge auth failure: ${err.message ?? err}`)
      if (cls !== 'retryable' || attempt === maxRetries) {
        // unclassified, OR retryable but retries exhausted -> DELIVERY fail (contained, not run-ending).
        return {
          score: 0,
          rationale: `judge ${cls} after ${attempt + 1} attempt(s): ${err.message ?? err}`,
          judgeError: cls,
        }
      }
      // retryable + retries remaining -> backoff then retry.
      await sleep(backoff[attempt] ?? backoff[backoff.length - 1])
    }
  }
  return {
    score: 0,
    rationale: `judge exhausted retries: ${lastErr?.message ?? lastErr}`,
    judgeError: 'exhausted',
  }
}
