// PROTOTYPE (throwaway) — P11 eval harness · AgentResponder adapter — wraps TS SDK
// DeepSeekHarness.run() (G2: TS SDK "owns the client contract") as the AgentResponder the multi-turn
// driver consumes. respond(req) = { reply: run(req.message).finalResponse, generated_sql: <from events> }.
//
// TS SDK RunResult { finalResponse, events, notifications } has NO generatedSql field (unlike rbi's
// pipeline, which emits TEXT + sql events into a per-turn TurnContext). da takes finalResponse directly
// as reply (rbi extract_reply concatenates TEXT events) and parses the agent's generated SQL out of the
// tool/call event in events (the agent's query tool call). The eval then RE-RUNS that SQL via
// ctx.query.execute for a deterministic actual result set (G2 "跑 da 自己的 ODPS").
//
// H1 MITIGATION (locked #3 / research Claim H1): TS SDK finalResponse is "the last assistant/message in
// the interval, NOT causally assigned to the prompt" — steering / queued work could contribute before
// idle. Research established this does NOT bite for da scripted multi-turn (single prompt, no steering,
// no queued work). The prototype ASSERTS the mitigation: validateRunResult checks the interval has
// exactly ONE assistant/message; a derailing interval (>=2) -> ProtocolError. S8 exercises this.

import { AgentTurnReply } from './multi_turn.mjs'

const SQL_KEYS = ['sql', 'generated_sql']

export class ProtocolError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ProtocolError'
    this.isProtocolError = true
  }
}

// H1 mitigation (research H1): assert exactly ONE assistant/message per run interval.
export function validateRunResult(runResult) {
  const events = runResult?.events ?? []
  const count = events.filter((e) => e.type === 'assistant/message').length
  if (count !== 1) {
    throw new ProtocolError(
      `H1 protocol error: expected exactly 1 assistant/message in run interval, got ${count} ` +
      `(finalResponse is "last assistant/message, not causally assigned to prompt" — derailing interval; ` +
      `research Claim H1 says scripted single-prompt mode does not trigger this, so a count != 1 is a real fault)`
    )
  }
}

// extractReply: reduce one run's RunResult to the AgentTurnReply the session needs.
// reply = finalResponse (TS SDK gives it directly). generatedSql = sql found in a tool/call event
// (the agent's query tool). Empty reply if nothing (rbi: "agent said nothing" is gradeable — session
// derails — not an infrastructure error, so we do not raise on empty).
export function extractReply(runResult) {
  validateRunResult(runResult)
  const events = runResult?.events ?? []
  let generatedSql = null
  for (const e of events) {
    if (e.type !== 'tool/call') continue
    const data = e.data && typeof e.data === 'object' ? e.data : {}
    const args = data.arguments && typeof data.arguments === 'object' ? data.arguments : {}
    if (generatedSql == null) {
      for (const k of SQL_KEYS) {
        const v = data[k] ?? args[k]
        if (typeof v === 'string' && v.trim()) { generatedSql = v; break }
      }
    }
  }
  const reply = String(runResult?.finalResponse ?? '')
  return new AgentTurnReply({ reply, generated_sql: generatedSql })
}

// buildAgentResponder: wrap a (stubbed) DeepSeekHarness as the async callable the driver consumes.
// rbi build_agent_responder: "Takes a pipeline; does not build one" (D9 DI boundary — the evaluator
// never constructs the agent under test). Conversation memory lives in the harness's own session state
// (keyed by session_id), NOT in a per-turn buffer (rbi's fresh TurnContext was a per-turn buffer for ITS
// pipeline; TS SDK session persistence is keyed by session_id — multi-turn = same session, multiple run()).
export function buildAgentResponder(harness) {
  return async function _respond(request) {
    const runResult = await harness.run(request.message, request.session_id)
    return extractReply(runResult)
  }
}
