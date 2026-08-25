/**
 * The `AgentResponder` adapter — wraps a `DeepSeekHarness`-like runtime
 * (`run(message, sessionId) → RunResultView`) as the async `Responder` the
 * multi-turn driver consumes (G2: the TS SDK "owns the client contract"). The
 * library is zero-seam-dep: it does **not** import `@deepseek-ai/dsh-sdk-client`;
 * `RunResultView` is a minimal structural interface the real `RunResult`
 * satisfies. The host wires the real `DeepSeekHarness` to `HarnessLike`
 * (typically a one-line adapter: `run: (msg, sid) => harness.run(msg, { sessionId: sid })`)
 * — D9: the evaluator is handed the collaborator; it never constructs/owns the
 * agent under test (the runtime lifecycle is the host's, including
 * close/respawn on a wall-clock timeout).
 *
 * `extractReply` uses `finalResponse` as `reply` (the last assistant/message
 * in the interval) and parses the agent's generated SQL out of the **last**
 * `tool/call` event whose tool name matches the query tool (default
 * `query_data`). The eval then RE-RUNS that SQL via the injected
 * `CaseSqlExecutor` for a deterministic actual (G2 "跑 da 自己的 ODPS"), not
 * the agent's trace `tool/result`.
 *
 * H1 mitigation (research Claim H1): `finalResponse` is "the last
 * `assistant/message` in the interval, NOT causally assigned to the prompt" —
 * steering / queued work could contribute before idle. Caveat-a established
 * that the four-stage data-agent (UNDERSTANDING→GENERATION→EXECUTION→
 * INTERPRETATION) emits 4+ `assistant/message` events per turn. The adapter
 * accepts count >= 1 (an empty interval with 0 messages is a real fault).
 *
 * @module @deepseek-ai/dsh-eval/adapter
 */

import type { AgentTurnReply, Responder, RunResultView, RunResultEvent } from './types.ts'

/** Keys a `tool/call` event's `data` (or `data.arguments`) may use for the generated SQL. */
const SQL_KEYS: readonly string[] = ['sql', 'generated_sql']

/** Tool names considered as the "query tool" when extracting generated SQL. */
const QUERY_TOOL_NAMES: readonly string[] = ['query_data']

/** Raised when the H1 mitigation trips: a run interval carried zero `assistant/message` events. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

/**
 * Assert at least ONE `assistant/message` per run interval. Zero messages is
 * a protocol fault (the agent produced no response). Multi-message intervals
 * are valid — the four-stage agent emits one per step.
 * @param runResult - one run's `RunResult`.
 * @throws {ProtocolError} when the count is 0.
 */
export function validateRunResult(runResult: RunResultView): void {
  const count = runResult.events.filter(e => e.type === 'assistant/message').length
  if (count < 1) {
    throw new ProtocolError(
      `H1 protocol error: expected at least 1 assistant/message in run interval, got ${count} `
      + '(an empty interval means the agent produced no response — a real fault)',
    )
  }
}

/**
 * Reduce one run's `RunResult` to the `AgentTurnReply` the session needs.
 * `reply = finalResponse` (the last assistant/message); `generatedSql` = the
 * SQL from the **last** `tool/call` whose tool name matches the query tool
 * (avoids picking up SQL args from non-query tools like `critique_sql`).
 * An empty reply does not raise (rbi: "the agent said nothing" is gradeable —
 * the session derails — not an infrastructure error).
 * @param runResult - one run's `RunResult`.
 * @returns the reply + generated SQL.
 */
export function extractReply(runResult: RunResultView): AgentTurnReply {
  validateRunResult(runResult)
  let generatedSql: string | null = null
  for (const e of runResult.events) {
    if (e.type !== 'tool/call') continue
    if (!isQueryTool(e)) continue
    const sql = extractSql(e)
    if (sql !== null) generatedSql = sql // last one wins
  }
  const reply = String(runResult.finalResponse)
  return { reply, generatedSql, generatedBehavior: null }
}

/**
 * Check if a `tool/call` event is from the query tool (by name).
 * When the event carries no `name` field (legacy events that only have
 * `data.arguments`), we accept it — deliberate backward compat for
 * pre-named-tool transcripts. Named tools not in QUERY_TOOL_NAMES are rejected.
 */
function isQueryTool(e: RunResultEvent): boolean {
  const data = e.data
  if (data === null || typeof data !== 'object') return true // no data → legacy, accept
  const obj = data as Record<string, unknown>
  const name = obj.name
  if (typeof name !== 'string') return true // no name field → legacy, accept
  return QUERY_TOOL_NAMES.includes(name)
}

/**
 * Find the first non-empty SQL string in a `tool/call` event's `data` or
 * `data.arguments`. The caller guarantees `e.type === 'tool/call'`.
 */
function extractSql(e: RunResultEvent): string | null {
  const data = e.data
  if (data === null || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const args = obj.arguments
  const argObj = args !== null && typeof args === 'object' ? args as Record<string, unknown> : null
  for (const k of SQL_KEYS) {
    const vDirect = obj[k]
    if (typeof vDirect === 'string' && vDirect.trim().length > 0) return vDirect
    const vArg = argObj?.[k]
    if (typeof vArg === 'string' && vArg.trim().length > 0) return vArg
  }
  return null
}

/** A harness the adapter can wrap: `run(message, sessionId) → RunResultView`. The host adapts the real `DeepSeekHarness` to this shape. */
export interface HarnessLike {
  run(message: string, sessionId: string): Promise<RunResultView>
}

/**
 * Wrap a `HarnessLike` as the async `Responder` the driver consumes.
 * Conversation memory lives in the harness's own session state (keyed by
 * `session_id`); the adapter holds no per-turn buffer.
 * @param harness - the harness-like runtime.
 * @returns the `Responder`.
 */
export function buildAgentResponder(harness: HarnessLike): Responder {
  return async function _respond(request) {
    const runResult = await harness.run(request.message, request.sessionId)
    return extractReply(runResult)
  }
}
