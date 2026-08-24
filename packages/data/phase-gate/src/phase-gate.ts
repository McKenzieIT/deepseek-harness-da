/**
 * Phase-gate orchestration plugin — the four-phase pipeline re-expressed on
 * harness event seams (NOT a custom agent-loop, NOT collapsing phases —
 * map ③③). 7 hooks (research `harness-agent-loop.md` §4.2B + §4.3):
 *   1. ctx.tools.guard(execution)            — hard per-phase whitelist (D5) + exec-budget
 *   2. agent/turn-stopping (serial, void)     — phase advance / gate / fallback / decline
 *   3. tools/post-execute (waterfall)        — count + capture critic data + F2 same-source block
 *   4. agent/request (waterfall)             — per-phase reasoning effort (D7)
 *   5. system-prompt/assemble (waterfall)    — base persona (shadow) + dynamic phase instructions (C)
 *   6. llm/stream (stream-wrap waterfall)    — F5 billing (stream start, NOT agent/request)
 *   7. agent/pre-step (waterfall)            — F6 step count + stall-watchdog reset
 *   +  agent/status (emit)                   — F4 question-start (idle→running reset)
 *
 * CONTROL-FLOW REFINEMENT (surfaced reading `agent.ts`): `agent/turn-stopping`
 * is `serial` with `Promise<void>|void` return — the agent-loop DISCARDS the
 * return. So the P7 stub's return-based control does NOT map; production
 * control is by SIDE EFFECT: mutate per-agent state (next step's guard/assemble
 * read the new phase) + `agent.inject(message)` to keep the kick alive (phase
 * continuation / within-turn retry). Budget → `honest_decline` (no inject →
 * kick ends; M4: decline not cancel — `agent.cancel` reserved for user-stop /
 * stall timeout).
 * @module @deepseek-ai/dsh-phase-gate/phase-gate
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentCancelCause, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { CallId, ReasoningEffortId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { PERSONA_ORDER, PERSONA_SECTION, type PromptAssembly, type AssembleContext, type AssembledSection } from '@deepseek-ai/dsh-system-prompt'
import type { ToolExecution, PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import {
  Phase,
  PHASE_ORDER,
  PHASE_CONFIGS,
  PHASE_TOOLS,
  PipelineConfig,
  GateResult,
  INCOMPLETE_MARKER,
  extractRoute,
  freshPhaseGateState,
  type PhaseGateState,
  type Phase as PhaseType,
} from './types.ts'
import { extractSqlCandidate, sqlSyntaxGate, type CriticCtx } from '@deepseek-ai/dsh-nl2sql-engine'

/** Configuration overrides for the `PhaseGate` plugin; unset fields fall back to the adopted `PipelineConfig` defaults. */
export interface PhaseGateConfig {
  /** Scope identifier the per-agent phase-gate state is rooted in; passed to `freshPhaseGateState`, defaults to `'game-1'` when unset. */
  scopeId?: string
  /** Maximum number of phase fallbacks (retreats to an earlier phase) permitted per turn before honest decline. */
  max_fallbacks?: number
  /** Maximum number of atomic sub-questions a compound question may decompose into during UNDERSTANDING. */
  max_subquestions?: number
  /** Maximum `query_data` executions permitted per turn; reaching it triggers a pre-execute guard reject and honest decline. */
  max_executions_per_turn?: number
  /** Maximum LLM calls charged per turn (counted at `llm/stream` start); reaching it triggers honest decline. */
  max_llm_calls_per_turn?: number
  /** Maximum turns a kick may run before honest decline (the per-kick turn budget). */
  max_state_turns?: number
  /** Seconds with no agent events before the stall watchdog fires an honest decline and cancels the kick. */
  stall_watchdog_seconds?: number
  /**
   * P-DA2: explicitly mark the critic tools (`critique_sql_tool` +
   * `evaluate_sql_quality`) as registered/shipped for this scope, re-tightening
   * the GENERATION gate's `last_critique`/`last_quality` floor checks. Defaults
   * `false` (transition relax — until the critic ships, the gate relies on the
   * folded `sqlSyntaxGate` + candidate/event_params/partition harvest alone, so
   * grounded queries can reach EXECUTION). The best-effort `ctx.tools.get`
   * probe is the fallback when this is unset; the flag is preferred (explicit
   * opt-in overrides the probe).
   */
  critic_tools_registered?: boolean
}

const REASONING_EFFORT: Readonly<Record<string, 'high' | 'medium'>> = {
  [Phase.UNDERSTANDING]: 'high',
  [Phase.GENERATION]: 'high',
  [Phase.EXECUTION]: 'medium',
  [Phase.INTERPRETATION]: 'medium',
}

const BASE_PERSONA = `You are a data agent for a per-game analytics platform. You answer natural-language data questions over a semantic layer (events/tables/terminology) by running a four-phase pipeline: UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION. Follow the per-phase instructions injected at runtime. If you cannot answer, emit a honest decline (the ${INCOMPLETE_MARKER} marker in INTERPRETATION); never fabricate tables, fields, or results.

Three rules you must always follow:
1. PHASE ORDER (strict): UNDERSTANDING calls search_data_sources + load_*definition + present_clarification + execute_metric (for pure metric queries). GENERATION writes SQL and does NOT call query_data. EXECUTION calls query_data. INTERPRETATION calls present_*. query_data is EXECUTION-only — never call it in UNDERSTANDING or GENERATION before the SQL is written and critiqued.
2. EVENT vs TABLE loader: events (ods_* tables or event names like game.role.online) → load_event_definition; DWS tables (dws_*) → load_table_definition. Pick the loader by the candidate's mode/type returned by search_data_sources; never call load_table_definition with an event name (it will not find it).
3. ROUTE: at the end of UNDERSTANDING (after search + load), emit exactly one token — 【route:proceed】 (search returned candidates + you loaded definitions + no ambiguity), 【route:clarify】 (real ambiguity — also call present_clarification with one specific question), or 【route:decline】 (no candidates / unanswerable). If search returned candidates and you loaded the definitions, you have grounding — emit 【route:proceed】; do not prematurely clarify or decline.`

const PHASE_INSTRUCTIONS: Readonly<Record<PhaseType, string>> = {
  [Phase.UNDERSTANDING]: `UNDERSTANDING: discover grounding, then decide the route. (1) Call search_data_sources with the user's question; it returns ranked candidates with id/score/mode/type. (2) Load the full definitions for the relevant candidates: events (ods_* / event names) via load_event_definition, DWS tables (dws_*) via load_table_definition — pick the loader by the candidate's mode/type, never call load_table_definition with an event name. Use load_table_dimensions when you need a dimension hint. METRIC SHORTCUT: when search_data_sources results contain a metric-type data source (description indicates an aggregate metric like DAU/MAU/pay_amt) AND the question is a simple metric query (e.g. "昨天DAU是多少", "本月充值总额"), call execute_metric(metric_name, question) immediately — it executes the metric deterministically (Level 2.5, 0 LLM overhead) and returns the result; skip GENERATION/EXECUTION and go straight to INTERPRETATION. Only use this shortcut for PURE metric queries; if the question involves extra filters/grouping/multi-table joins, proceed normally and let the metric rule serve as context in GENERATION. The load result IS your GENERATION grounding: load_event_definition returns event_view.full_name (the FROM table) + params_extract_template; load_table_definition returns columns/partitions — use these in SQL, never hardcode table or field names. (3) Decompose compound questions into atomic sub-questions (≤${PipelineConfig.max_subquestions}) prefixed by 【拆解】; run the six-class disambiguation scan. (4) Decide the route and emit exactly one token at the end of this turn:
- 【route:proceed】 — search returned candidates AND you loaded the relevant definitions (grounding established) AND no real ambiguity remains → advance to GENERATION (which writes the SQL; do NOT call query_data here).
- 【route:clarify】 — a real ambiguity remains (multiple competing candidates, unclear metric caliber). Also call present_clarification with ONE specific clarifying question, then HALT (await user; ${PipelineConfig.disambiguation_timeout_seconds}s → honest_decline). The gate HALTs on this token.
- 【route:decline】 — no candidates returned or the question is unanswerable with the available data. Emit an honest decline: state WHY (what is missing), WHAT would be needed, HOW the user could rephrase. The gate honest-declines.
If you emit no route token, the gate defaults to proceed but runs a grounding backstop (if search+retrieve found nothing, it declines honestly rather than run GENERATION on no corpus). Do not prematurely clarify or decline: if search returned candidates and you loaded definitions, you have grounding — emit 【route:proceed】.`,
  [Phase.GENERATION]: 'GENERATION: generate SQL from semantic-layer-grounded fields (never hardcode schema). '
    + 'GROUNDING GATE: a definition MUST be loaded first (load_event_definition for events '
    + '→ event_view.full_name is the FROM table + params_extract_template; '
    + 'load_table_definition for DWS tables → columns/partitions) — the turn-stopping '
    + 'gate blocks SQL generation until one is loaded; use the FROM/fields from the load '
    + 'result, never hardcode table or field names. Call critique_sql_tool + '
    + 'evaluate_sql_quality on your SQL before query_data — the turn-stopping gate '
    + 'requires both (confidence ≥ 0.6, score ≥ 60) to advance to EXECUTION. The '
    + 'critic (regex + JSON path, no sqlglot) rejects tables ∉ candidates, '
    + 'GET_JSON_OBJECT fields ∉ event_params; warns on SELECT * / missing ds partition. '
    + 'Wrap SQL in ```sql fences. TABLE_NOT_FOUND / FIELD_NOT_FOUND / '
    + 'SEMANTIC_MISMATCH are UNRECOVERABLE execution errors (per rbi §3 阶段D) — '
    + 'they signal the SQL referenced a table/field absent from ODPS. Do NOT '
    + 're-critique or re-execute with a corrected SQL: critique_sql_tool is '
    + 'GENERATION-only (the EXECUTION guard whitelist blocks it) and F2 same-source '
    + 'blocks a divergent query_data SQL, so re-critiquing in EXECUTION deadlocks. '
    + 'Instead emit 【route:decline】 (honest reject): state WHY (which table/field '
    + 'was not found), WHAT the correct schema needs, HOW the user could rephrase. '
    + 'The gate honest-declines; do not game the critic with an event-name-as-table.',
  [Phase.EXECUTION]: 'EXECUTION (deterministic, not ReAct): query_data(sql) runs the Guard Chain. The SQL passed MUST equal the critiqued SQL (same-source — post-execute blocks a mismatch). Three outcomes drive the turn-stopping decision: completed → advance; pending → wait + poll; failed → fallback→GENERATION (carry error) or honest_decline. Never re-send the original SQL.',
  [Phase.INTERPRETATION]: `INTERPRETATION: deliver via tools only, strict order: present_decomposition (forced first) → present_table (pass result_id + intent) → compute → 【发现】(once) → 【注意】(once, list assumptions) → suggest_followups. Output purity: no **, no process narration, no SQL display, thousands separator. If you CANNOT answer, emit ${INCOMPLETE_MARKER} (NOT clarification — no HALT in delivery); the turn-stopping gate reads it → honest_decline. No fallback phase.`,
}

const SQL_CONVENTIONS = 'SQL conventions (MaxCompute/hive dialect): partition predicate ds=\'yyyyMMdd\' required for partitioned tables; SELECT-only; prefer explicit columns over SELECT *; GET_JSON_OBJECT field paths must reference event_params loaded in UNDERSTANDING. Event queries: FROM ieu_ods.ods_10000251_all_view WHERE event=\'<event_name>\' AND ds>=\'<start>\' AND ds<=\'<end>\'; extract event params via GET_JSON_OBJECT(params, \'$.<field_name>\').'

/** The phase-gate plugin. Per-agent state keyed by agent id. Mounted agent-plane (isolate realm). */
export class PhaseGate {
  private readonly sessions = new Map<string, PhaseGateState>()
  private readonly cfg: Required<PhaseGateConfig>
  private readonly ctx: Context

  constructor(ctx: Context, config: PhaseGateConfig = {}) {
    this.ctx = ctx
    this.cfg = {
      scopeId: config.scopeId ?? 'game-1',
      max_fallbacks: config.max_fallbacks ?? PipelineConfig.max_fallbacks,
      max_subquestions: config.max_subquestions ?? PipelineConfig.max_subquestions,
      max_executions_per_turn: config.max_executions_per_turn ?? PipelineConfig.max_executions_per_turn,
      max_llm_calls_per_turn: config.max_llm_calls_per_turn ?? PipelineConfig.max_llm_calls_per_turn,
      max_state_turns: config.max_state_turns ?? PipelineConfig.max_state_turns,
      stall_watchdog_seconds: config.stall_watchdog_seconds ?? PipelineConfig.stall_watchdog_seconds,
      critic_tools_registered: config.critic_tools_registered ?? false,
    }
  }

  /**
   * Get (lazily creating) the per-agent phase-gate state for the given agent id.
   * @param agentId The harness agent id (stringified) to look up or initialize state for.
   * @returns The `PhaseGateState` for this agent, creating a fresh one rooted in the configured scope on first access.
   */
  state(agentId: string): PhaseGateState {
    let s = this.sessions.get(agentId)
    if (s === undefined) {
      s = freshPhaseGateState(this.cfg.scopeId)
      this.sessions.set(agentId, s)
    }
    return s
  }

  /**
   * Peek the per-agent state WITHOUT creating one (the `criticCtx` service
   * (b) uses this so a critique_sql_tool call on an unknown agent degrades to
   * empty sets rather than polluting `sessions` with a throwaway entry).
   * @param agentId The harness agent id (stringified) to look up.
   * @returns The existing `PhaseGateState`, or `undefined` when none exists.
   */
  peekState(agentId: string): PhaseGateState | undefined {
    return this.sessions.get(agentId)
  }

  // ── hook 1: ctx.tools.guard — hard whitelist + exec-budget pre-reject (D5, M1) ──
  /**
   * `ctx.tools.guard` hook: hard per-phase tool whitelist plus exec-budget
   * pre-reject (D5, M1); returns a rejection reason string or `undefined` to allow.
   */
  guard = (execution: ToolExecution): string | undefined => {
    const agent = execution.agent
    if (agent === undefined) return undefined // no agent (host probe) — allow
    const s = this.state(String(agent.id))
    if (s.honest_decline_reason !== null || s.cancelled) return 'turn ended'
    const phase = s.current_phase as PhaseType
    const allowed = PHASE_TOOLS[phase]
    if (!allowed.includes(execution.name)) {
      return `phase-gate: "${execution.name}" not in ${phase} whitelist [${allowed.join('|')}]`
    }
    if (execution.name === 'query_data' && s.exec_count >= this.cfg.max_executions_per_turn) {
      this.honestDecline(s, `budget: exec_count ${s.exec_count} ≥ ${this.cfg.max_executions_per_turn} (pre-execute reject)`)
      return 'budget: exec_count ≥ max_executions_per_turn (pre-execute)'
    }
    return undefined
  }

  // ── B1: capture the phase's final assistant text from the session event log ──
  // agent.session.events is the durable source of truth (Session getter; the
  // response body lives in the session event stream, not the agent event
  // layer). Reading the latest `assistant/message` at turn-stopping avoids a
  // re-entrant stream wrap (the onLlmStream text-delta alternative). An
  // empty-content assistant/message (a max-tokens step hosting only usage)
  // contributes no text blocks. Only `text` blocks are captured — `tool_use`
  // and `reasoning` blocks are not the phase deliverable.
  private capturePhaseOutput(agent: Agent, s: PhaseGateState): void {
    const events = agent.session.events
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e !== undefined && e.type === 'assistant/message') {
        let text = ''
        for (const b of e.data.message.content) {
          if (b.type === 'text') text += b.text
        }
        s.phase_output = text
        return
      }
    }
  }

  // ── hook 2: agent/turn-stopping (serial, void) — advance / gate / fallback / decline ──
  /**
   * `agent/turn-stopping` serial hook (void): advance / gate / fallback /
   * honest_decline by side effect, plus stall-watchdog reset and phase-output capture.
   */
  onTurnStopping = async ({ agent, signal }: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> => {
    const s = this.state(String(agent.id))
    this.touchStallTimer(agent, s) // F3: an event arrived — reset the watchdog
    this.capturePhaseOutput(agent, s) // B1: phase-final assistant text → s.phase_output
    if (s.honest_decline_reason !== null || s.cancelled) return
    if (s.turn_count >= this.cfg.max_state_turns) { // F6/D6 budget
      this.honestDecline(s, `budget: turn_count ${s.turn_count} ≥ ${this.cfg.max_state_turns} max_state_turns (D6)`)
      return
    }
    if (s.llm_call_count >= this.cfg.max_llm_calls_per_turn) { // B3: llm budget (charged on llm/stream)
      this.honestDecline(s, `budget: llm_call_count ${s.llm_call_count} ≥ ${this.cfg.max_llm_calls_per_turn} max_llm_calls_per_turn`)
      return
    }
    s.turn_count += 1
    if (s.current_phase === Phase.EXECUTION) { // deterministic 3-state (D5, H1)
      this.executionDecision(agent, s)
      return
    }
    const cfg = PHASE_CONFIGS[s.current_phase as PhaseType]
    const gate = this.runGate(s)
    if (gate.passed) {
      // F1: forced_load — UNDERSTANDING ending without candidates → programmatic
      // retrieval through guard (ctx.tools.execute) so GENERATION has grounding.
      if (s.current_phase === Phase.UNDERSTANDING && s.candidate_tables.size === 0) {
        await this.forcedLoad(agent, signal, s.phase_output)
        // B6: forcedLoad runs ctx.tools.execute through guard — re-check decline/cancel before advancing.
        if (s.honest_decline_reason !== null || s.cancelled) return
      }
      // P-DA1 backstop: route proceed/no-token but no grounding (search+retrieve
      // both empty) → honest_decline — don't bare-run GENERATION on no corpus.
      // Runs AFTER forcedLoad so the programmatic rescue gets a chance to surface
      // candidates first (forcedLoad's post-execute capture updates last_search_empty).
      if (s.current_phase === Phase.UNDERSTANDING && s.last_search_empty && s.last_retrieve_empty) {
        this.honestDecline(s, 'route:proceed but no grounding (search+retrieve empty) → honest_decline')
        return
      }
      this.advance(agent, s)
      return
    }
    // P-DA1: UNDERSTANDING route_gate clarify/decline are terminal control-flow,
    // NOT retries. clarify → HALT (await user clarification); decline →
    // honest_decline (model self-declared no grounding / unanswerable). Handle
    // before the retry/fallback path so neither burns a phase_attempt.
    if (s.current_phase === Phase.UNDERSTANDING) {
      if (gate.reason === 'route:clarify') {
        s.awaiting_clarification = true
        return // HALT — no advance, no inject, no retry (await user)
      }
      if (gate.reason === 'route:decline') {
        this.honestDecline(s, 'route:decline — model self-declared no grounding / unanswerable')
        return
      }
    }
    if (s.current_phase === Phase.INTERPRETATION) { // M3: INCOMPLETE declaration is terminal
      this.honestDecline(s, `INTERPRETATION ${gate.reason}`)
      return
    }
    s.phase_attempts += 1
    if (s.phase_attempts >= cfg.max_attempts) {
      if (cfg.fallback_phase !== null && s.fallback_count < this.cfg.max_fallbacks) {
        this.fallback(agent, s, cfg.fallback_phase)
        return
      }
      this.honestDecline(
        s,
        `phase ${s.current_phase} gate failed (${gate.reason}); max_attempts=${cfg.max_attempts} exhausted`
          + (cfg.fallback_phase !== null ? ` + fallbacks exhausted (≥${this.cfg.max_fallbacks})` : ' (no fallback phase)'),
      )
      return
    }
    // Retry: clear phase output + inject a correction so the turn continues
    // (agent.inject = next-step, no wakeup; the driver is already running in
    // turn-stopping, so the injected message keeps the kick alive for a re-prompt).
    s.phase_output = ''
    s.last_critique = null
    s.last_quality = null
    this.inject(agent, `[phase ${s.current_phase} retry] gate failed: ${gate.reason}. Revise per the phase instructions and try again.`)
  }

  // EXECUTION 3-state decision (D5: ctx.query QueryOutcome drives; H1: failed+exhausted→decline).
  private executionDecision(agent: Agent, s: PhaseGateState): void {
    if (s.last_query_outcome === 'completed') {
      this.advance(agent, s)
      return
    }
    if (s.last_query_outcome === 'pending') {
      this.inject(agent, '[EXECUTION] query still running; poll check_query.')
      return
    }
    const cfg = PHASE_CONFIGS[Phase.EXECUTION]
    if (cfg.fallback_phase !== null && s.fallback_count < this.cfg.max_fallbacks) {
      this.fallback(agent, s, cfg.fallback_phase)
      return
    }
    this.honestDecline(s, `EXECUTION query failed (${s.last_query_outcome ?? 'not run'}); fallbacks exhausted`)
  }

  private runGate(s: PhaseGateState): GateResult {
    const cfg = PHASE_CONFIGS[s.current_phase as PhaseType]
    if (cfg.gate === 'always_pass') {
      if (s.current_phase === Phase.INTERPRETATION) return this.interpretGate(s.phase_output) // M3
      return GateResult.pass()
    }
    if (cfg.gate === 'sql_syntax_gate') return this.generationGate(s)
    if (cfg.gate === 'route_gate') return this.routeGate(s) // P-DA1: UNDERSTANDING 3-state route
    throw new Error(`unknown gate: ${cfg.gate} (phase ${s.current_phase})`)
  }

  /**
   * P-DA1: UNDERSTANDING route-gate. The model emits a `【route:proceed|
   * clarify|decline】` token after search+load (mirrors `INCOMPLETE_MARKER`/
   * `interpretGate` — single source = `ROUTE_MARKER_REGEX`/`extractRoute`).
   * Returns a `GateResult` whose pass/fail + reason drives `onTurnStopping`:
   * - proceed / no token → `pass()` — the pass-path runs the grounding backstop
   *   (search+retrieve empty → honest_decline) then advances to GENERATION.
   * - clarify → `fail('route:clarify')` — the fail-path sets
   *   `awaiting_clarification` and HALTs (await user; NOT a retry).
   * - decline → `fail('route:decline')` — the fail-path honest-declines (model
   *   self-declared no grounding / unanswerable; NOT a retry).
   */
  private routeGate(s: PhaseGateState): GateResult {
    const route = extractRoute(s.phase_output)
    if (route === 'decline') return GateResult.fail('route:decline')
    if (route === 'clarify') return GateResult.fail('route:clarify')
    return GateResult.pass() // proceed or no token (backstop guards the no-grounding case)
  }

  // ── hook 3: tools/post-execute — count + capture critic data + F2 same-source block ──
  /**
   * `tools/post-execute` waterfall hook: count executions, capture critic guard
   * data, and block F2 same-source SQL mismatches before delegating downstream.
   */
  onPostExecute = async (
    exec: ToolExecution,
    result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision>,
  ): Promise<PostToolDecision> => {
    const agent = exec.agent
    if (agent !== undefined) {
      const s = this.state(String(agent.id))
      this.captureToolData(s, exec.name, result)
      if (exec.name === 'query_data' && s.last_sql !== null) { // F2: same-source
        const args = exec.arguments as { sql?: string } | undefined
        // B5: normalize whitespace both sides (last_sql is already normalized by extractSqlCandidate).
        if (args?.sql !== undefined && normalizeSql(args.sql) !== s.last_sql) {
          // B8: a same-source violation is a failed execution — record it so executionDecision
          // treats it as failed (fallback/decline), not the stale 'not run' outcome.
          s.last_query_outcome = 'failed'
          return { kind: 'block', feedback: [{ type: 'text', text: 'F2 same-source violation: query_data sql ≠ critiqued last_sql' }] }
        }
      }
    }
    return next()
  }

  /** Capture critic guard data + counters (self-contained, no P6 dep). */
  private captureToolData(s: PhaseGateState, name: string, result: Readonly<ToolExecutionResult>): void {
    if (result.isError) return
    const value = (result as { value?: unknown }).value
    if (name === 'query_data') {
      s.exec_count += 1
      const state = (value as { state?: string } | null | undefined)?.state
      s.last_query_outcome = state === 'completed' || state === 'pending' || state === 'failed' ? state : 'failed'
    } else if (name === 'critique_sql_tool') {
      s.last_critique = (value as { confidence?: number } | null | undefined)?.confidence ?? null
      // (b) F2 same-source: the critiqued SQL (returned by critique_sql_tool
      // as `sql`) updates last_sql so the model can re-critique a corrected
      // SQL after a TABLE_NOT_FOUND and query_data passes the F2 same-source
      // check (query_data sql == last_sql). Without this, last_sql is only set
      // by generationGate's extractSqlCandidate on phase_output — which does
      // not update on a within-turn re-critique after an execution error.
      const critiquedSql = (value as { sql?: string | null } | null | undefined)?.sql
      if (typeof critiquedSql === 'string') s.last_sql = critiquedSql
    } else if (name === 'evaluate_sql_quality') {
      s.last_quality = (value as { score?: number } | null | undefined)?.score ?? null
    } else if (name === 'present_decomposition' || name === 'present_table') {
      s.delivery_started = true
    } else if (name === 'present_clarification') {
      // B4: a clarification HALTs the turn awaiting user input — flag it so the stall
      // watchdog excludes this agent (rbi `_watch_for_stall` excludes awaiting_input).
      s.awaiting_clarification = true
    } else if (name === 'search_data_sources') {
      collectTableNames(value, s.candidate_tables)
      // P-DA1: aggregate grounding signal for the route-gate backstop. Probing
      // candidates.length (not candidate_tables.size) sidesteps the projection
      // mismatch — search candidates are objects ({id,score,...}), and even with
      // the collectTableNames .id fix the backstop's source of truth is the
      // aggregate empty flag (the spec: avoid candidate_tables projection bug).
      s.last_search_empty = isCandidatesEmpty(value)
    } else if (name === 'retrieve') {
      // P-DA1 forward-compat: the retrieve escape-hatch (tool-retrieve, D2c-impl
      // shipped DORMANT) returns the same {candidates:[...]} shape as search.
      // Until it is activated last_retrieve_empty stays true (default) and the
      // backstop relies on search alone — additive, no behavior change dormant.
      s.last_retrieve_empty = isCandidatesEmpty(value)
    } else if (name === 'load_event_definition') {
      // GROUNDING GATE (c root-cause): a non-error load_event_definition result
      // means the model loaded an event definition → it has the event_view FROM
      // + params grounding. captureToolData runs only on non-error results (the
      // isError early-return above), so an errored load does not set the flag.
      // The GENERATION gate requires this flag before allowing SQL generation
      // (deterministic grounding — not a persona instruction).
      s.definition_loaded = true
      // load_* returns { found, event|table: { … } } NESTED (the model-facing
      // projection) — probe the nested definition, not top-level value (else
      // partition_cols / event_params stay empty after a successful load).
      collectFields((value as { event?: unknown } | undefined)?.event, s.event_params, 'params_fields', 'params')
      // G-DA4 critic candidate_tables: load_event_definition also returns
      // event_view.full_name — the FROM table (e.g. ieu_ods.ods_10000251_all_view)
      // the model writes `FROM <full_name> WHERE event='...'` over. The critic's
      // extractTableNames strips the db. prefix + lowercases, so the candidate
      // set must carry the db-stripped form for `table_not_in_candidates` to pass
      // (else the correct SQL fails the critic → generationGate blocks → the
      // model games the critic with an event-name-as-table → TABLE_NOT_FOUND →
      // F2 deadlock). search_data_sources surfaces event NAMES (game.recharge),
      // NOT the event_view table — that gap is closed here. Add both the full
      // + db-stripped lowercased forms (the stripped form is what the critic
      // checks today; the full form is robustness against a prefix-preserving
      // critic). Mirrors collectTableNames' lowercase + extractTableNames' strip.
      const evView = (value as { event_view?: { full_name?: unknown } } | undefined)?.event_view
      const evFullName = evView?.full_name
      if (typeof evFullName === 'string' && evFullName !== '') {
        const lower = evFullName.toLowerCase()
        s.candidate_tables.add(lower)
        s.candidate_tables.add(lower.replace(/^.*\./, ''))
      }
    } else if (name === 'load_table_definition') {
      // GROUNDING GATE (c): same — a non-error table load establishes grounding.
      s.definition_loaded = true
      // (same nested-projection shape — see load_event above)
      collectFields((value as { table?: unknown } | undefined)?.table, s.partition_cols, 'partition_cols', 'partitions')
    }
  }

  // ── hook 4: agent/request (waterfall) — per-phase reasoning effort (D7) ──
  /**
   * `agent/request` waterfall hook: override reasoning effort per the current
   * phase (D7) after delegating to downstream — but ONLY for models that expose
   * selectable reasoning efforts. A model without a per-request thinking knob
   * (e.g., `aga` — native AGA, thinking is model-bound, no effort levels)
   * exposes none; setting `reasoningEffort` for it is rejected by the registry
   * (`UNSUPPORTED_REASONING_EFFORT`), so the phase-gate skips the per-phase
   * effort for such models and lets thinking be controlled by model selection
   * (P2's design). The phase-gate's other per-phase controls (budgets/gates/
   * persona/whitelists) are unaffected.
   */
  onRequest = async (
    { agent, signal }: { agent: Agent; turn: number; step: number; signal: AbortSignal },
    next: () => Promise<GenerateOptions>,
  ): Promise<GenerateOptions> => {
    const s = this.state(String(agent.id))
    const base = await next()
    if (base.provider === undefined || base.model === undefined) return base
    if (!(await this.modelExposesReasoningEffort(base.provider, base.model, signal))) return base
    const effort = REASONING_EFFORT[s.current_phase] ?? 'medium'
    return { ...base, reasoningEffort: ReasoningEffortId(effort) }
  }

  /**
   * provider:model → exposes selectable reasoning efforts? (invariant for
   * the loaded adapters; cached to keep the request hot path cheap.)
   */
  private readonly reasoningEffortSupport = new Map<string, boolean>()

  /**
   * Whether the proposed model exposes selectable reasoning efforts, per the
   * LLM registry's resolved model info. `reasoning === undefined` (e.g., `aga` —
   * native AGA, thinking is model-bound) means no per-request effort knob, so
   * the phase-gate must not set a `reasoningEffort` the registry would reject.
   * Cached: a model's reasoning support is invariant for the loaded adapters.
   */
  private async modelExposesReasoningEffort(provider: string, model: string, signal: AbortSignal): Promise<boolean> {
    const key = `${provider} ${model}`
    const cached = this.reasoningEffortSupport.get(key)
    if (cached !== undefined) return cached
    try {
      const info = await this.ctx.llm.resolveModelInfo(provider, model, signal)
      const supports = info.reasoning !== undefined
      this.reasoningEffortSupport.set(key, supports)
      return supports
    } catch {
      // Transient failure (signal abort, adapter miss, no llm service): don't
      // cache -- the next call re-tries. Safe-skip: the registry's prepareCall
      // re-runs resolveModelInfoFor + surfaces the real error if the model is
      // genuinely unserviceable, so skipping here never masks a hard failure.
      return false
    }
  }

  // ── hook 5: system-prompt/assemble — base persona (shadow) + dynamic phase instructions (C) ──
  /**
   * `system-prompt/assemble` waterfall hook: delegate downstream then
   * additively inject the base persona (shadow) and dynamic per-phase instructions (C).
   */
  onAssemble = async (
    _assembly: PromptAssembly,
    context: AssembleContext,
    next: () => Promise<PromptAssembly>,
  ): Promise<PromptAssembly> => {
    const merged = await next() // delegate to downstream, then inject additively
    const agentId = readAgentId(context)
    const s = agentId === null ? null : this.sessions.get(agentId) ?? null
    // B14: clamp terminal phases (DECLINED/COMPLETE) to UNDERSTANDING — PHASE_INSTRUCTIONS
    // has no DECLINED/COMPLETE entry, so an unclamped terminal would yield `undefined` text.
    const rawPhase = s === null ? null : s.current_phase
    const phase = (rawPhase === null || rawPhase === 'DECLINED' || rawPhase === 'COMPLETE'
      ? Phase.UNDERSTANDING : rawPhase) as PhaseType
    const sections: AssembledSection[] = [
      ...merged.sections,
      // B12: AssembledSection is { name, text } (no order — ordering happened pre-waterfall in
      // SystemPrompt.assemble(); the `order` + `as AssembledSection` cast was a type crime).
      { name: 'phase-instruction', text: PHASE_INSTRUCTIONS[phase] },
    ]
    if (phase === Phase.GENERATION) {
      sections.push({ name: 'sql-conventions', text: SQL_CONVENTIONS })
    }
    return { ...merged, sections }
  }

  // ── hook 6: llm/stream (stream-wrap waterfall) — F5 billing (stream start) ──
  /** `llm/stream` stream-wrap waterfall hook: charge one LLM call per agent at stream start (F5) before delegating downstream. */
  onLlmStream = (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> => {
    const sid = (options as { sessionId?: unknown }).sessionId
    if (typeof sid === 'string') {
      const s = this.sessions.get(sid) // global event — only count known phase-gate agents
      if (s !== undefined) s.llm_call_count += 1 // F5: charge at stream start
    }
    return next()
  }

  // ── hook 7: agent/pre-step (waterfall) — F6 step count + stall reset ──
  /** `agent/pre-step` waterfall hook: reset the stall watchdog and increment the per-step count (F6) before delegating downstream. */
  onPreStep = async (
    { agent }: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    const s = this.state(String(agent.id))
    this.touchStallTimer(agent, s) // F3: reset on each step
    s.step_count += 1 // F6: per-step count (mirrors rbi max_steps)
    return next()
  }

  // ── agent/status (emit) — F4 question-start: idle→running resets question-scoped counters ──
  /**
   * `agent/status` emit hook: on idle-to-running (a new user question) reset
   * question-scoped counters and phase (F4); mid-kick steers do not transition through idle.
   */
  onStatus = ({ agent, status }: { agent: Agent; status: 'idle' | 'running' }): void => {
    const s = this.state(String(agent.id))
    // F4: a kick starts on idle→running (a steer mid-kick does not transition
    // through idle). turn/start is per-TURN (a kick spans many) — must NOT reset.
    if (s.prior_status === 'idle' && status === 'running') this.resetQuestionScoped(s)
    s.prior_status = status
  }

  // ── helpers ──
  private advance(agent: Agent, s: PhaseGateState): void {
    s.phase_idx += 1
    s.phase_attempts = 0
    s.phase_output = ''
    s.last_critique = null
    s.last_quality = null
    if (s.phase_idx >= PHASE_ORDER.length) {
      s.current_phase = 'COMPLETE'
      return // kick ends — no continuation inject
    }
    s.current_phase = PHASE_ORDER[s.phase_idx] ?? Phase.UNDERSTANDING
    this.inject(agent, `[phase advance → ${s.current_phase}] Proceed per the ${s.current_phase} phase instructions.`)
  }

  private fallback(agent: Agent, s: PhaseGateState, to: PhaseType): void {
    s.fallback_count += 1
    s.phase_idx = PHASE_ORDER.indexOf(to)
    s.current_phase = to
    s.phase_attempts = 0
    s.phase_output = ''
    s.last_critique = null
    s.last_quality = null
    this.inject(agent, `[fallback → ${to}] Recover per the ${to} phase instructions.`)
  }

  private honestDecline(s: PhaseGateState, reason: string): void {
    s.honest_decline_reason = reason
    s.current_phase = 'DECLINED'
    this.clearStallTimer(s)
    // No inject → turn ends → kick ends (M4: decline not cancel).
    this.ctx.logger.info(`[phase-gate] honest_decline: ${reason}`)
  }

  /**
   * F1 forced_load: programmatic `ctx.tools.execute` retrieval goes through guard (verified).
   * Runs `search_data_sources` for the phase's final text so GENERATION has grounding when UNDERSTANDING ended without candidates.
   * @param agent The harness agent whose turn is stopping (passed to the tool execution as the caller).
   * @param signal The turn's abort signal, forwarded to the tool execution for cancellation.
   * @param query The phase's final assistant text used as the search query for candidate retrieval.
   */
  async forcedLoad(agent: Agent, signal: AbortSignal, query: string): Promise<void> {
    // P-DA1: optional chaining — when the host did not mount the tools registry
    // (ctx.tools undefined), fail-open (the comment's intent) instead of throwing.
    // The route-gate backstop relies on forcedLoad being best-effort in tests/hosts
    // where the tools registry is absent.
    const execute = this.ctx.tools?.execute
    if (execute === undefined) return // host did not mount the tools registry — fail-open
    try {
      await execute({ callId: CallId('phase-gate:forced_load'), name: 'search_data_sources', arguments: { query }, signal, agent })
    } catch {
      // forced_load is best-effort; the gate + execution-feedback backstop it.
    }
  }

  private inject(agent: Agent, text: string): void {
    agent.inject(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  }

  private generationGate(s: PhaseGateState): GateResult {
    // GROUNDING GATE (c root-cause): GENERATION requires a definition was
    // loaded (load_event_definition OR load_table_definition) before allowing
    // SQL generation — else the model writes SQL from event-name-as-table
    // guesses instead of the event_view FROM the load returned. Runs BEFORE
    // extractSqlCandidate/sqlSyntaxGate; failing here → the existing
    // retry/fallback path (within max_attempts, then fallback to UNDERSTANDING)
    // forces the model to load a definition first. captureToolData sets the
    // flag on a non-error load_* result; an errored or absent load leaves it
    // false. (Deterministic grounding — not a persona instruction.)
    if (!s.definition_loaded) {
      return GateResult.fail('no definition loaded — call load_event_definition (events) or load_table_definition (tables) before writing SQL')
    }
    if (s.phase_output === '') return GateResult.fail('no phase output')
    const criticCtx: CriticCtx = {
      candidateTables: s.candidate_tables,
      eventParams: s.event_params,
      partitionCols: s.partition_cols,
    }
    const sql = extractSqlCandidate(s.phase_output)
    if (sql !== null) s.last_sql = sql // F2: same-source for EXECUTION query_data
    const gate = sqlSyntaxGate(s.phase_output, criticCtx)
    if (!gate.passed) return new GateResult(false, gate.reason) // adapt nl2sql-engine -> phase-gate GateResult
    // P-DA2: transition relax — when the critic tools (critique_sql_tool +
    // evaluate_sql_quality) are unregistered (the default — not yet shipped),
    // skip the last_critique/last_quality floor checks (they are always null
    // without those tools, so the gate would hard-fail and GENERATION could
    // never pass — grounded queries would die before EXECUTION). Rely on the
    // folded sqlSyntaxGate (+ candidate/event_params/partition harvest) alone.
    // When the critic ships (flag/probe), re-tighten — the floor checks return.
    if (!this.criticToolsRegistered()) return GateResult.pass()
    if (s.last_critique === null) return GateResult.fail('critique not run (critique_sql_tool missing)')
    if (s.last_critique < PipelineConfig.critique_confidence_floor) {
      return GateResult.fail(`critique confidence ${s.last_critique} < ${PipelineConfig.critique_confidence_floor}`)
    }
    if (s.last_quality === null) return GateResult.fail('quality not run / not evaluated (evaluate_sql_quality missing)')
    if (s.last_quality < PipelineConfig.quality_score_floor) {
      return GateResult.fail(`quality score ${s.last_quality} < ${PipelineConfig.quality_score_floor}`)
    }
    return GateResult.pass()
  }

  /**
   * P-DA2: probe whether the critic tools (`critique_sql_tool` +
   * `evaluate_sql_quality`) are registered for this scope. Transition relax:
   * when unregistered (default — critic not shipped), the GENERATION gate
   * skips the `last_critique`/`last_quality` floor checks and relies on the
   * folded `sqlSyntaxGate`; when registered (critic shipped), re-tighten.
   * Dual-probe: an explicit config flag (preferred) OR best-effort
   * `ctx.tools.get` (the agent-scope tools view). Flag preferred = explicit
   * opt-in overrides the probe; default `false` = assume unregistered unless
   * the flag or probe says otherwise.
   */
  private criticToolsRegistered(): boolean {
    if (this.cfg.critic_tools_registered === true) return true // flag preferred
    try {
      const tools = this.ctx.tools
      if (tools === undefined || typeof tools.get !== 'function') return false
      return tools.get('critique_sql_tool') !== undefined
        && tools.get('evaluate_sql_quality') !== undefined
    } catch {
      // best-effort: probe miss (no tools service / scope miss) → relax (rely on sqlSyntaxGate).
      return false
    }
  }

  private interpretGate(phaseOutput: string): GateResult {
    if (phaseOutput.includes(INCOMPLETE_MARKER)) {
      return GateResult.fail(`INCOMPLETE declaration (${INCOMPLETE_MARKER}): model cannot answer this turn`)
    }
    return GateResult.pass()
  }

  // ── F3 stall watchdog (independent timer; rbi `_watch_for_stall` 300s, exclude awaiting_input) ──
  private touchStallTimer(agent: Agent, s: PhaseGateState): void {
    this.clearStallTimer(s)
    if (s.awaiting_clarification || s.honest_decline_reason !== null || s.cancelled) return
    s.stall_timer = setTimeout(() => {
      if (s.awaiting_clarification || s.honest_decline_reason !== null || s.cancelled) return
      this.honestDecline(s, `stall watchdog: ${this.cfg.stall_watchdog_seconds}s with no events`)
      // A hung step needs interruption — stall is a timeout (external-ish), so cancel.
      try {
        agent.cancel({ kind: 'hook', reason: 'phase-gate stall watchdog' } as AgentCancelCause)
      } catch {
        // best-effort
      }
    }, this.cfg.stall_watchdog_seconds * 1000)
  }

  private clearStallTimer(s: PhaseGateState): void {
    if (s.stall_timer !== null) {
      clearTimeout(s.stall_timer)
      s.stall_timer = null
    }
  }

  /** F4: reset question-scoped counters + phase on a new user question (kick start). */
  private resetQuestionScoped(s: PhaseGateState): void {
    this.clearStallTimer(s) // B7: a pending stall timer must not fire on the new question.
    s.phase_idx = 0
    s.current_phase = Phase.UNDERSTANDING
    s.phase_attempts = 0
    s.fallback_count = 0
    s.llm_call_count = 0
    s.exec_count = 0
    s.turn_count = 0
    s.step_count = 0
    s.delivery_started = false
    s.phase_output = ''
    s.last_sql = null
    s.last_query_outcome = null
    s.last_critique = null
    s.last_quality = null
    s.honest_decline_reason = null
    s.cancelled = false
    s.cancelled_reason = null
    s.awaiting_clarification = false // B4: clear on a new question (a prior clarification HALT does not carry over).
    s.candidate_tables.clear()
    s.event_params.clear()
    s.partition_cols.clear()
    s.last_search_empty = true // P-DA1: reset grounding backstop flags (not called yet → empty).
    s.last_retrieve_empty = true
    s.definition_loaded = false // GROUNDING GATE (c): no definition loaded yet this question.
  }

  /**
   * Register the base persona (shadow) plus 7 harness event listeners and the stall-timer teardown effect.
   * @param ctx The Cordis context to mount the persona section, tool guard, and event listeners on.
   */
  register(ctx: Context): void {
    ctx.effect(() => ctx.systemPrompt.section({ name: PERSONA_SECTION, order: PERSONA_ORDER, text: BASE_PERSONA }), 'phase-gate.persona')
    ctx.tools.guard(this.guard)
    ctx.on('agent/turn-stopping', this.onTurnStopping)
    ctx.on('tools/post-execute', this.onPostExecute)
    ctx.on('agent/request', this.onRequest)
    ctx.on('system-prompt/assemble', this.onAssemble)
    ctx.on('llm/stream', this.onLlmStream)
    ctx.on('agent/pre-step', this.onPreStep)
    ctx.on('agent/status', this.onStatus)
    ctx.effect(() => () => {
      for (const s of this.sessions.values()) this.clearStallTimer(s)
    }, 'phase-gate.teardown')
  }
}

// ── lenient capture helpers (best-effort; adapt to real tool shapes when shipped) ──

/** B5: normalize SQL whitespace (mirrors extractSqlCandidate's `replace(/\s+/g, ' ').trim()`). */
function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function collectTableNames(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return
  const v = value as { tables?: unknown; table_names?: unknown; candidates?: unknown }
  const names = v.tables ?? v.table_names ?? v.candidates
  if (Array.isArray(names)) {
    for (const t of names) {
      if (typeof t === 'string') {
        out.add(t.toLowerCase())
        out.add(t.toLowerCase().replace(/^.*\./, ''))
      } else if (t !== null && typeof t === 'object') {
        // P-DA1: search_data_sources candidates are objects ({ id, score,
        // description?, mode }), not strings — the prior string-only harvest
        // missed them entirely (the projection mismatch the route-gate backstop
        // was designed around). Extract the `.id` leaf so GENERATION grounding
        // (candidate_tables) is populated. The backstop uses last_search_empty
        // (not candidate_tables) as its source of truth, so this fix and the
        // backstop defend each other; both stay.
        const id = (t as { id?: unknown }).id
        if (typeof id === 'string') {
          out.add(id.toLowerCase())
          out.add(id.toLowerCase().replace(/^.*\./, ''))
        }
      }
    }
  }
}

/**
 * P-DA1: probe whether a search/retrieve result's candidates array is empty (the
 * route-gate grounding backstop's source of truth). True = the tool was not
 * called OR returned no candidates (`candidates`/`tables`/`table_names` missing
 * or a zero-length array). Probing the array length (not `candidate_tables.size`)
 * sidesteps the projection mismatch — candidates are objects, and even with the
 * collectTableNames `.id` fix the backstop's aggregate empty flag is the spec'd
 * signal (avoids candidate_tables projection bug).
 */
function isCandidatesEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const v = value as { candidates?: unknown; tables?: unknown; table_names?: unknown }
  const arr = v.candidates ?? v.tables ?? v.table_names
  return !Array.isArray(arr) || arr.length === 0
}

function collectFields(value: unknown, out: Set<string>, ...keys: string[]): void {
  if (value === null || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) {
      for (const f of v) {
        if (typeof f === 'string') {
          out.add(f.toLowerCase())
        } else if (f !== null && typeof f === 'object') {
          // load_* projects substrate maps to arrays of `{ name, … }`
          // (TableModel.partitions / EventModel.params_fields) — harvest the
          // `name` leaf (the substrate map key) from each projected element.
          const name = (f as { name?: unknown }).name
          if (typeof name === 'string') out.add(name.toLowerCase())
        }
      }
    } else if (v !== null && typeof v === 'object') {
      // Substrate map shape (Record<string, FieldDef>): the map keys ARE the
      // field names. (load_* exposes the projected array form post-projection;
      // the helper stays shape-agnostic for direct-substrate callers.)
      for (const f of Object.keys(v as Record<string, unknown>)) out.add(f.toLowerCase())
    }
  }
}

function readAgentId(context: AssembleContext): string | null {
  // B2: assembleContextFor (packages/core/agent/src/dispatch.ts) returns
  // { agent, scope: agent } — scope IS the agent, so scope.agent.id was always
  // undefined → onAssemble fell back to UNDERSTANDING (persona C broken). The
  // agent is on context.agent (AssembleContext.agent, augmented by
  // @deepseek-ai/dsh-agent; absent only on diagnostics).
  const id = context.agent?.id
  return id !== undefined ? String(id) : null
}

// ── (b) criticCtx service: exposes the per-agent critic guard context ──────
// The critique_sql_tool + evaluate_sql_quality Consumer tools (da-owned,
// packages/data/tool-critique-sql + tool-evaluate-sql-quality) read this
// service to get the per-agent candidateTables / eventParams / partitionCols
// the phase-gate harvested from search_data_sources / load_* (captureToolData).
// §2.3: the tool defines a structural CriticCtxProvider interface + probes
// ctx.get('criticCtx') (soft — undefined when the phase-gate is not mounted);
// this Service is the Provider. The service closes over the PhaseGate instance
// (peekState is non-creating so a critique on an unknown agent degrades to
// empty sets).
//
// ISOLATION (b regression #2 fix): criticCtx MUST register in the
// phase-gating group's isolate realm (NOT root). The composition isolates it
// (`isolate: { criticCtx: true }` on the `phase-gating` group in
// agent.cordis.yml), so ctx[symbols.isolate]['criticCtx'] resolves to a
// realm-private symbol below the group and `provide()` stores the impl under
// that symbol — not the root symbol cordis mints via
// `root[symbols.isolate][name] ??= Symbol(name)`. dsh-agent-presets' mount
// guard (leakedServices) rejects any service whose store key equals the root
// isolate symbol for its name; without the isolate entry criticCtx lands in
// root (`PresetMountError: ... published process-global service(s) [criticCtx]`)
// and the preset NEVER joins. The critique tools sit INSIDE the same group, so
// their ctx.get('criticCtx') resolves the same realm-private symbol and finds
// the service (a consumer left outside the group resolves the host root realm,
// which this preset does not populate). The prior "non-isolated name →
// visible to parent-realm tools via undefined===undefined" reasoning was
// WRONG: provide() mints a root symbol for every name it is called with, so a
// non-isolated criticCtx stores under that root symbol and leaks — the
// undefined===undefined filter pass is exactly the mount-rejected state.
/**
 * Cordis `Service` exposing the per-agent critic guard context as
 * `ctx.criticCtx`. The critique_sql_tool + evaluate_sql_quality tools probe
 * `ctx.get('criticCtx')` and call `forAgent(agentId)` to get the
 * `CriticCtx` ({candidateTables, eventParams, partitionCols}) for the
 * current agent's phase-gate state. The service registers in whatever isolate
 * realm the composing context carries — the `phase-gating` group isolates
 * `criticCtx` so it lands in that entry-local realm, not root.
 */
export class CriticCtxService extends Service {
  private readonly gate: PhaseGate

  /**
   * @param ctx - the context to register the service on (tied to the phase-gate fiber).
   * @param gate - the PhaseGate instance whose per-agent state is exposed.
   */
  constructor(ctx: Context, gate: PhaseGate) {
    super(ctx, 'criticCtx')
    this.gate = gate
  }

  /**
   * Get the per-agent critic guard context (candidate tables, event params,
   * partition cols) for the given agent. Returns `undefined` when the agent
   * has no phase-gate state (the tool degrades to empty sets + a low
   * confidence — the honest "cannot verify table grounding" state).
   * @param agentId - the harness agent id (stringified) to look up.
   * @returns the `CriticCtx` for this agent, or `undefined` when none exists.
   */
  forAgent(agentId: string): CriticCtx | undefined {
    const s = this.gate.peekState(agentId)
    if (s === undefined) return undefined
    return {
      candidateTables: s.candidate_tables,
      eventParams: s.event_params,
      partitionCols: s.partition_cols,
    }
  }
}
