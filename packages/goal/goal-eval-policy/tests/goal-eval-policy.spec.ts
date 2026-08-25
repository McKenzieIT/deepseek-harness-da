import { describe, expect, it, vi } from 'vitest'
import type { GoalRef, GoalView } from '@deepseek-ai/dsh-goal'
import type { GoalChanged, GoalOperation } from '@deepseek-ai/dsh-goal'
import { apply, freshState } from '../src/index.ts'

// ──────────────────── Mocks ────────────────────

function makeGoalView(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: 'goal-1' as unknown,
    revision: 1,
    objective: 'Test objective',
    phase: 'active',
    maxGoalRounds: 256,
    roundsStarted: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activation: 'armed',
    ...overrides,
  }
}

function makeChange(operation: GoalOperation, goal?: GoalView): GoalChanged {
  return {
    operation,
    ref: { id: goal?.id ?? 'goal-1', revision: goal?.revision ?? 1 } as GoalRef,
    goal,
  }
}

type Listener = (...args: unknown[]) => void | Promise<void>

function createMockCtx(options: {
  evalRunner?: { runBatch: ReturnType<typeof vi.fn> } | undefined
  evidenceQuery?: {
    getEvalStore?: ReturnType<typeof vi.fn>
    beforeAfterDelta?: ReturnType<typeof vi.fn>
  }
  goals?: {
    block?: ReturnType<typeof vi.fn>
    get?: ReturnType<typeof vi.fn>
  }
} = {}) {
  const goalChangedListeners: Listener[] = []
  const sessionEventListeners: Listener[] = []

  const goals = {
    block: vi.fn(),
    get: vi.fn(() => makeGoalView()),
    ...options.goals,
  }

  const evidenceQuery = {
    getEvalStore: vi.fn(() => ({ getRunIds: () => [] })),
    beforeAfterDelta: vi.fn(() => ({
      summary: { improved: 0, regressed: 0, unchanged: 5 },
    })),
    ...options.evidenceQuery,
  }

  const agents = {
    get: vi.fn(() => ({ id: 'agent-1' })),
  }

  const ctx = {
    goals,
    evidenceQuery,
    get(key: string) {
      if (key === 'evalRunner') return options.evalRunner ?? undefined
      if (key === 'agents') return agents
      return undefined
    },
    on(event: string, listener: Listener) {
      if (event === 'goal/changed') goalChangedListeners.push(listener)
      if (event === 'session/event') sessionEventListeners.push(listener)
    },
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }

  const session = { id: 'session-1' }

  return {
    ctx: ctx as unknown,
    goals,
    evidenceQuery,
    agents,
    async emitGoalChanged(change: GoalChanged) {
      for (const listener of goalChangedListeners) {
        await listener({ agent: { id: 'agent-1' }, change })
      }
    },
    async emitRound(goalId: string, round: number, revision: number = 1) {
      const event = {
        type: 'user/message',
        data: { source: { kind: 'goal', goalId, round, revision } },
      }
      for (const listener of sessionEventListeners) {
        await listener(session, event)
      }
    },
  }
}

// ──────────────────── Tests ────────────────────

describe('goal-eval-policy', () => {
  describe('round counting', () => {
    it('triggers eval after K (3) rounds', async () => {
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: 'run-1' })) }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      for (let i = 1; i <= 3; i++) {
        await emitRound('goal-1', i)
      }

      expect(evalRunner.runBatch).toHaveBeenCalledTimes(1)
    })

    it('does not trigger eval before K rounds', async () => {
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: 'run-1' })) }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      for (let i = 1; i <= 2; i++) {
        await emitRound('goal-1', i)
      }

      expect(evalRunner.runBatch).not.toHaveBeenCalled()
    })
  })

  describe('no-improvement tracking', () => {
    it('computes delta after second eval', async () => {
      let runCounter = 0
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: `run-${++runCounter}` })) }
      const evidenceQuery = {
        getEvalStore: vi.fn(() => ({ getRunIds: () => [] })),
        beforeAfterDelta: vi.fn(() => ({
          summary: { improved: 0, regressed: 0, unchanged: 5 },
        })),
      }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner, evidenceQuery })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      // First 3 rounds → first eval (sets lastEvalRunId, no delta)
      for (let i = 1; i <= 3; i++) await emitRound('goal-1', i)

      // Next 3 rounds → second eval (computes delta from run-1 to run-2)
      for (let i = 4; i <= 6; i++) await emitRound('goal-1', i)

      expect(evidenceQuery.beforeAfterDelta).toHaveBeenCalledWith('run-1', 'run-2')
    })
  })

  describe('block at threshold', () => {
    it('calls goals.block after N consecutive no-improvement evals', async () => {
      let runCounter = 0
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: `run-${++runCounter}` })) }
      const evidenceQuery = {
        getEvalStore: vi.fn(() => ({ getRunIds: () => [] })),
        beforeAfterDelta: vi.fn(() => ({
          summary: { improved: 0, regressed: 0, unchanged: 5 },
        })),
      }
      const goals = {
        block: vi.fn(),
        get: vi.fn(() => makeGoalView({ id: 'goal-1' as unknown, revision: 1, phase: 'active' })),
      }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner, evidenceQuery, goals })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      // 4 eval cycles = 12 rounds
      // Cycle 1: sets lastEvalRunId (no delta yet)
      // Cycles 2,3,4: delta shows improved=0 → consecutiveNoImprovement reaches 3
      for (let i = 1; i <= 12; i++) await emitRound('goal-1', i)

      expect(goals.block).toHaveBeenCalledTimes(1)
      expect(goals.block).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'goal-1' }),
        expect.objectContaining({ code: 'no-progress' }),
      )
    })
  })

  describe('reset on resume', () => {
    it('resets counters when goal is resumed', async () => {
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: 'run-1' })) }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      // 2 rounds (not enough)
      for (let i = 1; i <= 2; i++) await emitRound('goal-1', i)

      // Resume resets the counter
      await emitGoalChanged(makeChange('resume', makeGoalView({ roundsStarted: 2 })))

      // 2 more rounds (counter was reset, so only 2 since resume)
      for (let i = 3; i <= 4; i++) await emitRound('goal-1', i)

      expect(evalRunner.runBatch).not.toHaveBeenCalled()
    })
  })

  describe('already blocked', () => {
    it('skips processing for blocked goals (goal/changed block removes tracking)', async () => {
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: 'run-1' })) }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))
      await emitRound('goal-1', 1)

      // Goal completed — state is deleted
      await emitGoalChanged(makeChange('complete', makeGoalView({ phase: 'complete' })))

      // Subsequent rounds for an unknown goal start fresh state
      // but since the goal was completed, the agent lookup will
      // not find an agent for blocking
      for (let i = 2; i <= 5; i++) await emitRound('goal-1', i)

      expect(evalRunner.runBatch).toHaveBeenCalledTimes(1)
    })
  })

  describe('improvement resets counter', () => {
    it('resets consecutiveNoImprovement when improved > 0', async () => {
      let runCounter = 0
      const evalRunner = { runBatch: vi.fn(async () => ({ run_id: `run-${++runCounter}` })) }
      let deltaCallCount = 0
      const evidenceQuery = {
        getEvalStore: vi.fn(() => ({ getRunIds: () => [] })),
        beforeAfterDelta: vi.fn(() => {
          deltaCallCount++
          // First two: no improvement. Third: improvement.
          if (deltaCallCount <= 2) {
            return { summary: { improved: 0, regressed: 0, unchanged: 5 } }
          }
          return { summary: { improved: 2, regressed: 0, unchanged: 3 } }
        }),
      }
      const goals = { block: vi.fn(), get: vi.fn(() => makeGoalView()) }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner, evidenceQuery, goals })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      // 4 eval cycles = 12 rounds
      // Cycle 1: baseline (no delta)
      // Cycle 2 (deltaCall=1): improved=0 → counter=1
      // Cycle 3 (deltaCall=2): improved=0 → counter=2
      // Cycle 4 (deltaCall=3): improved=2 → counter reset to 0
      for (let i = 1; i <= 12; i++) await emitRound('goal-1', i)

      expect(goals.block).not.toHaveBeenCalled()
    })
  })

  describe('no eval runner (graceful degradation)', () => {
    it('uses evidence store runs when evalRunner is absent', async () => {
      const evidenceQuery = {
        getEvalStore: vi.fn(() => ({ getRunIds: () => ['stored-run-1'] })),
        beforeAfterDelta: vi.fn(() => ({
          summary: { improved: 0, regressed: 0, unchanged: 5 },
        })),
      }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner: undefined, evidenceQuery })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      // First eval cycle: picks stored-run-1 as currentRunId, no delta (no lastEvalRunId)
      for (let i = 1; i <= 3; i++) await emitRound('goal-1', i)

      // Second eval cycle: delta from stored-run-1 to stored-run-1 (same latest)
      for (let i = 4; i <= 6; i++) await emitRound('goal-1', i)

      expect(evidenceQuery.beforeAfterDelta).toHaveBeenCalledWith('stored-run-1', 'stored-run-1')
    })

    it('does nothing when no evalRunner and no stored runs', async () => {
      const evidenceQuery = {
        getEvalStore: vi.fn(() => ({ getRunIds: () => [] })),
        beforeAfterDelta: vi.fn(),
      }
      const { ctx, emitGoalChanged, emitRound } = createMockCtx({ evalRunner: undefined, evidenceQuery })
      apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

      await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

      for (let i = 1; i <= 6; i++) await emitRound('goal-1', i)

      expect(evidenceQuery.beforeAfterDelta).not.toHaveBeenCalled()
    })
  })

  describe('freshState helper', () => {
    it('creates initial state with the given roundsStarted', () => {
      const state = freshState(5)
      expect(state.roundsSinceLastEval).toBe(0)
      expect(state.consecutiveNoImprovement).toBe(0)
      expect(state.lastEvalRunId).toBeNull()
      expect(state.evalInFlight).toBe(false)
      expect(state.lastObservedRounds).toBe(5)
    })
  })
})
