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

// rbi judge.py classify_error: auth | retryable | unclassified.
export function classifyError(err) {
  const msg = String(err?.message ?? err).toLowerCase()
  if (err instanceof AuthenticationAbort) return 'auth'
  if (/\b(auth|credential|unauthor|forbidden|401|403)\b/.test(msg)) return 'auth'
  if (/\b(timeout|timed out|rate|429|throttl|retryable|transient|overload|503|502|500)\b/.test(msg))
    return 'retryable'
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
