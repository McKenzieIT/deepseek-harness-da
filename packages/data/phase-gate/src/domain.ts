/**
 * Phase-gate runtime domain — the four-phase pipeline constants, gate
 * verdicts, critic findings, tool whitelists, and route/marker primitives.
 *
 * Faithful re-expression of reverse-bi `DataAgentPipeline` (`pipeline.py`,
 * `phases.py`, `factory.py`) phase-gated orchestration on harness event seams
 * (NOT a custom agent-loop, NOT collapsing phases — map ③③). Exact values
 * (max_attempts / timeout / fallback) cite `factory.py` `default_phase_configs`;
 * budgets cite `phases.py` `PipelineConfig`.
 *
 * Runtime values live here; pure type/interface declarations live in
 * `./types.ts` (repo rule: `src/types.ts` contains only types).
 *
 * @module @deepseek-ai/dsh-phase-gate/domain
 */

import type { PhaseConfig, PhaseGateState } from './types.ts'

export const Phase = Object.freeze({
  UNDERSTANDING: 'understanding',
  GENERATION: 'generation',
  EXECUTION: 'execution',
  INTERPRETATION: 'interpretation',
} as const)
/** The phase string-literal union type derived from the `Phase` const object values. */
export type Phase = (typeof Phase)[keyof typeof Phase]

/** Terminal markers (not real phases) recorded on `current_phase`. */
export const PhaseTerminal = Object.freeze({
  COMPLETE: 'COMPLETE',
  DECLINED: 'DECLINED',
} as const)

/** The canonical phase-advance order; `advance()` indexes this and `PHASE_CONFIGS` keys it. */
export const PHASE_ORDER: readonly Phase[] = [
  Phase.UNDERSTANDING,
  Phase.GENERATION,
  Phase.EXECUTION,
  Phase.INTERPRETATION,
]

/**
 * Single source for BOTH the prompt-side (phase instructions) and the
 * parse-side (gate regex) — `phases.py` comment: splitting these would let a
 * prompt-wording change silently break the gate parse.
 */
export const DECOMPOSITION_MARKER = '【decompose】'
/**
 * Marker the model emits in INTERPRETATION when it cannot answer this turn;
 * the turn-stopping gate reads it and triggers honest_decline (not clarification).
 */
export const INCOMPLETE_MARKER = '【incomplete】'

/**
 * Route token the model emits at the end of an UNDERSTANDING turn (after
 * search + load) to signal its route decision. Single source for BOTH the
 * prompt-side (persona teaches the token) and the parse-side (the route_gate
 * regex) — splitting these would let a prompt-wording change silently break
 * the gate parse (mirrors `INCOMPLETE_MARKER`/`interpretGate`). The model
 * emits exactly one of:
 * - `【route:proceed】` — grounding established (search returned candidates +
 *   definitions loaded), no real ambiguity → advance to GENERATION.
 * - `【route:clarify】` — a real ambiguity remains (also call
 *   present_clarification with one specific question) → gate HALTs awaiting
 *   the user.
 * - `【route:decline】` — no grounding / unanswerable → honest_decline.
 * No token → the gate defaults to proceed + runs a grounding backstop (if
 * search+retrieve found nothing it declines honestly rather than bare-run
 * GENERATION on no corpus).
 */
export const ROUTE_MARKER_REGEX = /【route:(proceed|clarify|decline)】/

/**
 * Regex matching all internal control markers (decompose, incomplete, route:*)
 * that must never leak to the presentation layer. Does NOT match user-visible
 * delivery markers (【发现】/【注意】) — those are Kind 1 (project-level i18n).
 */
const INTERNAL_MARKER_RE = /【(?:decompose|incomplete|route:[a-z]+)】/g

/**
 * Strip internal control markers from text before it reaches the presentation
 * layer. Removes decompose, incomplete, and route tokens; preserves all other
 * content (including user-visible delivery markers like 【发现】/【注意】).
 * @param text The raw phase output text.
 * @returns The cleaned text with internal markers removed and whitespace trimmed.
 */
export function stripInternalMarkers(text: string): string {
  return text.replace(INTERNAL_MARKER_RE, '').trim()
}

/**
 * Extract the route decision from UNDERSTANDING phase output. Mirrors
 * `interpretGate`'s `INCOMPLETE_MARKER` parse (single source =
 * `ROUTE_MARKER_REGEX`). The first match wins (the model emits one token).
 * @param phaseOutput The UNDERSTANDING turn's final assistant text.
 * @returns The captured route (`proceed` | `clarify` | `decline`), or `null`
 * when no route token was emitted (the gate defaults to proceed + backstop).
 */
export function extractRoute(phaseOutput: string): 'proceed' | 'clarify' | 'decline' | null {
  const m = ROUTE_MARKER_REGEX.exec(phaseOutput)
  const route = m?.[1]
  if (route === 'proceed' || route === 'clarify' || route === 'decline') return route
  return null
}

/** Gate verdict aligned with rbi `phases.py:33` `GateResult` dataclass. */
export class GateResult {
  constructor(readonly passed: boolean, readonly reason: string | null = null) {}
  /**
   * Construct a passing gate verdict carrying no failure reason.
   * @returns A `GateResult` with `passed=true` and `reason=null`.
   */
  static pass(): GateResult { return new GateResult(true) }
  /**
   * Construct a failing gate verdict carrying the failure reason.
   * @param reason Human-readable explanation of why the gate rejected this phase attempt.
   * @returns A `GateResult` with `passed=false` and the supplied reason.
   */
  static fail(reason: string): GateResult { return new GateResult(false, reason) }
}

/** One critic finding (mirror rbi `sql_critic.py` / `sql_evaluator.py` shape). */
export class CriticFinding {
  constructor(readonly rule: string, readonly severity: 'error' | 'warning', readonly message: string) {}
}

/** rbi `PipelineConfig` — ADOPTED AS INITIAL DEFAULTS (P7 D6). */
export const PipelineConfig = Object.freeze({
  max_fallbacks: 2,
  max_subquestions: 4,
  max_executions_per_turn: 8, // aligns qodercli MAX_SQL_PER_TURN; includes failures (cost guard)
  max_llm_calls_per_turn: 60, // = 3 × DEFAULT_MAX_STEPS(20)
  critique_confidence_floor: 0.6,
  quality_score_floor: 60,
  disambiguation_timeout_seconds: 300,
  forced_table_load_timeout_seconds: 30,
  max_state_turns: 20,
  default_call_timeout_seconds: 60,
  stall_watchdog_seconds: 300, // rbi `_watch_for_stall` (F3)
} as const)

/**
 * Per-phase gate config keyed by phase (gate kind, max attempts, timeout, fallback)
 * — exact rbi `factory.py` `default_phase_configs` values.
 */
export const PHASE_CONFIGS: Readonly<Record<Phase, PhaseConfig>> = {
  // P-DA1: UNDERSTANDING gate is `route_gate` (was `always_pass`). The model
  // emits a 【route:proceed|clarify|decline】 token after search+load; the gate
  // parses it (mirrors INCOMPLETE_MARKER/interpretGate). proceed/no-token →
  // advance (with a grounding backstop: search+retrieve empty → honest_decline,
  // don't bare-run GENERATION on no corpus); clarify → awaiting_clarification +
  // HALT; decline → honest_decline.
  [Phase.UNDERSTANDING]: { gate: 'route_gate', max_attempts: 5, timeout_seconds: 60, fallback_phase: null },
  [Phase.GENERATION]: { gate: 'sql_syntax_gate', max_attempts: 5, timeout_seconds: 60, fallback_phase: Phase.UNDERSTANDING },
  [Phase.EXECUTION]: { gate: 'always_pass', max_attempts: 1, timeout_seconds: 120, fallback_phase: Phase.GENERATION },
  [Phase.INTERPRETATION]: { gate: 'always_pass', max_attempts: 5, timeout_seconds: 60, fallback_phase: null },
}

/**
 * Per-phase tool whitelists (rbi tool names). phase-gate hard-rejects a call
 * whose name is not in the current phase's list via `ctx.tools.guard()` (D5).
 * Not-yet-shipped da tools are simply unregistered (model can't call them);
 * the guard is forward-compatible — names here are the stable rbi roster.
 */
export const UNIVERSAL_TOOLS = Object.freeze([
  'resolve_term',
  'get_user_preferences',
  'load_accumulated_definition',
  // #2b self-evolution: present_clarification is callable in ANY phase. The
  // model asks the user a clarifying question (e.g. which ODPS project a table
  // lives in after a TABLE_NOT_FOUND) wherever the ambiguity surfaces — not
  // just UNDERSTANDING route:clarify. captureToolData flags awaiting_clarification
  // on the call (any phase) and onTurnStopping HALTs awaiting the user reply.
  'present_clarification',
  // C_prior (G1b): goal/todo are planning tools with no side effects on SQL
  // generation/execution — safe in any phase. Variant C needs them in U+I;
  // UNIVERSAL avoids guard-rejected noise if the model references them elsewhere.
  'goal',
  'todo',
  // P-DA4 scope-routing: list_scopes (read-only) and switch_scope (routing is
  // orthogonal to phase progression — the model may realize it needs a different
  // scope in any phase). Safe in all phases; scope-sensitive state (last_sql,
  // candidate_tables, etc.) is reset on switch via scopes/active-changed event.
  'list_scopes',
  'switch_scope',
] as const)
/** Tool whitelist for the UNDERSTANDING phase (candidate discovery, definition loading, clarification). */
export const UNDERSTANDING_TOOLS = Object.freeze([
  'search_data_sources',
  'load_table_definition',
  'load_event_definition',
  'load_table_dimensions',
  // present_clarification is UNIVERSAL (#2b) — spreads in below; the explicit
  // entry was removed to avoid a duplicate now that it is in UNIVERSAL_TOOLS.
  'save_accumulated_definition',
  ...UNIVERSAL_TOOLS,
] as const)
/** Tool whitelist for the GENERATION phase (SQL critique/quality + schema grounding). */
export const GENERATION_TOOLS = Object.freeze([
  'critique_sql_tool',
  'evaluate_sql_quality',
  // MAJOR-1 (review fix): load_* are schema-grounding reads. GENERATION writes
  // SQL from semantic-layer-grounded fields, so the model loads a real
  // definition here to ground SQL before/while writing it — the definitions are
  // whitelisted in GENERATION too, not UNDERSTANDING-only (the prior omission
  // made the tool/README/package descriptions' "UNDERSTANDING/GENERATION"
  // claim an overclaim). Additive: no phase-gate logic touched, only whitelist
  // entries. (Subagent-review caveat: the critic's captureToolData harvest of
  // partition_cols / event_params from load_* is currently non-functional — it
  // probes the top-level result, but load_* returns { found, table|event:{…} }
  // nested; a pre-existing integration gap to fix in phase-gate, out of scope
  // here. The whitelist stands regardless: the model reads the loaded
  // definition directly.)
  'load_table_definition',
  'load_event_definition',
  // #2b self-evolution: update_table_config persists a per-table ODPS project
  // override after the user answers a present_clarification. GENERATION-scoped:
  // the model learns the project in GENERATION (post-fallback from EXECUTION
  // not_found) and persists it before regenerating the qualified SQL. RBAC
  // (Task 7) gates this to admin — safe-by-default (non-admin → reject).
  'update_table_config',
  ...UNIVERSAL_TOOLS,
] as const)
/** Tool whitelist for the EXECUTION phase (running the SQL query through the Guard Chain). */
export const EXECUTION_TOOLS = Object.freeze(['query_data', ...UNIVERSAL_TOOLS] as const)
/** Tool whitelist for the INTERPRETATION phase (delivery: decomposition, table, compute, followups). */
export const INTERPRETATION_TOOLS = Object.freeze([
  'present_decomposition',
  'present_table',
  'compute',
  'record_template_usage',
  'suggest_followups',
  ...UNIVERSAL_TOOLS,
] as const)

/** Map of phase to its tool whitelist; `ctx.tools.guard` reads the current phase's list to hard-reject disallowed calls (D5). */
export const PHASE_TOOLS: Readonly<Record<Phase, readonly string[]>> = {
  [Phase.UNDERSTANDING]: UNDERSTANDING_TOOLS,
  [Phase.GENERATION]: GENERATION_TOOLS,
  [Phase.EXECUTION]: EXECUTION_TOOLS,
  [Phase.INTERPRETATION]: INTERPRETATION_TOOLS,
}

/**
 * Construct a fresh per-agent phase-gate state object rooted in the UNDERSTANDING phase.
 * @param scopeId The analytics scope identifier (e.g. the calling agent's scope) this state is keyed to.
 * @returns A new `PhaseGateState` with all counters zeroed and `current_phase=UNDERSTANDING`.
 */
export function freshPhaseGateState(scopeId = 'default'): PhaseGateState {
  return {
    scope_id: scopeId,
    current_phase: Phase.UNDERSTANDING,
    phase_idx: 0,
    phase_attempts: 0,
    fallback_count: 0,
    llm_call_count: 0,
    exec_count: 0,
    turn_count: 0,
    delivery_started: false,
    phase_output: '',
    awaiting_clarification: false,
    subquestions: [],
    last_sql: null,
    last_query_outcome: null,
    last_failure_kind: null, // #1/#2b: no query failure harvested yet.
    last_query_error: null, // #1/#2b: no query error harvested yet.
    self_evolution_table: null,
    last_critique: null,
    last_quality: null,
    honest_decline_reason: null,
    cancelled: false,
    cancelled_reason: null,
    candidate_tables: new Set(),
    prior_turn_tables: new Set(),
    event_params: new Set(),
    partition_cols: new Set(),
    last_search_empty: true,
    last_retrieve_empty: true,
    definition_loaded: false, // GROUNDING GATE (c): no definition loaded yet.
    prior_status: null,
    stall_timer: null,
    step_count: 0,
    execution_auto_advance: false,
  }
}
