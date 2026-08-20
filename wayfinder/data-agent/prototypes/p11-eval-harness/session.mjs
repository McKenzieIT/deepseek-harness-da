// PROTOTYPE (throwaway) — P11 eval harness · MultiTurnSession — fixed-script multi-turn eval state machine.
// 1:1 re-expression of rbi multi_turn/session.py design on da seams. The "user" side is pre-recorded in
// case.input.turns (user/assistant alternating); an external caller drives via next_input()/submit_response().
// After all scripted user turns, the final input is case.input.question (terminal). A single-turn case =
// a session with an empty script (session.py: first next_input() serves the question).
//
// DA ADAPTATION: rbi submit_response is SYNC (score_l1 is sync). da submit_response is ASYNC because
// scoreDa's DELIVERY LLM-judge is async. This is a faithful da reality (LLM calls are async); noted
// as a surfaced finding. The session still owns the verdict (mirrors rbi SubmitResponseResult.l1 —
// persist the scoring that produced the verdict, so a caller does not re-score).

import { turnMatchesExpectation } from './text_sim.mjs'
import { scoreDa } from './scoring.mjs'

export const MAX_TURNS_PER_ATTEMPT = 64 // rbi _MAX_TURNS_PER_ATTEMPT — guard against a script that never ends

export class MultiTurnSession {
  constructor(case_, sessionId, runId) {
    this._case = case_
    this._session_id = sessionId
    this._run_id = runId
    this._state = 'pending'

    const turns = case_.input.turns ?? []
    this._user_turns = turns.filter((t) => t.role === 'user')
    this._assistant_turns = turns.filter((t) => t.role === 'assistant')
    // rbi guard: a non-empty script with no user turn is a defect (cannot advance), not single-turn.
    if (turns.length && !this._user_turns.length)
      throw new Error(
        `MultiTurnSession requires ≥1 user turn in a non-empty script (case ${case_.case_id})`
      )

    this._user_cursor = 0
    this._served_terminal = false
    this._streak = 0
    this._response_count = 0
    this._diagnostic = null
  }

  get state() { return this._state }
  get session_id() { return this._session_id }
  get run_id() { return this._run_id }
  get case_() { return this._case }
  get streak() { return this._streak }
  get diagnostic() { return this._diagnostic }

  next_input() {
    if (this._state === 'terminated' || this._state === 'completed')
      throw new Error(`Cannot call next_input() in state ${this._state} — session has ended`)
    if (this._state === 'pending') this._state = 'running'

    if (this._user_cursor >= this._user_turns.length) {
      // All scripted user turns served; final input is the case's terminal question.
      this._served_terminal = true
      return this._case.input.question
    }
    const content = this._user_turns[this._user_cursor].content
    this._user_cursor++
    return content
  }

  async submit_response(agentReply, opts = {}) {
    const { generatedSql = null, generatedBehavior = null, executionResult = null, provider = null } = opts
    if (this._state !== 'running')
      throw new Error(`Cannot call submit_response() in state ${this._state} — expected 'running'`)
    this._response_count++

    if (this._served_terminal) {
      return this._handleTerminal({ agentReply, generatedSql, generatedBehavior, executionResult, provider })
    }

    // Non-terminal turn: check reply against the scripted assistant turn at index (response_count-1).
    const expectedIdx = this._response_count - 1
    let matches = false
    if (expectedIdx < this._assistant_turns.length) {
      matches = turnMatchesExpectation(agentReply, this._assistant_turns[expectedIdx].content)
    } // else: more responses than scripted assistant turns -> derailment (rbi).

    if (matches) {
      this._streak++
      const peek =
        this._user_cursor < this._user_turns.length
          ? this._user_turns[this._user_cursor].content
          : this._case.input.question
      return { status: 'continue', next_input: peek }
    }
    return this._handleDerailment({ agentReply, generatedSql, generatedBehavior, executionResult, provider })
  }

  async _handleTerminal({ agentReply, generatedSql, generatedBehavior, executionResult, provider }) {
    const scored = await scoreDa(this._case, {
      generatedSql,
      executionResult,
      finalResponse: agentReply,
      provider,
    })
    this._state = 'completed'
    this._diagnostic = {
      session_id: this._session_id,
      total_turns: this._response_count,
      streak: this._streak,
      terminal_verdict: scored.verdict,
      derailed_at_turn: null,
    }
    return {
      status: 'completed',
      verdict: scored.verdict,
      streak: this._streak,
      diagnostic: this._diagnostic,
      l1: scored,
    }
  }

  async _handleDerailment({ agentReply, generatedSql, generatedBehavior, executionResult, provider }) {
    const scored = await scoreDa(this._case, {
      generatedSql,
      executionResult,
      finalResponse: agentReply,
      provider,
    })
    // rbi derailment verdict mapping (session.py _handle_derailment):
    //   L1 pass/partial -> partial (right answer via wrong path); fail/error -> fail.
    // da scoreDa returns pass|fail -> pass maps to partial, fail stays fail.
    const verdict = scored.verdict === 'pass' ? 'partial' : 'fail'
    this._state = 'terminated'
    this._diagnostic = {
      session_id: this._session_id,
      total_turns: this._response_count,
      streak: this._streak,
      terminal_verdict: verdict,
      derailed_at_turn: this._response_count,
    }
    return {
      status: 'terminated',
      verdict,
      streak: this._streak,
      diagnostic: this._diagnostic,
      // rbi A3: hand back the MAPPED verdict, not the raw one, so a caller persisting it cannot diverge.
      l1: { ...scored, verdict },
    }
  }
}
