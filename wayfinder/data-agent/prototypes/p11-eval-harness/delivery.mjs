// PROTOTYPE (throwaway) — P11 eval harness · DELIVERY — da-fresh 3-layer (research HOLE C1).
// Compares agent finalResponse (text) vs expected.answer.
//
// Layers (locked decision #4):
//   scalar_exact — numeric answer: parse a number out of finalResponse, == expected.answer.
//   fuzzy        — text/short: token + char-trigram overlap >= 0.35 (reuse text_sim.turnMatchesExpectation).
//   llm_judge    — complex prose: injected LLMProvider (judge.mjs) with retry/backoff + classify_error + AuthenticationAbort.
//
// Routing: explicit expected.delivery_match wins; else auto by expected.answer type:
//   number           -> scalar_exact
//   long string >120 -> llm_judge
//   short string     -> fuzzy
//   array            -> fuzzy (joined)
//   null             -> no DELIVERY (EXECUTION-only case)
//
// Non-terminal turn derailment uses fuzzy SEPARATELY (session.mjs) — this is terminal DELIVERY only.
// Numeric DELIVERY may reuse EXECUTION's scalar_exact (research HOLE C1): if the case already has an
// EXECUTION scalar_exact, DELIVERY just checks the agent's finalResponse TEXT states that number.

import { turnMatchesExpectation } from './text_sim.mjs'
import { judgeWithProvider, JUDGE_PASS_THRESHOLD } from './judge.mjs'

export function routeDelivery(expected) {
  if (expected.delivery_match) return expected.delivery_match
  const ans = expected.answer
  if (ans == null) return null
  if (typeof ans === 'number') return 'scalar_exact'
  if (Array.isArray(ans)) return 'fuzzy'
  if (typeof ans === 'string') return ans.length > 120 ? 'llm_judge' : 'fuzzy'
  return 'fuzzy'
}

export async function scoreDelivery(expected, finalResponse, provider, question) {
  const mode = routeDelivery(expected)
  if (mode == null)
    return { status: 'pass', detail: 'no DELIVERY expected (EXECUTION-only)', mode: null }

  if (mode === 'scalar_exact') {
    const target = expected.answer
    const parsed = parseNumber(finalResponse)
    if (parsed === target) return { status: 'pass', detail: `parsed ${parsed}`, mode }
    return {
      status: 'fail',
      detail: `DELIVERY scalar_exact: expected ${target}, parsed ${parsed} from finalResponse`,
      mode,
    }
  }

  if (mode === 'fuzzy') {
    const expectedText = Array.isArray(expected.answer) ? expected.answer.join(', ') : expected.answer
    const ok = turnMatchesExpectation(finalResponse, expectedText)
    return { status: ok ? 'pass' : 'fail', detail: ok ? 'fuzzy >=0.35' : 'fuzzy <0.35', mode }
  }

  if (mode === 'llm_judge') {
    const prompt = { question, agentAnswer: finalResponse, expectedAnswer: expected.answer }
    // provider may be a plain function OR { judge, opts } (stub carries instant backoff/sleep for tests).
    const judgeFn = typeof provider === 'function' ? provider : provider?.judge ?? provider
    const judgeOpts = typeof provider === 'function' ? {} : provider?.opts ?? {}
    const verdict = await judgeWithProvider(judgeFn, prompt, judgeOpts)
    const ok = (verdict.score ?? 0) >= JUDGE_PASS_THRESHOLD
    return {
      status: ok ? 'pass' : 'fail',
      detail: `llm_judge score=${verdict.score} (${verdict.rationale})`,
      mode,
      judge: verdict,
    }
  }

  return { status: 'fail', detail: `unknown delivery mode ${mode}`, mode }
}

function parseNumber(text) {
  const m = String(text).match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : NaN
}
