// PROTOTYPE (throwaway) — P11 eval harness · harness-stub — STAND-IN for the da seams the eval logic
// rides on. All stands-in mirror the seams' CONTRACTS (shape), not their internals. Real wiring = P11b.
//
// Stands in for:
//   - @deepseek-ai/dsh-sdk-client DeepSeekHarness.run(message, sessionId) -> RunResult { finalResponse, events }
//     (the AgentResponder target; G2 "owns the client contract"). Multi-turn = same session_id, multiple run().
//   - dsh-llm-replay determinism (Cordis plugin, loaded via runtime cordis.yml + DSH_SNAPSHOT_FILE env,
//     language-agnostic — research Claim G). The stub returns CANNED deterministic RunResults keyed by
//     session/message (the "recorded JSONL" is an in-memory script); real llm-replay replays an LLM stream.
//   - ctx.query.execute (locked #5: in-process stub ODPS — canned rows frozen to fixture date; the EVAL
//     re-runs the agent's generated SQL here for a deterministic actual result set).
//   - llm-dashscope LLM-judge (locked #4: stub LLMProvider — scripted verdicts + simulated failures to
//     validate injection + retry/backoff + classify_error + AuthenticationAbort).
//   - Promise.race timeout hang simulation (S7) + H1 derailing interval (S8).

// ---- TS SDK RunResult / event shapes (packages/sdk/client types.ts; session SessionEventMap) ----
export function assistantMessage(text) {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } }
}
export function toolCall(name, args) {
  return { type: 'tool/call', data: { name, arguments: args } }
}

// A normal RunResult: one assistant/message (the reply) + optional tool/call (the agent's SQL).
export function runResult(reply, { sql = null, tool = 'query_data' } = {}) {
  const events = []
  if (sql) events.push(toolCall(tool, { sql }))
  events.push(assistantMessage(reply))
  return { finalResponse: reply, events, notifications: [] }
}

// A DERAILING RunResult (H1 violation): >=2 assistant/messages in one interval. finalResponse = last.
export function runResultDerailing(...replies) {
  const events = replies.map(assistantMessage)
  return { finalResponse: replies[replies.length - 1], events, notifications: [] }
}

// ---- Stub DeepSeekHarness (dsh-llm-replay stand-in) ----
// `script`: (message, sessionId) => RunResult  (deterministic canned response per the "recorded" session)
// `hangUntilRespawn`: if true, run() never resolves until respawn() — models a runtime that hung
//   (S7: Promise.race timeout fires -> onTimeout close+respawn -> next attempt runs on fresh runtime).
export class StubHarness {
  constructor({ script, hangUntilRespawn = false } = {}) {
    this._script = script
    this._hangUntilRespawn = hangUntilRespawn
    this._closed = false
    this._respawnCount = 0
    this.runLog = []
  }
  async run(message, sessionId) {
    if (this._closed) {
      const e = new Error('harness closed (runtime closed after timeout); respawn to reuse')
      e.isClosed = true
      throw e
    }
    if (this._hangUntilRespawn) {
      this.runLog.push({ sessionId, message, outcome: 'HANG' })
      return new Promise(() => {}) // never resolves -> Promise.race wall-clock timeout fires
    }
    const out = this._script(message, sessionId)
    this.runLog.push({
      sessionId, message,
      outcome: typeof out?.finalResponse === 'string' ? out.finalResponse.slice(0, 40) : String(out),
    })
    return out
  }
  close() { this._closed = true }
  respawn() { this._closed = false; this._hangUntilRespawn = false; this._respawnCount++ }
  get closed() { return this._closed }
  get respawnCount() { return this._respawnCount }
}

// ---- Stub ctx.query.execute (locked #5: in-process stand-in ODPS) ----
// `table`: Map sql -> { rows, columns } OR (sql) => { rows, columns } OR { rows, columns }.
// Returns { success, rows, columns, error, failure_class }. Unknown SQL -> semantic error (scoreable fail).
export function makeStubExecute(table) {
  return async function executeSql(sql) {
    let r
    if (typeof table === 'function') r = table(sql)
    else if (table instanceof Map) r = table.get(sql)
    else r = table
    if (r == null) {
      return {
        success: false, rows: [], columns: [],
        error: 'ODPS: semantic error (unknown SQL to stub)', failure_class: 'syntax_error',
      }
    }
    return { success: true, rows: r.rows, columns: r.columns ?? [], error: null }
  }
}

// ---- Stub LLM-judge provider (locked #4) ----
// `behaviors`: queue of { score, rationale } | { throw: 'auth'|'retryable'|'unclassified', msg }.
// Each call pops the next. Throws errors with messages classifyError routes correctly:
//   auth -> '401 unauthorized ...'; retryable -> '429 rate limit ...'; unclassified -> 'malformed ...'.
// `opts`: judge opts (backoff/sleep/maxRetries) — tests pass instant backoff+sleep.
export function makeStubJudgeProvider(behaviors, opts = {}) {
  const queue = [...behaviors]
  const calls = []
  const provider = {
    judge: async (prompt) => {
      calls.push(prompt)
      const b = queue.shift() ?? { score: 1, rationale: 'default pass' }
      if (b.throw) {
        const msg =
          b.throw === 'auth' ? `401 unauthorized: ${b.msg ?? 'invalid credential'}` :
          b.throw === 'retryable' ? `429 rate limit exceeded: ${b.msg ?? 'please retry'}` :
          `malformed judge response: ${b.msg ?? 'unexpected payload'}`
        throw new Error(msg)
      }
      return { score: b.score ?? 1, rationale: b.rationale ?? 'stub verdict' }
    },
    opts: { backoff: [1, 1, 1], sleep: () => Promise.resolve(), ...opts },
  }
  return { provider, calls }
}
