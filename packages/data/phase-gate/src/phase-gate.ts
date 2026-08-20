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
  freshPhaseGateState,
  type PhaseGateState,
  type Phase as PhaseType,
} from './types.ts'
import { sqlSyntaxGate } from './critic.ts'

export interface PhaseGateConfig {
  scopeId?: string
  max_fallbacks?: number
  max_subquestions?: number
  max_executions_per_turn?: number
  max_llm_calls_per_turn?: number
  max_state_turns?: number
  stall_watchdog_seconds?: number
}

const REASONING_EFFORT: Readonly<Record<string, 'high' | 'medium'>> = {
  [Phase.UNDERSTANDING]: 'high',
  [Phase.GENERATION]: 'high',
  [Phase.EXECUTION]: 'medium',
  [Phase.INTERPRETATION]: 'medium',
}

const BASE_PERSONA = `You are a data agent for a per-game analytics platform. You answer natural-language data questions over a semantic layer (events/tables/terminology) by running a four-phase pipeline: UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION. Follow the per-phase instructions injected at runtime. If you cannot answer, emit a honest decline (the ${INCOMPLETE_MARKER} marker in INTERPRETATION); never fabricate tables, fields, or results.`

const PHASE_INSTRUCTIONS: Readonly<Record<PhaseType, string>> = {
  [Phase.UNDERSTANDING]: `UNDERSTANDING: retrieve candidates (search_data_sources), load full definitions (load_table_definition/load_event_definition/load_table_dimensions when dimension_hint), decompose compound → atomic sub-questions (≤${PipelineConfig.max_subquestions}) prefixed by 【拆解】, run the six-class disambiguation scan. High → GENERATION; mid → present_clarification (HALT, await user; ${PipelineConfig.disambiguation_timeout_seconds}s → honest_decline); low → honest reject / discovery path.`,
  [Phase.GENERATION]: 'GENERATION: generate SQL from semantic-layer-grounded fields (never hardcode schema); critique_sql_tool + evaluate_sql_quality. The turn-stopping gate checks the SQL candidate (extract_sql_candidate) — the critic (regex + JSON path, no sqlglot) rejects tables ∉ candidates, GET_JSON_OBJECT fields ∉ event_params; warns on SELECT * / missing ds partition. Wrap SQL in ```sql fences. Fallback → UNDERSTANDING.',
  [Phase.EXECUTION]: 'EXECUTION (deterministic, not ReAct): query_data(sql) runs the Guard Chain. The SQL passed MUST equal the critiqued SQL (same-source — post-execute blocks a mismatch). Three outcomes drive the turn-stopping decision: done → advance; running → wait + poll; failed → fallback→GENERATION (carry error) or honest_decline. Never re-send the original SQL.',
  [Phase.INTERPRETATION]: `INTERPRETATION: deliver via tools only, strict order: present_decomposition (forced first) → present_table (pass result_id + intent) → compute → 【发现】(once) → 【注意】(once, list assumptions) → suggest_followups. Output purity: no **, no process narration, no SQL display, thousands separator. If you CANNOT answer, emit ${INCOMPLETE_MARKER} (NOT clarification — no HALT in delivery); the turn-stopping gate reads it → honest_decline. No fallback phase.`,
}

const SQL_CONVENTIONS = 'SQL conventions (MaxCompute/hive dialect): partition predicate ds=\'yyyyMMdd\' required for partitioned tables; SELECT-only; prefer explicit columns over SELECT *; GET_JSON_OBJECT field paths must reference event_params loaded in UNDERSTANDING.'

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
    }
  }

  state(agentId: string): PhaseGateState {
    let s = this.sessions.get(agentId)
    if (s === undefined) {
      s = freshPhaseGateState(this.cfg.scopeId)
      this.sessions.set(agentId, s)
    }
    return s
  }

  // ── hook 1: ctx.tools.guard — hard whitelist + exec-budget pre-reject (D5, M1) ──
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

  // ── hook 2: agent/turn-stopping (serial, void) — advance / gate / fallback / decline ──
  onTurnStopping = async ({ agent, signal }: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> => {
    const s = this.state(String(agent.id))
    this.touchStallTimer(agent, s) // F3: an event arrived — reset the watchdog
    if (s.honest_decline_reason !== null || s.cancelled) return
    if (s.turn_count >= this.cfg.max_state_turns) { // F6/D6 budget
      this.honestDecline(s, `budget: turn_count ${s.turn_count} ≥ ${this.cfg.max_state_turns} max_state_turns (D6)`)
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
      }
      this.advance(agent, s)
      return
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
    if (s.last_query_outcome === 'done') {
      this.advance(agent, s)
      return
    }
    if (s.last_query_outcome === 'running') {
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
    throw new Error(`unknown gate: ${cfg.gate} (phase ${s.current_phase})`)
  }

  // ── hook 3: tools/post-execute — count + capture critic data + F2 same-source block ──
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
        if (args?.sql !== undefined && args.sql !== s.last_sql) {
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
      const outcome = (value as { outcome?: string } | null | undefined)?.outcome
      s.last_query_outcome = outcome === 'done' || outcome === 'running' || outcome === 'failed' ? outcome : 'done'
    } else if (name === 'critique_sql_tool') {
      s.last_critique = (value as { confidence?: number } | null | undefined)?.confidence ?? null
    } else if (name === 'evaluate_sql_quality') {
      s.last_quality = (value as { score?: number } | null | undefined)?.score ?? null
    } else if (name === 'present_decomposition' || name === 'present_table') {
      s.delivery_started = true
    } else if (name === 'search_data_sources') {
      collectTableNames(value, s.candidate_tables)
    } else if (name === 'load_event_definition') {
      collectFields(value, s.event_params, 'params_fields', 'params')
    } else if (name === 'load_table_definition') {
      collectFields(value, s.partition_cols, 'partition_cols', 'partitions')
    }
  }

  // ── hook 4: agent/request (waterfall) — per-phase reasoning effort (D7) ──
  onRequest = async (
    { agent }: { agent: Agent; turn: number; step: number; signal: AbortSignal },
    next: () => Promise<GenerateOptions>,
  ): Promise<GenerateOptions> => {
    const s = this.state(String(agent.id))
    const base = await next()
    const effort = REASONING_EFFORT[s.current_phase] ?? 'medium'
    return { ...base, reasoningEffort: ReasoningEffortId(effort) }
  }

  // ── hook 5: system-prompt/assemble — base persona (shadow) + dynamic phase instructions (C) ──
  onAssemble = async (
    _assembly: PromptAssembly,
    context: AssembleContext,
    next: () => Promise<PromptAssembly>,
  ): Promise<PromptAssembly> => {
    const merged = await next() // delegate to downstream, then inject additively
    const agentId = readAgentId(context)
    const s = agentId === null ? null : this.sessions.get(agentId) ?? null
    const phase = (s === null ? Phase.UNDERSTANDING : s.current_phase) as PhaseType
    const sections: AssembledSection[] = [
      ...merged.sections,
      { name: 'phase-instruction', order: 50, text: PHASE_INSTRUCTIONS[phase] } as AssembledSection,
    ]
    if (phase === Phase.GENERATION) {
      sections.push({ name: 'sql-conventions', order: 51, text: SQL_CONVENTIONS } as AssembledSection)
    }
    return { ...merged, sections }
  }

  // ── hook 6: llm/stream (stream-wrap waterfall) — F5 billing (stream start) ──
  onLlmStream = (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> => {
    const sid = (options as { sessionId?: unknown }).sessionId
    if (typeof sid === 'string') {
      const s = this.sessions.get(sid) // global event — only count known phase-gate agents
      if (s !== undefined) s.llm_call_count += 1 // F5: charge at stream start
    }
    return next()
  }

  // ── hook 7: agent/pre-step (waterfall) — F6 step count + stall reset ──
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

  /** F1 forced_load: programmatic ctx.tools.execute goes through guard (verified). */
  async forcedLoad(agent: Agent, signal: AbortSignal, query: string): Promise<void> {
    const execute = this.ctx.tools.execute
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
    if (s.phase_output === '') return GateResult.fail('no phase output')
    const gate = sqlSyntaxGate(s.phase_output, s)
    if (!gate.passed) return gate
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
    s.candidate_tables.clear()
    s.event_params.clear()
    s.partition_cols.clear()
  }

  /** Register base persona (shadow) + 7 listeners + stall-timer teardown. */
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
function collectTableNames(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return
  const v = value as { tables?: unknown; table_names?: unknown; candidates?: unknown }
  const names = v.tables ?? v.table_names ?? v.candidates
  if (Array.isArray(names)) {
    for (const t of names) {
      if (typeof t === 'string') out.add(t.toLowerCase())
    }
  }
}

function collectFields(value: unknown, out: Set<string>, ...keys: string[]): void {
  if (value === null || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) {
      for (const f of v) {
        if (typeof f === 'string') out.add(f.toLowerCase())
      }
    } else if (v !== null && typeof v === 'object') {
      for (const f of Object.keys(v as Record<string, unknown>)) out.add(f.toLowerCase())
    }
  }
}

function readAgentId(context: AssembleContext): string | null {
  const scope = (context as { scope?: { agent?: { id?: string } } }).scope
  const id = scope?.agent?.id
  return typeof id === 'string' ? id : null
}
