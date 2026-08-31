/**
 * `@deepseek-ai/dsh-phase-gate` — the four-phase phase-gate orchestration
 * plugin for the DeepSeek Harness data agent. Reverse-bi `DataAgentPipeline`
 * re-expressed on harness event seams (additive, no custom agent-loop, no
 * collapsed phases). Mounts agent-plane via the data-agent preset (isolate
 * realm). See `phase-gate.ts` for the 7-hook control flow + F1–F6.
 *
 * Model routing stays out of the preset (`installAgentLlmTarget` seam);
 * phase-gate layers per-phase `reasoningEffort` via the `agent/request`
 * waterfall (D7).
 * @module @deepseek-ai/dsh-phase-gate
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: loads the Events augmentation so `ctx.on('agent/turn-stopping', …)`
// etc. are typed (signatures, waterfall `next`, serial void return). The seam
// stays runtime-optional — a host without these services simply never fires.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { PhaseGate, CriticCtxService, type PhaseGateConfig } from './phase-gate.ts'
import { PipelineConfig } from './domain.ts'

export { PhaseGate, CriticCtxService, type PhaseGateConfig } from './phase-gate.ts'

// (b) criticCtx service: the phase-gate exposes the per-agent critic guard
// context (candidateTables / eventParams / partitionCols) as ctx.criticCtx so
// the critique_sql_tool + evaluate_sql_quality Consumer tools can read it
// (they probe ctx.get('criticCtx')). The service is constructed in apply()
// below, closing over the PhaseGate instance. The composition isolates
// `criticCtx` in the `phase-gating` group (agent.cordis.yml), so the service
// registers in that entry-local realm — NOT root — and the agent-presets
// mount guard accepts the preset (b regression #2).
declare module '@deepseek-ai/cordis' {
  interface Context {
    criticCtx: CriticCtxService
  }
}
export {
  Phase,
  PHASE_ORDER,
  PHASE_CONFIGS,
  PHASE_TOOLS,
  PipelineConfig,
  GateResult,
  CriticFinding,
  DECOMPOSITION_MARKER,
  INCOMPLETE_MARKER,
  ROUTE_MARKER_REGEX,
  extractRoute,
  freshPhaseGateState,
} from './domain.ts'
export { type PhaseGateState } from './types.ts'
// critic dedup (P13b Q2 boundary): critic logic + GateResult/CriticCtx live in
// @deepseek-ai/dsh-nl2sql-engine; phase-gate delegates to sqlSyntaxGate /
// extractSqlCandidate in src/phase-gate.ts. No re-export (nl2sql-engine owns
// the critic API; no external consumer imported these from phase-gate).

/** Cordis plugin name. */
export const name = 'phase-gate'

/** Registries/seeds phase-gate subscribes to (loaded before mount). */
export const inject = ['tools', 'systemPrompt', 'agents']

/** Runtime config schema (rbi `PipelineConfig` overrides; D6 adopts defaults). */
export interface Config extends PhaseGateConfig {}
export const Config: z<Config> = z.object({
  scopeId: z.string().default('default'),
  max_fallbacks: z.number().default(PipelineConfig.max_fallbacks),
  max_subquestions: z.number().default(PipelineConfig.max_subquestions),
  max_executions_per_turn: z.number().default(PipelineConfig.max_executions_per_turn),
  max_llm_calls_per_turn: z.number().default(PipelineConfig.max_llm_calls_per_turn),
  max_state_turns: z.number().default(PipelineConfig.max_state_turns),
  stall_watchdog_seconds: z.number().default(PipelineConfig.stall_watchdog_seconds),
  critic_tools_registered: z.boolean().default(false),
})

/**
 * Mount the phase-gate plugin for the calling agent's scope. Registers the
 * base persona (shadow), the `ctx.tools.guard` hard whitelist, and the 7
 * event listeners. Call from the agent factory's `setup(agentCtx)` (via the
 * data-agent preset's standing mount) — a rejection there rolls the agent
 * back. The `invariants` companion reserves package ownership separately.
 * @param ctx - an agent scope context (unscoped would collide).
 * @param config - rbi `PipelineConfig` overrides.
 */
export function apply(ctx: Context, config: Config): void {
  const gate = new PhaseGate(ctx, config)
  gate.register(ctx)
  // (b) register the criticCtx service so the critique_sql_tool +
  // evaluate_sql_quality Consumer tools can read the per-agent critic guard
  // context (candidateTables / eventParams / partitionCols). Constructing a
  // Service registers it on ctx.reflect and ties it to the phase-gate fiber
  // (auto-removed on unload). The service registers in whatever isolate realm
  // the composing context carries — the `phase-gating` group isolates
  // `criticCtx` (agent.cordis.yml), so this plugin's context (a child of the
  // group) resolves ctx[symbols.isolate]['criticCtx'] to the realm-private
  // symbol and provide() stores the impl there — NOT in the root realm. The
  // critique tools sit INSIDE the same group, so their ctx.get('criticCtx')
  // resolves the same realm-private symbol and finds this service. (b
  // regression #2: a non-isolated criticCtx leaks to root and the
  // agent-presets mount guard rejects it → the preset never joins.)
  new CriticCtxService(ctx, gate)
}
