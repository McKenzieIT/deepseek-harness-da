/**
 * `MultiTurnSession` — fixed-script multi-turn eval state machine (1:1
 * re-expression of `rbi_eval.multi_turn.session.MultiTurnSession` on da seams).
 * The "user" side is pre-recorded in `case.input.turns` (user/assistant
 * alternating); an external caller drives via `nextInput()` /
 * `submitResponse()`. After all scripted user turns, the final input is
 * `case.input.question` (the terminal turn). A single-turn case is a session
 * with an empty script (the first `nextInput()` already serves the terminal
 * question + the first `submitResponse()` routes to terminal scoring).
 *
 * DA adaptation: rbi `submit_response` is sync (`score_l1` is sync); da
 * `submitResponse` is **async** because `scoreDa`'s DELIVERY LLM-judge is async
 * (a faithful da reality — LLM calls are async). The session still owns the
 * verdict (mirrors rbi `SubmitResponseResult.l1` — persist the scoring that
 * produced the verdict, so a caller does not re-score).
 *
 * @module @deepseek-ai/dsh-eval/session
 */

import { turnMatchesExpectation } from './text_sim.ts'
import { scoreDa } from './scoring.ts'
import type { EvalCase, Turn } from './eval_case.ts'
import type { DeliveryOpts } from './delivery.ts'
import type { ExecutionResult, JudgeProvider, MultiTurnDiagnostic, ScoreDaResult, SessionState, SubmitResponseResult } from './types.ts'

/**
 * Guard against a script that never terminates (the session ends itself on
 * the terminal turn or on derailment, so hitting this means a bug).
 */
export const MAX_TURNS_PER_ATTEMPT = 64

/** Inputs to `submitResponse` (the scoreDa collaborators). */
export interface SubmitResponseOpts {
  readonly generatedSql: string | null
  readonly executionResult: ExecutionResult | null
  readonly provider: JudgeProvider | null
  /** DELIVERY tunables threaded to `scoreDa` (undefined ⇒ `scoreDa`/`scoreDelivery` defaults). */
  readonly deliveryOpts: DeliveryOpts | undefined
}

/** `MultiTurnSession` — fixed-script multi-turn (and single-turn) eval state machine. */
export class MultiTurnSession {
  private readonly _case: EvalCase
  private readonly _sessionId: string
  private readonly _runId: string
  private _state: SessionState = 'pending'
  private readonly _userTurns: readonly Turn[]
  private readonly _assistantTurns: readonly Turn[]
  private _userCursor = 0
  private _servedTerminal = false
  private _streak = 0
  private _responseCount = 0
  private _diagnostic: MultiTurnDiagnostic | null = null

  /**
   * @param case_ - the validated case (`input.turns` may be empty for
   * single-turn; a non-empty script must have ≥1 user turn, enforced by the
   * zod schema).
   * @param sessionId - unique id for this session (typically `run_id:case_id:attempt`).
   * @param runId - the eval run this session belongs to.
   */
  constructor(case_: EvalCase, sessionId: string, runId: string) {
    this._case = case_
    this._sessionId = sessionId
    this._runId = runId
    const turns = case_.input.turns
    this._userTurns = turns.filter(t => t.role === 'user')
    this._assistantTurns = turns.filter(t => t.role === 'assistant')
    if (turns.length > 0 && this._userTurns.length === 0) {
      throw new Error(`MultiTurnSession requires ≥1 user turn in a non-empty script (case ${case_.case_id})`)
    }
  }

  get state(): SessionState { return this._state }
  get sessionId(): string { return this._sessionId }
  get runId(): string { return this._runId }
  get caseId(): string { return this._case.case_id }
  get streak(): number { return this._streak }
  get diagnostic(): MultiTurnDiagnostic | null { return this._diagnostic }

  /** The next scripted user-turn content; first call transitions `pending → running`. */
  nextInput(): string {
    if (this._state === 'terminated' || this._state === 'completed') {
      throw new Error(`Cannot call nextInput() in state ${this._state} — session has ended`)
    }
    if (this._state === 'pending') this._state = 'running'
    const turn = this._userTurns[this._userCursor]
    if (turn === undefined) {
      this._servedTerminal = true
      return this._case.input.question
    }
    this._userCursor++
    return turn.content
  }

  /** Submit the agent's reply for the current turn (async — DELIVERY LLM-judge is async). */
  async submitResponse(agentReply: string, opts: SubmitResponseOpts): Promise<SubmitResponseResult> {
    if (this._state !== 'running') {
      throw new Error(`Cannot call submitResponse() in state ${this._state} — expected 'running'`)
    }
    this._responseCount++
    if (this._servedTerminal) {
      return this._handleTerminal(agentReply, opts)
    }
    const expectedIdx = this._responseCount - 1
    const expected = this._assistantTurns[expectedIdx]
    const matches = expected !== undefined && turnMatchesExpectation(agentReply, expected.content)
    if (matches) {
      this._streak++
      const peekTurn = this._userTurns[this._userCursor]
      const peek = peekTurn !== undefined ? peekTurn.content : this._case.input.question
      return { status: 'continue', nextInput: peek, verdict: null, streak: this._streak, diagnostic: null, l1: null }
    }
    return this._handleDerailment(agentReply, opts)
  }

  /** Terminal turn: run `scoreDa`, transition to `completed`. */
  private async _handleTerminal(agentReply: string, opts: SubmitResponseOpts): Promise<SubmitResponseResult> {
    const scored = await scoreDa(this._case, {
      generatedSql: opts.generatedSql,
      executionResult: opts.executionResult,
      finalResponse: agentReply,
      provider: opts.provider,
      deliveryOpts: opts.deliveryOpts,
    })
    this._state = 'completed'
    this._diagnostic = {
      sessionId: this._sessionId,
      totalTurns: this._responseCount,
      streak: this._streak,
      terminalVerdict: scored.verdict,
      derailedAtTurn: null,
    }
    return { status: 'completed', nextInput: null, verdict: scored.verdict, streak: this._streak, diagnostic: this._diagnostic, l1: scored }
  }

  /** Derailment: run `scoreDa`, map verdict (`pass`/`partial`→`partial`; `fail`→`fail`), terminate. */
  private async _handleDerailment(agentReply: string, opts: SubmitResponseOpts): Promise<SubmitResponseResult> {
    const scored = await scoreDa(this._case, {
      generatedSql: opts.generatedSql,
      executionResult: opts.executionResult,
      finalResponse: agentReply,
      provider: opts.provider,
      deliveryOpts: opts.deliveryOpts,
    })
    const verdict: ScoreDaResult['verdict'] = scored.verdict === 'pass' ? 'partial' : 'fail'
    this._state = 'terminated'
    this._diagnostic = {
      sessionId: this._sessionId,
      totalTurns: this._responseCount,
      streak: this._streak,
      terminalVerdict: verdict,
      derailedAtTurn: this._responseCount,
    }
    return { status: 'terminated', nextInput: null, verdict, streak: this._streak, diagnostic: this._diagnostic, l1: { ...scored, verdict } }
  }
}
