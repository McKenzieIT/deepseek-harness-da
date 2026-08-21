/**
 * Phase-gate types — the four-phase pipeline config + per-agent state.
 *
 * Faithful re-expression of reverse-bi `DataAgentPipeline` (`pipeline.py`,
 * `phases.py`, `factory.py`) phase-gated orchestration on harness event seams
 * (NOT a custom agent-loop, NOT collapsing phases — map ③③). Exact values
 * (max_attempts / timeout / fallback) cite `factory.py` `default_phase_configs`;
 * budgets cite `phases.py` `PipelineConfig`. See
 * `wayfinder/data-agent/research/p7-four-phase-fit-to-da.md` §1.
 *
 * P7b production hardening (mirror P8b/P4b): TS, additive, no core edits.
 * @module @deepseek-ai/dsh-phase-gate/types
 */

/** The four rbi phases, advanced strictly in order at `agent/turn-stopping`. */
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
export const DECOMPOSITION_MARKER = '【拆解】'
/**
 * Marker the model emits in INTERPRETATION when it cannot answer this turn;
 * the turn-stopping gate reads it and triggers honest_decline (not clarification).
 */
export const INCOMPLETE_MARKER = '【未完成】'

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

/** rbi `PhaseConfig` + `factory.py` `default_phase_configs` — exact values. */
export interface PhaseConfig {
  readonly gate: 'always_pass' | 'sql_syntax_gate'
  readonly max_attempts: number
  readonly timeout_seconds: number
  readonly fallback_phase: Phase | null
}

/**
 * Per-phase gate config keyed by phase (gate kind, max attempts, timeout, fallback)
 * — exact rbi `factory.py` `default_phase_configs` values.
 */
export const PHASE_CONFIGS: Readonly<Record<Phase, PhaseConfig>> = {
  [Phase.UNDERSTANDING]: { gate: 'always_pass', max_attempts: 5, timeout_seconds: 60, fallback_phase: null },
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
  'lookup_terminology',
  'get_user_preferences',
  'load_accumulated_definition',
] as const)
/** Tool whitelist for the UNDERSTANDING phase (candidate discovery, definition loading, clarification). */
export const UNDERSTANDING_TOOLS = Object.freeze([
  'search_data_sources',
  'load_table_definition',
  'load_event_definition',
  'load_table_dimensions',
  'present_clarification',
  'save_accumulated_definition',
  ...UNIVERSAL_TOOLS,
] as const)
/** Tool whitelist for the GENERATION phase (SQL critique/quality + schema grounding). */
export const GENERATION_TOOLS = Object.freeze([
  'critique_sql_tool',
  'evaluate_sql_quality',
  // MAJOR-1 (review fix): load_* are schema-grounding reads. GENERATION writes
  // SQL from semantic-layer-grounded fields + the critic harvests
  // partition_cols / event_params from these calls, so the definitions are
  // whitelisted here too — not UNDERSTANDING-only (the prior omission made the
  // tool/README/package descriptions' "UNDERSTANDING/GENERATION" claim an
  // overclaim). Additive: no phase-gate logic touched, only whitelist entries.
  'load_table_definition',
  'load_event_definition',
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
 * Per-agent phase-gate state. Keyed per session inside the plugin (research
 * `harness-agent-loop.md` §5.3: "keyed per session inside the plugins
 * themselves"). One state object spans a whole user question (= one harness
 * kick); question-scoped counters reset on question-start (F4: `agent/status`
 * idle→running), NOT on `turn/start` (a kick spans multiple turns).
 */
export interface PhaseGateState {
  scope_id: string
  current_phase: Phase | 'COMPLETE' | 'DECLINED'
  phase_idx: number
  phase_attempts: number
  fallback_count: number
  /** LLM calls this user-question (≤ max_llm_calls_per_turn); charged on `llm/stream` (F5). */
  llm_call_count: number
  /** query_data executions this user-question (≤ max_executions_per_turn). */
  exec_count: number
  /** Turns this user-question (≤ max_state_turns; D6 budget, charged at turn-stopping). */
  turn_count: number
  delivery_started: boolean
  /** Current phase's final assistant text (sql_syntax_gate reads this). */
  phase_output: string
  awaiting_clarification: boolean
  subquestions: string[]
  /** SQL same-source across GENERATION gate / EXECUTION (F2). */
  last_sql: string | null
  /** ctx.query 3-state outcome: done | running | failed. */
  last_query_outcome: 'done' | 'running' | 'failed' | null
  last_critique: number | null
  last_quality: number | null
  honest_decline_reason: string | null
  cancelled: boolean
  cancelled_reason: string | null
  // ── critic guard data (captured from tools/post-execute; self-contained, no P6 dep) ──
  /** Table names surfaced by UNDERSTANDING `search_data_sources` (incl. forced_load). */
  candidate_tables: Set<string>
  /** event_params leaf names from `load_event_definition` (JSON-path field check). */
  event_params: Set<string>
  /** Partition columns from `load_table_definition` (ds/dt partition-filter check). */
  partition_cols: Set<string>
  // ── F4 question-start detection: prior `agent/status` for idle→running ──
  prior_status: 'idle' | 'running' | null
  // ── F3 stall watchdog (independent timer; cleared when events arrive) ──
  stall_timer: ReturnType<typeof setTimeout> | null
  /** `agent/pre-step` count for F6 step budget (mirrors rbi max_steps). */
  step_count: number
}

/**
 * Construct a fresh per-agent phase-gate state object rooted in the UNDERSTANDING phase.
 * @param scopeId The analytics scope identifier (e.g. game id) this state is keyed to.
 * @returns A new `PhaseGateState` with all counters zeroed and `current_phase=UNDERSTANDING`.
 */
export function freshPhaseGateState(scopeId = 'game-1'): PhaseGateState {
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
    last_critique: null,
    last_quality: null,
    honest_decline_reason: null,
    cancelled: false,
    cancelled_reason: null,
    candidate_tables: new Set(),
    event_params: new Set(),
    partition_cols: new Set(),
    prior_status: null,
    stall_timer: null,
    step_count: 0,
  }
}
