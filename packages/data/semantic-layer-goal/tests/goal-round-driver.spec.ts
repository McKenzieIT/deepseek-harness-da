/**
 * Unit tests for the GoalRoundDriver state machine.
 *
 * Tests phase transitions, no-progress integration, max-round blocking,
 * reset behavior, and collaborator invocation ordering.
 */

import { describe, it, expect, vi } from 'vitest'
import type { RunResult, RunSummary, DeltaReport } from '../src/eval-runner-types.ts'
import type {
  EvalExecutor,
  DeltaComputer,
  GoalFeedbackSink,
  DecisionMaker,
} from '../src/goal-round-driver.ts'
import { GoalRoundDriver } from '../src/goal-round-driver.ts'
import type { ManagementAgentToolset, EvalEvidence } from '../src/types.ts'
import { createPlaceholderToolset } from '../src/plugin.ts'

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

function makeDeltaReport(runA: string, runB: string): DeltaReport {
  return {
    run_a_id: runA,
    run_b_id: runB,
    flips: [],
    summary: { improved: 0, regressed: 0, unchanged: 100 },
  }
}

function createMockEvalExecutor(results: RunResult[]): EvalExecutor {
  let callIndex = 0
  return {
    async runEval(): Promise<RunResult> {
      const result = results[callIndex]
      if (result === undefined) throw new Error('EvalExecutor: no more results')
      callIndex++
      return result
    },
  }
}

function createMockDeltaComputer(): DeltaComputer {
  return {
    computeDelta(previous: RunResult, current: RunResult): DeltaReport {
      return makeDeltaReport(previous.run_id, current.run_id)
    },
  }
}

function createMockGoalFeedback(): GoalFeedbackSink & {
  evidences: EvalEvidence[]
  blocked: { code: string; message: string }[]
  completed: string[]
} {
  const sink = {
    evidences: [] as EvalEvidence[],
    blocked: [] as { code: string; message: string }[],
    completed: [] as string[],
    async feedEvidence(evidence: EvalEvidence): Promise<void> {
      sink.evidences.push(evidence)
    },
    async blockGoal(reason: { code: string; message: string }): Promise<void> {
      sink.blocked.push(reason)
    },
    async completeGoal(summary: string): Promise<void> {
      sink.completed.push(summary)
    },
  }
  return sink
}

function createMockDecisionMaker(action: { tool: 'diagnose'; target: string } | null = null): DecisionMaker {
  return {
    async decide(_evidence: EvalEvidence, _toolset: ManagementAgentToolset) {
      if (action === null) return null
      return { ...action, success: true, summary: 'mock action' }
    },
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GoalRoundDriver', () => {
  describe('initial state', () => {
    it('starts in idle phase at round 0', () => {
      const driver = new GoalRoundDriver()
      expect(driver.phase).toBe('idle')
      expect(driver.round).toBe(0)
      expect(driver.rounds).toHaveLength(0)
      expect(driver.terminated).toBe(false)
    })
  })

  describe('runRound — single round execution', () => {
    it('completes a single round and transitions through phases', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([makeRunResult(0.6, 'run-1')])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      const roundState = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      expect(driver.phase).toBe('idle')
      expect(driver.round).toBe(1)
      expect(roundState.round).toBe(1)
      expect(roundState.phase).toBe('idle')
      expect(roundState.evalResult?.pass_rate).toBe(0.6)
      expect(roundState.delta).toBeUndefined() // no previous run
      expect(roundState.chosenAction).toBeUndefined()
      expect(roundState.startedAt).toBeGreaterThan(0)
      expect(roundState.endedAt).toBeGreaterThanOrEqual(roundState.startedAt)
    })

    it('feeds evidence to the goal feedback sink', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([makeRunResult(0.7)])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      expect(feedback.evidences).toHaveLength(1)
      expect(feedback.evidences[0]!.round).toBe(1)
      expect(feedback.evidences[0]!.summary.pass_rate).toBe(0.7)
      expect(feedback.evidences[0]!.isProgress).toBe(true)
      expect(feedback.evidences[0]!.noProgressCount).toBe(0)
    })

    it('computes delta on second and subsequent rounds', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5, 'run-1'),
        makeRunResult(0.6, 'run-2'),
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      // Round 1: no delta
      const r1 = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(r1.delta).toBeUndefined()
      expect(feedback.evidences[0]!.delta).toBeUndefined()

      // Round 2: has delta
      const r2 = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(r2.delta).toBeDefined()
      expect(r2.delta!.run_a_id).toBe('run-1')
      expect(r2.delta!.run_b_id).toBe('run-2')
      expect(feedback.evidences[1]!.delta).toBeDefined()
    })

    it('records management action when decision maker returns one', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([makeRunResult(0.5)])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker({ tool: 'diagnose', target: 'asset-1' })
      const toolset = createPlaceholderToolset()

      const roundState = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      expect(roundState.chosenAction).toBeDefined()
      expect(roundState.chosenAction!.tool).toBe('diagnose')
      expect(roundState.chosenAction!.target).toBe('asset-1')
      expect(roundState.chosenAction!.success).toBe(true)
    })
  })

  describe('no-progress detection integration', () => {
    it('blocks after N consecutive rounds with no improvement', async () => {
      const driver = new GoalRoundDriver(
        { maxRounds: 10 },
        { threshold: 3, metric: 'pass_rate', minDelta: 0.0 },
      )
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5, 'run-1'), // baseline
        makeRunResult(0.5, 'run-2'), // no progress 1
        makeRunResult(0.4, 'run-3'), // no progress 2
        makeRunResult(0.5, 'run-4'), // no progress 3 → trigger
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      // Round 1: baseline (counts as progress)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.phase).toBe('idle')
      expect(driver.noProgress.consecutiveNoProgress).toBe(0)

      // Round 2: no improvement
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.phase).toBe('idle')
      expect(driver.noProgress.consecutiveNoProgress).toBe(1)

      // Round 3: regression (still no progress)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.phase).toBe('idle')
      expect(driver.noProgress.consecutiveNoProgress).toBe(2)

      // Round 4: back to baseline but not above it → triggers
      const r4 = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.phase).toBe('blocked')
      expect(driver.terminated).toBe(true)
      expect(r4.phase).toBe('blocked')
      expect(feedback.blocked).toHaveLength(1)
      expect(feedback.blocked[0]!.code).toBe('no-progress')
    })

    it('resets no-progress counter when improvement occurs', async () => {
      const driver = new GoalRoundDriver(
        { maxRounds: 10 },
        { threshold: 3, metric: 'pass_rate', minDelta: 0.0 },
      )
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5, 'run-1'), // baseline
        makeRunResult(0.5, 'run-2'), // no progress 1
        makeRunResult(0.5, 'run-3'), // no progress 2
        makeRunResult(0.7, 'run-4'), // improvement! resets counter
        makeRunResult(0.7, 'run-5'), // no progress 1 again
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // baseline
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // no progress 1
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // no progress 2
      expect(driver.noProgress.consecutiveNoProgress).toBe(2)

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // improvement
      expect(driver.noProgress.consecutiveNoProgress).toBe(0)
      expect(driver.phase).toBe('idle')
      expect(driver.terminated).toBe(false)

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // no progress 1
      expect(driver.noProgress.consecutiveNoProgress).toBe(1)
      expect(driver.phase).toBe('idle')
    })
  })

  describe('max rounds', () => {
    it('blocks when max rounds is reached', async () => {
      const driver = new GoalRoundDriver(
        { maxRounds: 2 },
        { threshold: 10, metric: 'pass_rate', minDelta: 0.0 },
      )
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5, 'run-1'),
        makeRunResult(0.6, 'run-2'),
        makeRunResult(0.7, 'run-3'), // should not be reached
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // round 1
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset) // round 2

      // Round 3 attempt: should block immediately
      const r3 = await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(r3.phase).toBe('blocked')
      expect(driver.terminated).toBe(true)
      expect(feedback.blocked).toHaveLength(1)
      expect(feedback.blocked[0]!.code).toBe('round-limit')
    })

    it('throws when attempting to run after terminal state', async () => {
      const driver = new GoalRoundDriver({ maxRounds: 1 })
      const evalExec = createMockEvalExecutor([makeRunResult(0.5)])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      // After round 1, try round 2 which hits max
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.terminated).toBe(true)

      // Now it should throw
      await expect(
        driver.runRound(evalExec, deltaComp, feedback, decider, toolset),
      ).rejects.toThrow('cannot run round in terminal phase')
    })
  })

  describe('reset', () => {
    it('full reset returns to initial state', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([makeRunResult(0.5)])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.round).toBe(1)

      driver.reset(false)
      expect(driver.phase).toBe('idle')
      expect(driver.round).toBe(0)
      expect(driver.rounds).toHaveLength(0)
      expect(driver.noProgress.consecutiveNoProgress).toBe(0)
      expect(driver.noProgress.lastProgressValue).toBeUndefined()
      expect(driver.terminated).toBe(false)
    })

    it('preserveBaseline keeps rounds history and high-water mark', async () => {
      const driver = new GoalRoundDriver(
        { maxRounds: 10 },
        { threshold: 3, metric: 'pass_rate', minDelta: 0.0 },
      )
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5),
        makeRunResult(0.5),
        makeRunResult(0.5),
        makeRunResult(0.5), // triggers
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      expect(driver.terminated).toBe(true)

      driver.reset(true)
      expect(driver.phase).toBe('idle')
      expect(driver.round).toBe(0)
      expect(driver.terminated).toBe(false)
      expect(driver.noProgress.lastProgressValue).toBe(0.5) // preserved
      expect(driver.noProgress.consecutiveNoProgress).toBe(0) // cleared
    })
  })

  describe('rounds history', () => {
    it('accumulates round states in order', async () => {
      const driver = new GoalRoundDriver()
      const evalExec = createMockEvalExecutor([
        makeRunResult(0.5, 'run-1'),
        makeRunResult(0.6, 'run-2'),
        makeRunResult(0.7, 'run-3'),
      ])
      const deltaComp = createMockDeltaComputer()
      const feedback = createMockGoalFeedback()
      const decider = createMockDecisionMaker(null)
      const toolset = createPlaceholderToolset()

      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)
      await driver.runRound(evalExec, deltaComp, feedback, decider, toolset)

      expect(driver.rounds).toHaveLength(3)
      expect(driver.rounds[0]!.round).toBe(1)
      expect(driver.rounds[1]!.round).toBe(2)
      expect(driver.rounds[2]!.round).toBe(3)
      expect(driver.rounds[0]!.evalResult?.pass_rate).toBe(0.5)
      expect(driver.rounds[1]!.evalResult?.pass_rate).toBe(0.6)
      expect(driver.rounds[2]!.evalResult?.pass_rate).toBe(0.7)
    })
  })
})
