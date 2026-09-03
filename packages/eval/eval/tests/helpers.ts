/**
 * Test helpers: stub collaborators ported from the P11 prototype's
 * `harness-stub.mjs` (in-process stubs — the eval library is zero-seam-dep,
 * so tests inject stub `Responder`/`CaseSqlExecutor`/`JudgeProvider`).
 */

import { EvalCaseSchema, type EvalCase } from '../src/eval_case.ts'
import type { CaseSqlExecutor, ExecutionResult, JudgePrompt, JudgeProvider, JudgeVerdict, RunResultEvent, RunResultView } from '../src/types.ts'

/** Build + validate a case from a plain spec (mirrors the prototype's `makeCase`). */
export function makeCase(spec: Record<string, unknown>): EvalCase {
  return EvalCaseSchema.parse(spec)
}

/** A `tool/call` event (the agent's query tool call). */
export function toolCall(name: string, args: Record<string, unknown>): RunResultEvent {
  return { type: 'tool/call', data: { name, arguments: args } }
}

/** An `assistant/message` event carrying one text block. */
export function assistantMessage(text: string): RunResultEvent {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } }
}

/** A normal `RunResult`: one `assistant/message` (the reply) + an optional `tool/call` (the agent's SQL). */
export function runResult(reply: string, opts: { sql?: string | null; tool?: string } = {}): RunResultView {
  const events: RunResultEvent[] = []
  if (opts.sql) events.push(toolCall(opts.tool ?? 'query_data', { sql: opts.sql }))
  events.push(assistantMessage(reply))
  return { finalResponse: reply, events, notifications: [] }
}

/** A multi-step `RunResult`: multiple `assistant/message` events (four-stage agent). `finalResponse` = the last reply. */
export function runResultMultiStep(
  replies: string[],
  opts: { sql?: string | null; tool?: string; extraToolCalls?: RunResultEvent[] } = {},
): RunResultView {
  const events: RunResultEvent[] = []
  if (opts.extraToolCalls) events.push(...opts.extraToolCalls)
  if (opts.sql) events.push(toolCall(opts.tool ?? 'query_data', { sql: opts.sql }))
  for (const r of replies) events.push(assistantMessage(r))
  return { finalResponse: replies[replies.length - 1] ?? '', events, notifications: [] }
}

/** A derailing `RunResult` (H1 violation): ≥2 `assistant/message`s; `finalResponse` = the last. */
export function runResultDerailing(...replies: string[]): RunResultView {
  const events = replies.map(assistantMessage)
  return { finalResponse: replies[replies.length - 1] ?? '', events, notifications: [] }
}

/** A stand-in `DeepSeekHarness`: `run(message, sessionId) → RunResult` from a script; optional hang-until-respawn (S7) + close/respawn. */
export class StubHarness {
  private readonly _script: (message: string, sessionId: string) => RunResultView
  private _hangUntilRespawn: boolean
  private _closed = false
  private _respawnCount = 0
  readonly runLog: { sessionId: string; message: string; outcome: string }[] = []

  constructor(opts: { script: (message: string, sessionId: string) => RunResultView; hangUntilRespawn?: boolean }) {
    this._script = opts.script
    this._hangUntilRespawn = opts.hangUntilRespawn ?? false
  }

  async run(message: string, sessionId: string): Promise<RunResultView> {
    if (this._closed) {
      const e = new Error('harness closed (runtime closed after timeout); respawn to reuse')
      ;(e as Error & { isClosed: boolean }).isClosed = true
      throw e
    }
    if (this._hangUntilRespawn) {
      this.runLog.push({ sessionId, message, outcome: 'HANG' })
      return new Promise<RunResultView>(() => {}) // never resolves → Promise.race wall-clock timeout fires
    }
    const out = this._script(message, sessionId)
    this.runLog.push({ sessionId, message, outcome: out.finalResponse.slice(0, 40) })
    return out
  }

  close(): void { this._closed = true }
  respawn(): void { this._closed = false; this._hangUntilRespawn = false; this._respawnCount++ }
  get closed(): boolean { return this._closed }
  get respawnCount(): number { return this._respawnCount }
}

/**
 * A stand-in `ctx.query.execute`: `Map<sql, {rows, columns?}>` or a function
 * or a fixed result. Unknown SQL → a scoreable `syntax_error`.
 */
export function makeStubExecute(
  table:
    | Map<string, { rows: readonly Record<string, unknown>[]; columns?: string[] }>
    | ((sql: string) => {
      rows: readonly Record<string, unknown>[]
      columns?: string[]
    } | null)
    | { rows: readonly Record<string, unknown>[]; columns?: string[] },
): CaseSqlExecutor {
  return async (sql: string): Promise<ExecutionResult> => {
    let r: { rows: readonly Record<string, unknown>[]; columns?: string[] } | null
    if (typeof table === 'function') r = table(sql)
    else if (table instanceof Map) r = table.get(sql) ?? null
    else r = table
    if (r === null) {
      return { success: false, rows: [], rowCount: 0, error: 'ODPS: semantic error (unknown SQL to stub)', failureClass: 'syntax_error' }
    }
    return { success: true, rows: r.rows, rowCount: r.rows.length, error: null, failureClass: null }
  }
}

/** One stub judge behavior: a verdict, or a throw (auth/retryable/unclassified) the `classifyError` routes. */
export interface StubJudgeBehavior {
  readonly score?: number
  readonly rationale?: string
  readonly throw?: 'auth' | 'retryable' | 'unclassified'
  readonly msg?: string
}

/** A stand-in DELIVERY LLM-judge: pops behaviors per call; throws errors `classifyError` routes by message. */
export function makeStubJudge(behaviors: readonly StubJudgeBehavior[]): { provider: JudgeProvider; calls: JudgePrompt[] } {
  const queue = [...behaviors]
  const calls: JudgePrompt[] = []
  const provider: JudgeProvider = async (prompt) => {
    calls.push(prompt)
    const b = queue.shift() ?? { score: 1, rationale: 'default pass' }
    if (b.throw !== undefined) {
      const msg = b.throw === 'auth'
        ? `401 unauthorized: ${b.msg ?? 'invalid credential'}`
        : b.throw === 'retryable'
          ? `429 rate limit exceeded: ${b.msg ?? 'please retry'}`
          : `malformed judge response: ${b.msg ?? 'unexpected payload'}`
      throw new Error(msg)
    }
    const verdict: JudgeVerdict = { score: b.score ?? 1, rationale: b.rationale ?? 'stub verdict' }
    return verdict
  }
  return { provider, calls }
}

/** Instant-backoff `DeliveryOpts.judge` for tests (no real sleeps). */
export const INSTANT_JUDGE = { backoff: [1, 1, 1] as readonly number[], sleep: () => Promise.resolve() }
