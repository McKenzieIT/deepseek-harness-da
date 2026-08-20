/**
 * DELIVERY — the da-fresh final-answer comparison (rbi-eval has no DELIVERY
 * dimension). Three layers (P11 decision D4 + decision 2 hardening):
 *
 * - `scalar_exact` — numeric answer: parse a number out of `finalResponse`, `=== expected.answer`.
 * - `fuzzy`        — text: {@link deliveryFuzzyMatch} (short expected →
 * token-containment; longer → trigram ≥0.35). **Not** the derailment
 * `turnMatchesExpectation` — the DELIVERY false-positive on short answers
 * (`gameX` vs `gameA`) is hardened here (decision 2).
 * - `llm_judge`    — complex prose: injected `JudgeProvider` (judge ≠ agent
 * LLM) with retry/backoff + `classifyError` + `AuthenticationAbort`
 * (decision 1: accept variance).
 *
 * Routing: an explicit `expected.delivery_match` wins; else auto by
 * `expected.answer` type (`number`→scalar_exact; long string >120→llm_judge;
 * short string/array→fuzzy; null→no DELIVERY). Non-terminal derailment uses
 * `turnMatchesExpectation` separately (session.ts) — terminal DELIVERY is
 * this module.
 *
 * @module @deepseek-ai/dsh-eval/delivery
 */

import { deliveryFuzzyMatch, type DeliveryFuzzyOpts } from './text_sim.ts'
import { judgeWithProvider, JUDGE_PASS_THRESHOLD, type JudgeOpts } from './judge.ts'
import type { JudgeProvider, JudgeVerdict } from './types.ts'
import type { CaseExpected, DeliveryMatch } from './eval_case.ts'

/** A DELIVERY assertion result, extended with the `mode` used + the judge verdict (for `llm_judge`). */
export interface DeliveryResult {
  readonly status: 'pass' | 'fail'
  readonly detail: string
  readonly mode: DeliveryMatch | null
  readonly judge?: JudgeVerdict
}

/** Optional tunables threaded to the fuzzy + judge layers (testing). */
export interface DeliveryOpts {
  readonly fuzzy?: DeliveryFuzzyOpts
  readonly judge?: JudgeOpts
}

/**
 * Route a case's expected to its DELIVERY mode. Explicit `expected.delivery_match` wins; else auto by answer type.
 * @param expected - the case's expected.
 * @returns the DELIVERY mode, or `null` when no DELIVERY is expected (EXECUTION-only case).
 */
export function routeDelivery(expected: CaseExpected): DeliveryMatch | null {
  if (expected.delivery_match !== null) return expected.delivery_match
  const ans = expected.answer
  if (ans === null || ans === undefined) return null
  if (typeof ans === 'number') return 'scalar_exact'
  if (Array.isArray(ans)) return 'fuzzy'
  if (typeof ans === 'string') return ans.length > 120 ? 'llm_judge' : 'fuzzy'
  return 'fuzzy'
}

/**
 * Score the DELIVERY layer.
 * @param expected - the case's expected (carries `answer` + `delivery_match`).
 * @param finalResponse - the agent's `finalResponse`.
 * @param provider - the injected DELIVERY LLM-judge (null ⇒ `llm_judge` mode is unavailable; the result fails).
 * @param question - the case's terminal question (judge prompt context).
 * @param opts - optional tunables (testing).
 * @returns the DELIVERY result.
 */
export async function scoreDelivery(
  expected: CaseExpected,
  finalResponse: string,
  provider: JudgeProvider | null,
  question: string,
  opts: DeliveryOpts = {},
): Promise<DeliveryResult> {
  const mode = routeDelivery(expected)
  if (mode === null) return { status: 'pass', detail: 'no DELIVERY expected (EXECUTION-only)', mode: null }

  if (mode === 'scalar_exact') {
    const target = expected.answer
    const parsed = parseNumber(finalResponse)
    if (parsed === target) return { status: 'pass', detail: `parsed ${parsed}`, mode }
    return { status: 'fail', detail: `DELIVERY scalar_exact: expected ${JSON.stringify(target)}, parsed ${parsed} from finalResponse`, mode }
  }

  if (mode === 'fuzzy') {
    const ans = expected.answer
    const expectedText = Array.isArray(ans) ? ans.join(', ') : String(ans)
    const ok = deliveryFuzzyMatch(finalResponse, expectedText, opts.fuzzy)
    return { status: ok ? 'pass' : 'fail', detail: ok ? 'fuzzy match' : 'fuzzy no-match', mode }
  }

  // llm_judge
  if (provider === null) {
    return { status: 'fail', detail: 'DELIVERY llm_judge mode but no judge provider injected', mode }
  }
  const verdict = await judgeWithProvider(provider, {
    question,
    agentAnswer: finalResponse,
    expectedAnswer: String(expected.answer),
  }, opts.judge)
  const ok = verdict.score >= JUDGE_PASS_THRESHOLD
  return { status: ok ? 'pass' : 'fail', detail: `llm_judge score=${verdict.score} (${verdict.rationale})`, mode, judge: verdict }
}

/**
 * Parse the first `-?\d+(\.\d+)?` out of `text` (the agent's prose answer); `NaN` when none.
 * @param text - the agent's prose answer to extract a leading numeric token from.
 * @returns the first numeric token found (e.g. `-3.14`), or `NaN` when no number is present.
 */
export function parseNumber(text: string): number {
  const m = String(text).match(/-?\d+(\.\d+)?/)
  return m === null ? Number.NaN : Number(m[0])
}
