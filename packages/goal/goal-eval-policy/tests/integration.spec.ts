import { describe, expect, it, vi } from 'vitest'
import { type GoalRef, type GoalView, type GoalChanged, type GoalOperation, GoalId } from '@deepseek-ai/dsh-goal'
import type { Context } from '@deepseek-ai/cordis'
import type { EvalDeltaReport } from '@deepseek-ai/dsh-evidence-query'
import { EvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import { apply } from '../src/index.ts'

// ──────────────────── Helpers ────────────────────

function makeGoalView(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: GoalId('goal-1'),
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
    ...(goal !== undefined ? { goal } : {}),
  }
}

type Listener = (...args: unknown[]) => void | Promise<void>

/**
 * Integration harness: wires the REAL goal-eval-policy plugin to a REAL
 * in-memory EvalResultStore (from @deepseek-ai/dsh-evidence-query) via a
 * lightweight ctx shim that maintains listener arrays for `goal/changed`
 * and `session/event` events.
 *
 * Services that require external systems are vi.fn stubs for call tracking:
 *  - evalRunner.runBatch()  (no real eval engine)
 *  - goals.block()          (no real goal service)
 *  - goals.get()            (returns a stub active goal)
 *  - agents.get()           (returns a stub agent handle)
 *
 * The EvalResultStore and its getRunIds() / getByRunId() methods are real —
 * not mocked. This tests the plugin's correct interaction with the store's
 * API surface (especially the no-evalRunner graceful-degradation path).
 */
function createIntegrationHarness(options: {
  evalRunner?: { runBatch: ReturnType<typeof vi.fn> } | undefined
  beforeAfterDeltaImpl?: (runIdA: string, runIdB: string) => EvalDeltaReport
  goals?: { block?: ReturnType<typeof vi.fn>; get?: ReturnType<typeof vi.fn> }
} = {}) {
  // REAL in-memory eval result store — not mocked
  const store = new EvalResultStore()

  const goalChangedListeners: Listener[] = []
  const sessionEventListeners: Listener[] = []

  const goals = {
    block: vi.fn(),
    get: vi.fn(() => makeGoalView()),
    ...options.goals,
  }

  const evidenceQuery = {
    // Returns the REAL store instance — plugin calls getRunIds() on it
    getEvalStore: () => store,
    // Stubbed delta — controlled return values for specific scenarios
    beforeAfterDelta: vi.fn(options.beforeAfterDeltaImpl ?? (() => ({
      summary: { improved: 0, regressed: 0, unchanged: 5 },
    }))) as (runIdA: string, runIdB: string) => EvalDeltaReport,
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
    ctx: ctx as unknown as Context,
    goals,
    evidenceQuery,
    agents,
    store,
    emitGoalChanged: async (change: GoalChanged) => {
      for (const listener of goalChangedListeners) {
        await listener({ agent: { id: 'agent-1' }, change })
      }
    },
    emitRound: async (goalId: string, round: number, revision: number = 1) => {
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

// ──────────────────── Integration Tests ────────────────────

describe('goal-eval-policy integration (real EvalResultStore)', () => {
  it('goal create → 3 rounds → eval triggered', async () => {
    const evalRunner = { runBatch: vi.fn(async () => ({ run_id: 'run-1' })) }
    const { ctx, evidenceQuery, store, goals, emitGoalChanged, emitRound } = createIntegrationHarness({
      evalRunner,
    })
    apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

    // Goal create — resets per-goal state
    await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

    // 3 admitted rounds → triggers first eval cycle
    for (let i = 1; i <= 3; i++) {
      await emitRound('goal-1', i)
    }

    // evalRunner.runBatch was called exactly once
    expect(evalRunner.runBatch).toHaveBeenCalledTimes(1)

    // First eval sets baseline (lastEvalRunId) — no previous run to compare,
    // so beforeAfterDelta is NOT called yet
    expect(evidenceQuery.beforeAfterDelta).not.toHaveBeenCalled()

    // Real store is empty (evalRunner doesn't write to it)
    expect(store.getRunIds()).toEqual([])

    // Goal was not blocked (only one eval, no delta)
    expect(goals.block).not.toHaveBeenCalled()
  })

  it('3 consecutive no-improvement evals → goal blocked with code "no-progress"', async () => {
    let runCounter = 0
    const evalRunner = { runBatch: vi.fn(async () => ({ run_id: `run-${++runCounter}` })) }
    // Stub delta: always no improvement (improved=0)
    const beforeAfterDeltaImpl = (): EvalDeltaReport => ({
      runIdA: 'prev',
      runIdB: 'curr',
      flipped: [],
      summary: { improved: 0, regressed: 0, unchanged: 5 },
    })
    const goals = {
      block: vi.fn(),
      get: vi.fn(() => makeGoalView({ id: GoalId('goal-1'), revision: 1, phase: 'active' })),
    }
    const { ctx, evidenceQuery, emitGoalChanged, emitRound } = createIntegrationHarness({
      evalRunner,
      beforeAfterDeltaImpl,
      goals,
    })
    apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

    await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

    // 4 eval cycles = 12 rounds (K=3 rounds per cycle)
    // Cycle 1 (rounds 1-3):  runBatch → run-1. lastEvalRunId=null → no delta. Sets baseline.
    // Cycle 2 (rounds 4-6):  runBatch → run-2. delta(run-1, run-2) → improved=0 → counter=1
    // Cycle 3 (rounds 7-9):  runBatch → run-3. delta(run-2, run-3) → improved=0 → counter=2
    // Cycle 4 (rounds 10-12): runBatch → run-4. delta(run-3, run-4) → improved=0 → counter=3 → BLOCK
    for (let i = 1; i <= 12; i++) await emitRound('goal-1', i)

    // goals.block called once with code='no-progress'
    expect(goals.block).toHaveBeenCalledTimes(1)
    expect(goals.block).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'goal-1' }),
      expect.objectContaining({ code: 'no-progress' }),
    )

    // Real beforeAfterDelta was called 3 times (cycles 2, 3, 4 — not cycle 1)
    expect(evidenceQuery.beforeAfterDelta).toHaveBeenCalledTimes(3)
  })

  it('improvement on 3rd delta resets counter, preventing block', async () => {
    let runCounter = 0
    const evalRunner = { runBatch: vi.fn(async () => ({ run_id: `run-${++runCounter}` })) }
    let deltaCallCount = 0
    // First two deltas: no improvement. Third delta: improvement detected.
    const beforeAfterDeltaImpl = (): EvalDeltaReport => {
      deltaCallCount++
      if (deltaCallCount <= 2) {
        return {
          runIdA: 'prev',
          runIdB: 'curr',
          flipped: [],
          summary: { improved: 0, regressed: 0, unchanged: 5 },
        }
      }
      return {
        runIdA: 'prev',
        runIdB: 'curr',
        flipped: [{ caseId: 'c1', before: 'fail', after: 'pass' }],
        summary: { improved: 2, regressed: 0, unchanged: 3 },
      }
    }
    const goals = {
      block: vi.fn(),
      get: vi.fn(() => makeGoalView()),
    }
    const { ctx, emitGoalChanged, emitRound } = createIntegrationHarness({
      evalRunner,
      beforeAfterDeltaImpl,
      goals,
    })
    apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

    await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

    // 4 eval cycles = 12 rounds
    // Cycle 1: baseline (no delta)
    // Cycle 2 (delta 1): improved=0 → counter=1
    // Cycle 3 (delta 2): improved=0 → counter=2
    // Cycle 4 (delta 3): improved=2 → counter RESET to 0
    for (let i = 1; i <= 12; i++) await emitRound('goal-1', i)

    // Counter was reset by improvement — goal NOT blocked
    expect(goals.block).not.toHaveBeenCalled()
  })

  it('no evalRunner + empty EvalResultStore → no delta, no block', async () => {
    // No evalRunner — ctx.get('evalRunner') returns undefined
    // Real EvalResultStore is empty — getRunIds() returns []
    const { ctx, evidenceQuery, goals, store, emitGoalChanged, emitRound } = createIntegrationHarness({})
    apply(ctx, { goalEvalIntervalRounds: 3, noProgressThreshold: 3 })

    await emitGoalChanged(makeChange('create', makeGoalView({ roundsStarted: 0 })))

    // 4 eval cycles = 12 rounds, but each cycle:
    // - no evalRunner → plugin falls to else branch
    // - real store.getRunIds() returns [] (empty real store)
    // - runIds.length === 0 → return (no currentRunId)
    for (let i = 1; i <= 12; i++) await emitRound('goal-1', i)

    // Real store confirms empty — getRunIds() is a real method call
    expect(store.getRunIds()).toEqual([])

    // beforeAfterDelta never called (no runs to compare)
    expect(evidenceQuery.beforeAfterDelta).not.toHaveBeenCalled()

    // goals.block never called
    expect(goals.block).not.toHaveBeenCalled()
  })
})
