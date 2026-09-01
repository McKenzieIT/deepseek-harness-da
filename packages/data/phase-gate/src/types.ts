/**
 * Phase-gate types — the four-phase pipeline config + per-agent state.
 *
 * Pure type/interface declarations only (repo rule: `src/types.ts` contains
 * only types — no runtime code). Runtime constants, classes, regex, and
 * marker strings live in `./domain.ts`; the `Phase` type is derived from the
 * `Phase` const there and imported here as a type-only binding (erased at
 * runtime, so there is no runtime cycle between the two modules).
 *
 * @module @deepseek-ai/dsh-phase-gate/types
 */

import type { Phase } from './domain.ts'

/** rbi `PhaseConfig` + `factory.py` `default_phase_configs` — exact values. */
export interface PhaseConfig {
  readonly gate: 'always_pass' | 'sql_syntax_gate' | 'route_gate'
  readonly max_attempts: number
  readonly timeout_seconds: number
  readonly fallback_phase: Phase | null
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
  /** ctx.query 3-state outcome: completed | pending | failed (canonical QueryOutcome vocabulary). */
  last_query_outcome: 'completed' | 'pending' | 'failed' | null
  /**
   * #1/#2b self-evolution: fine-grained query failure kind
   * (`not_found` | `permission` | `syntax` | `timeout` | `transport` | `remote`
   * | …) harvested from query_data's `failureKind` (classifyMaxcError surfaces
   * it on the failed path). Drives the EXECUTION not_found self-evolution branch
   * (ask user project → update_table_config → retry). `null` when no failure or
   * not surfaced; cleared on a new question by `resetQuestionScoped`.
   */
  last_failure_kind: string | null
  /**
   * #1/#2b self-evolution: verbatim query error text (engine error message)
   * harvested from query_data's `error`. Surfaced to the model in the
   * not_found fallback inject so it can act on the specific engine error code. `null`
   * when no failure or not surfaced; cleared on a new question.
   */
  last_query_error: string | null
  /**
   * M4 self-evolution auto-persist: the bare table name that triggered a
   * not_found fallback. Set in executionDecision not_found branch; consumed
   * (and cleared) when the retry succeeds — phase-gate auto-calls
   * update_table_config(table, project) extracted from the successful SQL.
   */
  self_evolution_table: string | null
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
  // ── G-DA6: prior-turn tables snapshot (inherited on follow-up reset) ──
  /** Tables from the prior completed turn; seeded into candidate_tables on resetQuestionScoped. */
  prior_turn_tables: Set<string>
  // ── P-DA1 route-gate grounding backstop (aggregate search+retrieve; avoids the
  // candidate_tables projection mismatch — search candidates are objects, not
  // strings, so collectTableNames only harvests them via the .id leaf). True =
  // the tool was not called OR returned an empty candidates array. Until the
  // retrieve-tool is activated the backstop relies on search alone (this stays
  // true → search carries the grounding signal). ──
  last_search_empty: boolean
  last_retrieve_empty: boolean
  // ── GROUNDING GATE (c root-cause): true once a definition was loaded
  // (load_event_definition OR load_table_definition returned a non-error
  // result). The GENERATION gate requires this before allowing SQL generation
  // — else it fails → retry/fallback to UNDERSTANDING so the model loads the
  // event_view FROM / table columns first, not event-name-as-table guesses. ──
  definition_loaded: boolean
  // ── F4 question-start detection: prior `agent/status` for idle→running ──
  prior_status: 'idle' | 'running' | null
  // ── F3 stall watchdog (independent timer; cleared when events arrive) ──
  stall_timer: ReturnType<typeof setTimeout> | null
  /** `agent/pre-step` count for F6 step budget (mirrors rbi max_steps). */
  step_count: number
  /**
   * UX-leakage fix: set to true by captureToolData when query_data returns
   * state:'completed' in EXECUTION. The next onPreStep fires advance() immediately
   * and returns 'reject' — preventing the model from emitting a user-visible
   * response before INTERPRETATION takes over delivery.
   */
  execution_auto_advance: boolean
}
