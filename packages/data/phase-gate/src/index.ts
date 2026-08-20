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
import { PhaseGate, type PhaseGateConfig } from './phase-gate.ts'
import { PipelineConfig } from './types.ts'

export { PhaseGate, type PhaseGateConfig } from './phase-gate.ts'
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
  freshPhaseGateState,
  type PhaseGateState,
} from './types.ts'
export { extractSqlCandidate, critiqueSql, sqlSyntaxGate } from './critic.ts'

/** Cordis plugin name. */
export const name = 'phase-gate'

/** Registries/seeds phase-gate subscribes to (loaded before mount). */
export const inject = ['tools', 'systemPrompt', 'agents']

/** Runtime config schema (rbi `PipelineConfig` overrides; D6 adopts defaults). */
export interface Config extends PhaseGateConfig {}
export const Config: z<Config> = z.object({
  scopeId: z.string().default('game-1'),
  max_fallbacks: z.number().default(PipelineConfig.max_fallbacks),
  max_subquestions: z.number().default(PipelineConfig.max_subquestions),
  max_executions_per_turn: z.number().default(PipelineConfig.max_executions_per_turn),
  max_llm_calls_per_turn: z.number().default(PipelineConfig.max_llm_calls_per_turn),
  max_state_turns: z.number().default(PipelineConfig.max_state_turns),
  stall_watchdog_seconds: z.number().default(PipelineConfig.stall_watchdog_seconds),
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
}
