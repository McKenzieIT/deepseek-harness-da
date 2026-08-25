/**
 * Unit tests for the B→A evolution logic.
 *
 * Tests the route-switching computation based on config and driver state.
 */

import { describe, it, expect } from 'vitest'
import type { EvolutionRouteConfig } from '../src/types.ts'
import { DEFAULT_EVOLUTION_ROUTE_CONFIG } from '../src/types.ts'
import { computeEvolutionState, shouldEvolve } from '../src/evolution.ts'
import { GoalRoundDriver } from '../src/goal-round-driver.ts'
import type { RunResult, DeltaReport } from '../src/eval-runner-types.ts'
import type { EvalExecutor, DeltaComputer, GoalFeedbackSink, DecisionMaker } from '../src/goal-round-driver.ts'
import type { EvalEvidence, ManagementAgentToolset } from '../src/types.ts'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeRunResult(passRate: number, runId: string = 'run-1'): RunResult {
  const total = 100
  const correct = Math.round(passRate * total)
  return {
    run_id: runId,
    timestamp: new Date().toISOString(),
    cases: [],
    summary: {
      total,
      correct,
      wrong: total - correct,
      declined: 0,
      unjudged: 0,
      infra_failure: 0,
      pass_rate: passRate,
    },
  }
}

function createMockCollaborators(results: RunResult[]): {
  evalExec: EvalExecutor
  deltaComp: DeltaComputer
  feedback: GoalFeedbackSink
  decider: DecisionMaker
  toolset: ManagementAgentToolset
} {
  let callIndex = 0
  return {
    evalExec: {
      async runEval(): Promise<RunResult> {
        const result = results[callIndex]
        if (result === undefined) throw new Error('No more results')
        callIndex++
        return result
      },
    },
    deltaComp: {
      computeDelta(previous: RunResult, current: RunResult): DeltaReport {
        return { run_a_id: previous.run_id, run_b_id: current.run_id, flips: [], summary: { improved: 0, regressed: 0, unchanged: 100 } }
      },
    },
    feedback: {
      async feedEvidence(_evidence: EvalEvidence): Promise<void> {},
      async blockGoal(_reason: { code: string; message: string }): Promise<void> {},
      async completeGoal(_summary: string): Promise<void> {},
    },
    decider: {
      async decide(_evidence: EvalEvidence, _toolset: ManagementAgentToolset) { return null },
    },
    toolset: {
      diagnose: () => Promise.reject(new Error('not implemented')),
      enrich: () => Promise.reject(new Error('not implemented')),
      validate: () => Promise.reject(new Error('not implemented')),
      explain: () => Promise.reject(new Error('not implemented')),
    },
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Evolution', () => {
  describe('computeEvolutionState', () => {
    it('returns phase B when evolution is disabled', () => {
      const config: EvolutionRouteConfig = { ...DEFAULT_EVOLUTION_ROUTE_CONFIG, enabled: false }
      const driver = new GoalRoundDriver()
      const state = computeEvolutionState(config, driver)
      expect(state.phase).toBe('B')
      expect(state.landingRoute).toBe('/workspace')
      expect(state.thresholdMet).toBe(false)
    })

    it('returns phase B when not enough rounds completed', async () => {
      const config: EvolutionRouteConfig = {
        enabled: true,
        dashboardThreshold: 0.85,
        minRoundsCompleted: 3,
        workspaceRoute: '/workspace',
        dashboardRoute: '/dashboard',
      }
      const driver = new GoalRoundDriver()
      const { evalExec, deltaComp, feedback, decider, toolset } = createMockCollaborators([
        makeRunResult(0.9, 'run-1'), // above threshold but only 1 round
      ])

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      const state = computeEvolutionState(config, driver)
      expect(state.phase).toBe('B')
      expect(state.roundsCompleted).toBe(1)
      expect(state.thresholdMet).toBe(false) // minRounds not met
    })

    it('returns phase B when pass_rate below threshold', async () => {
      const config: EvolutionRouteConfig = {
        enabled: true,
        dashboardThreshold: 0.85,
        minRoundsCompleted: 2,
        workspaceRoute: '/workspace',
        dashboardRoute: '/dashboard',
      }
      const driver = new GoalRoundDriver()
      const { evalExec, deltaComp, feedback, decider, toolset } = createMockCollaborators([
        makeRunResult(0.5, 'run-1'),
        makeRunResult(0.6, 'run-2'),
        makeRunResult(0.7, 'run-3'), // still below 0.85
      ])

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      const state = computeEvolutionState(config, driver)
      expect(state.phase).toBe('B')
      expect(state.currentPassRate).toBe(0.7)
      expect(state.roundsCompleted).toBe(3)
      expect(state.thresholdMet).toBe(false)
    })

    it('returns phase A when threshold is met and enough rounds completed', async () => {
      const config: EvolutionRouteConfig = {
        enabled: true,
        dashboardThreshold: 0.85,
        minRoundsCompleted: 3,
        workspaceRoute: '/workspace',
        dashboardRoute: '/dashboard',
      }
      const driver = new GoalRoundDriver()
      const { evalExec, deltaComp, feedback, decider, toolset } = createMockCollaborators([
        makeRunResult(0.7, 'run-1'),
        makeRunResult(0.8, 'run-2'),
        makeRunResult(0.9, 'run-3'), // >= 0.85 and round 3
      ])

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      const state = computeEvolutionState(config, driver)
      expect(state.phase).toBe('A')
      expect(state.landingRoute).toBe('/dashboard')
      expect(state.currentPassRate).toBe(0.9)
      expect(state.roundsCompleted).toBe(3)
      expect(state.thresholdMet).toBe(true)
    })

    it('uses custom route paths', async () => {
      const config: EvolutionRouteConfig = {
        enabled: true,
        dashboardThreshold: 0.5,
        minRoundsCompleted: 1,
        workspaceRoute: '/custom-workspace',
        dashboardRoute: '/custom-dashboard',
      }
      const driver = new GoalRoundDriver()
      const { evalExec, deltaComp, feedback, decider, toolset } = createMockCollaborators([
        makeRunResult(0.6, 'run-1'),
      ])

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      const state = computeEvolutionState(config, driver)
      expect(state.phase).toBe('A')
      expect(state.landingRoute).toBe('/custom-dashboard')
    })
  })

  describe('shouldEvolve', () => {
    it('returns false when disabled', () => {
      const config: EvolutionRouteConfig = { ...DEFAULT_EVOLUTION_ROUTE_CONFIG, enabled: false }
      const driver = new GoalRoundDriver()
      expect(shouldEvolve(config, driver)).toBe(false)
    })

    it('returns true when conditions are met', async () => {
      const config: EvolutionRouteConfig = {
        enabled: true,
        dashboardThreshold: 0.8,
        minRoundsCompleted: 2,
        workspaceRoute: '/workspace',
        dashboardRoute: '/dashboard',
      }
      const driver = new GoalRoundDriver()
      const { evalExec, deltaComp, feedback, decider, toolset } = createMockCollaborators([
        makeRunResult(0.85, 'run-1'),
        makeRunResult(0.9, 'run-2'),
      ])

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      expect(shouldEvolve(config, driver)).toBe(true)
    })
  })
})
