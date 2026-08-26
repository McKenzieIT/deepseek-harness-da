/**
 * P-DA4b §2 — Scope-sensitive state reset on `scopes/active-changed`.
 *
 * Wired into the PhaseGate constructor as an event listener. When the active
 * scope changes, clears all scope-dependent data fields while preserving
 * question-scoped budget counters and interaction state.
 *
 * Design decision (from P-DA4 prototype): phase position (current_phase/phase_idx)
 * is question-scoped, NOT scope-scoped — a mid-INTERPRETATION switch_scope (rare
 * but valid for cross-scope comparison) keeps the phase. Only cached DATA from
 * the prior scope is cleared.
 */
import type { PhaseGateState } from '@deepseek-ai/dsh-phase-gate/src/types.ts'

/**
 * Reset the subset of PhaseGateState fields that are scope-sensitive.
 *
 * RESETS (scope-bound data, meaningless after switch):
 * - scope_id → new scope
 * - last_sql, last_query_outcome, last_failure_kind, last_query_error (F2 same-source)
 * - self_evolution_table (table name from prior scope's not_found)
 * - last_critique, last_quality (critic scores for prior scope's SQL)
 * - candidate_tables (prior scope's search results)
 * - event_params (prior scope's event definitions)
 * - partition_cols (prior scope's table definitions)
 * - last_search_empty, last_retrieve_empty (grounding backstop)
 * - definition_loaded (grounding gate — must re-establish for new scope)
 *
 * PRESERVES (question-scoped / interaction state):
 * - current_phase, phase_idx, phase_attempts, fallback_count
 * - llm_call_count, exec_count, turn_count, step_count
 * - delivery_started, awaiting_clarification, subquestions
 * - phase_output (current turn's text — relevant to current phase, not scope)
 * - honest_decline_reason, cancelled, cancelled_reason
 * - prior_status, stall_timer
 * - execution_auto_advance
 */
export function resetScopeSensitiveState(state: PhaseGateState, newScopeId: string): void {
  // Identity
  state.scope_id = newScopeId

  // SQL state (F2 same-source: old scope's SQL can't constrain new scope)
  state.last_sql = null
  state.last_query_outcome = null
  state.last_failure_kind = null
  state.last_query_error = null
  state.self_evolution_table = null
  state.last_critique = null
  state.last_quality = null

  // Grounding data (scope-specific corpus results)
  state.candidate_tables = new Set()
  state.event_params = new Set()
  state.partition_cols = new Set()

  // Grounding backstop (must re-establish for new scope)
  state.last_search_empty = true
  state.last_retrieve_empty = true
  state.definition_loaded = false
}

/**
 * Wire the scope-change listener into the PhaseGate constructor.
 *
 * Production integration (sketch — goes into PhaseGate constructor body):
 *
 * ```ts
 * ctx.on('scopes/active-changed', (scopeId) => {
 *   if (scopeId === undefined) return  // clearActive — no valid scope to reset to
 *   for (const [_agentId, state] of this.sessions) {
 *     // Only reset active sessions (not terminal ones)
 *     if (state.current_phase !== 'COMPLETE' && state.current_phase !== 'DECLINED') {
 *       resetScopeSensitiveState(state, scopeId)
 *     }
 *   }
 * })
 * ```
 *
 * NOTE: For the single-agent production case, `this.sessions` has exactly one
 * entry. For delegate_query (P-DA4 resolved: NOT a subagent, uses Nl2sqlEngine
 * directly), no session entry exists in the parent's phase-gate, so this
 * listener is safe — it won't touch delegate paths.
 */
export const INTEGRATION_SKETCH = 'see docstring above'
