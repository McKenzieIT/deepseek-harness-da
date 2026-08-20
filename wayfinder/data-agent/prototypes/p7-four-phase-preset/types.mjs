// P7 four-phase preset + phase-gate — PROTOTYPE types
// Mirrors reverse-bi libs/rbi-agent/src/rbi_agent/data_agent/phases.py
// (Phase enum + PhaseConfig + PipelineConfig + GateResult + tool whitelists)
// + per-agent phase-gate state (the plugin's mutable state). All values cited from
// phases.py / factory.py default_phase_configs (see research/p7-four-phase-fit-to-da.md §1).

export const Phase = Object.freeze({
  UNDERSTANDING: 'understanding',
  GENERATION: 'generation',
  EXECUTION: 'execution',
  INTERPRETATION: 'interpretation',
});
export const PHASE_ORDER = [
  Phase.UNDERSTANDING,
  Phase.GENERATION,
  Phase.EXECUTION,
  Phase.INTERPRETATION,
];

// Markers (phases.py: _DECOMPOSITION_MARKER / _INCOMPLETE_MARKER) — single source for
// BOTH the prompt-side (phase instructions) and the parse-side (gate regex). Splitting
// them would let a prompt-wording change silently break the gate parse (phases.py comment).
export const DECOMPOSITION_MARKER = '【拆解】';
export const INCOMPLETE_MARKER = '【未完成】';

export class GateResult {
  constructor(passed, reason = null) {
    this.passed = passed;
    this.reason = reason;
  }
  static pass() {
    return new GateResult(true);
  }
  static fail(reason) {
    return new GateResult(false, reason);
  }
}

// rbi PipelineConfig (phases.py) — ADOPTED AS INITIAL DEFAULTS (P7 decision: budgets).
// Recalibrate via R8 evals once da has real LLM-call distribution (60 = 3 × DEFAULT_MAX_STEPS(20),
// test-pinned in rbi). da has no native step/turn budget (harness-agent-loop.md §3.2#4), so the
// phase-gate plugin enforces these via counters + agent.cancel at turn-stopping.
export const PipelineConfig = Object.freeze({
  max_fallbacks: 2,
  max_subquestions: 4,
  max_executions_per_turn: 8, // aligns qodercli MAX_SQL_PER_TURN, includes failures (cost guard)
  max_llm_calls_per_turn: 60, // = 3 × DEFAULT_MAX_STEPS(20); ≈19% of theoretical 320 ceiling
  critique_confidence_floor: 0.6,
  quality_score_floor: 60,
  disambiguation_timeout_seconds: 300.0,
  forced_table_load_timeout_seconds: 30.0,
  max_state_turns: 20,
  default_call_timeout_seconds: 60.0,
});

// rbi PhaseConfig (phases.py + factory.py default_phase_configs) — exact values.
export const PHASE_CONFIGS = {
  [Phase.UNDERSTANDING]: { gate: 'always_pass', max_attempts: 5, timeout_seconds: 60, fallback_phase: null },
  [Phase.GENERATION]: { gate: 'sql_syntax_gate', max_attempts: 5, timeout_seconds: 60, fallback_phase: Phase.UNDERSTANDING },
  [Phase.EXECUTION]: { gate: 'always_pass', max_attempts: 1, timeout_seconds: 120, fallback_phase: Phase.GENERATION },
  [Phase.INTERPRETATION]: { gate: 'always_pass', max_attempts: 5, timeout_seconds: 60, fallback_phase: null },
};

// Tool whitelists (phases.py) — rbi tool names. P7 STUBS these as canned results; the ready
// da seams (ctx.query/ctx.schema/ctx.embedder/ctx.retrieval/ctx.audit/subagent-qoder) inform
// stub realism but are NOT coupled (validated by their own prototypes p4/p5/p6/p8/p3).
export const UNIVERSAL_TOOLS = Object.freeze([
  'lookup_terminology',
  'get_user_preferences',
  'load_accumulated_definition',
]);
export const UNDERSTANDING_TOOLS = Object.freeze([
  'search_data_sources',
  'load_table_definition',
  'load_event_definition',
  'load_table_dimensions',
  'present_clarification',
  'save_accumulated_definition',
  ...UNIVERSAL_TOOLS,
]);
export const GENERATION_TOOLS = Object.freeze([
  'critique_sql_tool',
  'evaluate_sql_quality',
  ...UNIVERSAL_TOOLS,
]);
export const EXECUTION_TOOLS = Object.freeze(['query_data', ...UNIVERSAL_TOOLS]);
export const INTERPRETATION_TOOLS = Object.freeze([
  'present_decomposition',
  'present_table',
  'compute',
  'record_template_usage',
  'suggest_followups',
  ...UNIVERSAL_TOOLS,
]);

export const PHASE_TOOLS = {
  [Phase.UNDERSTANDING]: UNDERSTANDING_TOOLS,
  [Phase.GENERATION]: GENERATION_TOOLS,
  [Phase.EXECUTION]: EXECUTION_TOOLS,
  [Phase.INTERPRETATION]: INTERPRETATION_TOOLS,
};

// Per-agent phase-gate state (the plugin's mutable state). harness presets use a standing
// mount per-preset with scope parentage; per-session state is keyed inside the plugin itself
// (harness-agent-loop.md §5.3 INFERENCE: "keyed per session inside the plugins themselves").
export function freshPhaseGateState(scopeId = 'game-1') {
  return {
    scope_id: scopeId,
    current_phase: Phase.UNDERSTANDING,
    phase_idx: 0,
    phase_attempts: 0, // attempts in the CURRENT phase (reset on phase change)
    fallback_count: 0, // total fallbacks this user-question (≤ max_fallbacks)
    llm_call_count: 0, // charged on llm/stream (P7 finding: NOT agent/request)
    exec_count: 0, // query_data executions this user-question (≤ max_executions_per_turn)
    delivery_started: false, // INTERPRETATION present_* tracking
    phase_output: '', // current phase's final text (sql_syntax_gate reads this)
    awaiting_clarification: false, // UNDERSTANDING present_clarification HALT
    subquestions: [], // decomposition (≤ max_subquestions)
    last_sql: null, // SQL same-source across GENERATION gate / EXECUTION (P7 finding)
    last_query_outcome: null, // ctx.query 3-state: done | running | failed
    honest_decline_reason: null,
    cancelled: false,
    cancelled_reason: null,
  };
}
