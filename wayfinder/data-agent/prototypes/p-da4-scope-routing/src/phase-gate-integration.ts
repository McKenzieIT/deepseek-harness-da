/**
 * Phase-gate integration for scope routing.
 *
 * This file sketches the ADDITIONS to the existing phase-gate plugin
 * (packages/data/phase-gate/src/phase-gate.ts) needed for scope-aware routing.
 * These are NOT standalone — they'd be wired into the existing phase-gate plugin.
 *
 * ## Changes to phase-gate:
 *
 * 1. Listen on `scopes/active-changed` → reset scope-sensitive state
 * 2. Tool whitelist additions (list_scopes, switch_scope, delegate_query)
 * 3. `freshPhaseGateState` already accepts scopeId — no change needed there
 *
 * @module (sketch — not a real module)
 */

import type { PhaseGateState } from './types.ts'

// ── 1. Scope-sensitive state reset (wired to `scopes/active-changed`) ────

/**
 * Reset the subset of PhaseGateState that is scope-sensitive. Called when the
 * active scope changes mid-session (via switch_scope or programmatic setActive).
 *
 * Does NOT reset:
 * - current_phase / phase_idx (phase position is question-scoped, not scope-scoped)
 * - llm_call_count / exec_count / turn_count (budget counters are question-scoped)
 * - delivery_started / awaiting_clarification (interaction state)
 *
 * DOES reset:
 * - last_sql (F2 same-source: previous scope's SQL is meaningless)
 * - candidate_tables (previous scope's search results)
 * - event_params (previous scope's event definitions)
 * - partition_cols (previous scope's table definitions)
 * - definition_loaded (grounding must re-establish for new scope)
 * - last_search_empty / last_retrieve_empty (grounding backstop)
 * - scope_id (informational field, now reflects new scope)
 */
export function resetScopeSensitiveState(state: PhaseGateState, newScopeId: string): void {
  state.scope_id = newScopeId
  state.last_sql = null
  state.last_query_outcome = null
  state.last_failure_kind = null
  state.last_query_error = null
  state.self_evolution_table = null
  state.last_critique = null
  state.last_quality = null
  state.candidate_tables = new Set()
  state.event_params = new Set()
  state.partition_cols = new Set()
  state.last_search_empty = true
  state.last_retrieve_empty = true
  state.definition_loaded = false
}

// ── 2. Tool whitelist additions ──────────────────────────────────────────

/**
 * Additions to PHASE_TOOLS (packages/data/phase-gate/src/types.ts):
 *
 * UNIVERSAL_TOOLS += ['list_scopes']
 * UNDERSTANDING_TOOLS += ['switch_scope', 'delegate_query']
 *
 * list_scopes is read-only and safe anywhere.
 * switch_scope and delegate_query are UNDERSTANDING-only: scope must be
 * determined before SQL generation begins. The fallback mechanism
 * (GENERATION fails → retry UNDERSTANDING) gives the model a second chance
 * if it initially chose the wrong scope.
 */

// ── 3. Event listener wiring (in phase-gate constructor) ─────────────────

/**
 * Sketch of the listener wired in the phase-gate plugin's constructor:
 *
 *   ctx.on('scopes/active-changed', (scopeId) => {
 *     if (scopeId === undefined) return
 *     // Reset scope-sensitive state for ALL active agents
 *     for (const [_sessionId, state] of this.states) {
 *       if (state.current_phase !== 'COMPLETE' && state.current_phase !== 'DECLINED') {
 *         resetScopeSensitiveState(state, scopeId)
 *       }
 *     }
 *   })
 *
 * NOTE: This resets ALL agents' states. For single-agent setups (current
 * production) this is fine. For multi-agent (delegate_query subagents), the
 * subagent has its own phase-gate state (per-session key), so the parent's
 * listener doesn't affect it (different session id → different state entry).
 */
