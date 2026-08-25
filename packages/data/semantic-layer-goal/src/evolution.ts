/**
 * B→A Evolution — route config that switches landing page from workspace
 * to dashboard based on eval quality metrics.
 *
 * Pure computation: given config + driver state, returns the evolution state.
 * No I/O, no side effects.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/evolution
 */

import type { EvolutionRouteConfig, EvolutionState } from './types.ts'
import { DEFAULT_EVOLUTION_ROUTE_CONFIG } from './types.ts'
import type { GoalRoundDriver } from './goal-round-driver.ts'

/**
 * Compute the current evolution state from config and driver state.
 *
 * The decision logic:
 * - If evolution is disabled, always phase B.
 * - If rounds completed < minRoundsCompleted, phase B (not enough data).
 * - If current pass_rate >= dashboardThreshold, phase A.
 * - Otherwise, phase B.
 *
 * @param config - The evolution route configuration.
 * @param driver - The GoalRoundDriver (read-only observation).
 * @returns The computed evolution state.
 */
export function computeEvolutionState(
  config: EvolutionRouteConfig = DEFAULT_EVOLUTION_ROUTE_CONFIG,
  driver: GoalRoundDriver,
): EvolutionState {
  const roundsCompleted = driver.round
  const lastRound = driver.rounds[driver.rounds.length - 1]
  const currentPassRate = lastRound?.evalResult?.pass_rate ?? 0

  const thresholdMet = roundsCompleted >= config.minRoundsCompleted
    && currentPassRate >= config.dashboardThreshold

  const phase: 'B' | 'A' = config.enabled && thresholdMet ? 'A' : 'B'

  return {
    phase,
    currentPassRate,
    roundsCompleted,
    thresholdMet,
    landingRoute: phase === 'A' ? config.dashboardRoute : config.workspaceRoute,
  }
}

/**
 * Check if the evolution should transition from B to A.
 * Convenience predicate for route guards.
 */
export function shouldEvolve(
  config: EvolutionRouteConfig,
  driver: GoalRoundDriver,
): boolean {
  if (!config.enabled) return false
  const state = computeEvolutionState(config, driver)
  return state.phase === 'A'
}
