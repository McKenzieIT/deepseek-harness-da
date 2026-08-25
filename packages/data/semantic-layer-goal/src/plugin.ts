/**
 * SemanticLayerGoalPlugin — Cordis plugin that wires eval results into the
 * goal system for the semantic-layer data agent.
 *
 * This is the integration glue: it listens for eval completion events,
 * constructs EvalEvidence, and feeds it through the GoalRoundDriver.
 *
 * Gate-③: actual tool implementations and management agent preset are TBD.
 * This file provides the plugin skeleton and configuration shape.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/plugin
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  GoalRoundDriverConfig,
  NoProgressDetectorConfig,
  EvolutionRouteConfig,
  ManagementAgentToolset,
  DiagnoseResult,
  EnrichResult,
  ValidateResult,
  ExplainResult,
  DiagnoseFinding,
} from './types.ts'
import {
  DEFAULT_GOAL_ROUND_DRIVER_CONFIG,
  DEFAULT_NO_PROGRESS_CONFIG,
  DEFAULT_EVOLUTION_ROUTE_CONFIG,
} from './types.ts'
import { GoalRoundDriver } from './goal-round-driver.ts'
import { computeEvolutionState } from './evolution.ts'

export const name = 'semantic-layer-goal'
export const inject = ['goals']
export const optional = ['eval']

/**
 * Plugin configuration schema.
 * All fields are optional and default to conservative values.
 */
export interface SemanticLayerGoalConfig {
  /** GoalRoundDriver configuration overrides. */
  readonly driver: Partial<GoalRoundDriverConfig>
  /** NoProgressDetector configuration overrides. */
  readonly noProgress: Partial<NoProgressDetectorConfig>
  /** B→A evolution route configuration. */
  readonly evolution: Partial<EvolutionRouteConfig>
  /** Whether the autonomous loop is enabled (gate-③ must be active). */
  readonly enabled: boolean
}

/** Default plugin config. */
export const DEFAULT_PLUGIN_CONFIG: SemanticLayerGoalConfig = {
  driver: {},
  noProgress: {},
  evolution: {},
  enabled: false,
}

/**
 * Placeholder ManagementAgentToolset.
 * All methods throw until gate-③ provides real implementations.
 */
export function createPlaceholderToolset(): ManagementAgentToolset {
  const notImplemented = (method: string): never => {
    throw new Error(`ManagementAgentToolset.${method}() is not implemented — gate-③ has not activated.`)
  }

  return {
    diagnose(_assetId: string): Promise<DiagnoseResult> {
      return Promise.reject(notImplemented('diagnose'))
    },
    enrich(_assetId: string): Promise<EnrichResult> {
      return Promise.reject(notImplemented('enrich'))
    },
    validate(_assetId: string): Promise<ValidateResult> {
      return Promise.reject(notImplemented('validate'))
    },
    explain(_finding: DiagnoseFinding): Promise<ExplainResult> {
      return Promise.reject(notImplemented('explain'))
    },
  }
}

/**
 * Apply the SemanticLayerGoalPlugin to a Cordis context.
 *
 * When enabled, this plugin:
 * 1. Creates a GoalRoundDriver instance with the configured thresholds
 * 2. Listens for eval completion signals
 * 3. Feeds results through the NoProgressDetector
 * 4. Updates goal state accordingly
 * 5. Computes and exposes evolution state for the route layer
 *
 * Gate-③ note: The autonomous loop does NOT run until `config.enabled` is
 * true AND a real ManagementAgentToolset is registered. The plugin always
 * exposes the evolution state and driver for manual invocation.
 */
export function apply(ctx: Context, config: Partial<SemanticLayerGoalConfig> = {}): void {
  const resolvedConfig: SemanticLayerGoalConfig = {
    ...DEFAULT_PLUGIN_CONFIG,
    ...config,
    driver: { ...config.driver },
    noProgress: { ...config.noProgress },
    evolution: { ...config.evolution },
  }

  const driverConfig: GoalRoundDriverConfig = {
    ...DEFAULT_GOAL_ROUND_DRIVER_CONFIG,
    ...resolvedConfig.driver,
  }

  const noProgressConfig: NoProgressDetectorConfig = {
    ...DEFAULT_NO_PROGRESS_CONFIG,
    ...resolvedConfig.noProgress,
  }

  const evolutionConfig: EvolutionRouteConfig = {
    ...DEFAULT_EVOLUTION_ROUTE_CONFIG,
    ...resolvedConfig.evolution,
  }

  // Instantiate the driver
  const driver = new GoalRoundDriver(driverConfig, noProgressConfig)

  // Expose on context for other plugins to observe
  // (using ctx.provide pattern — actual registration TBD at gate-③)
  ctx.set('semanticLayerGoal', {
    driver,
    config: resolvedConfig,
    toolset: createPlaceholderToolset(),
    getEvolutionState: () => computeEvolutionState(evolutionConfig, driver),
  })

  // Guard: if not enabled, only expose the passive API
  if (!resolvedConfig.enabled) {
    ctx.logger?.info?.('semantic-layer-goal: plugin loaded in passive mode (gate-③ not active)')
    return
  }

  // Gate-③ active path: wire eval events to the goal round driver.
  // This is the skeleton — actual event wiring depends on the eval plugin
  // emitting events on the Cordis context.
  ctx.logger?.info?.('semantic-layer-goal: plugin loaded in active mode')

  // Placeholder: when eval events exist, wire them here:
  // ctx.on('eval/complete', async (runResult) => { ... })
}
