/**
 * Goal-eval-policy: no-progress backstop for the autonomous goal loop.
 *
 * Counts admitted goal rounds. Every K rounds (default 3), triggers an eval
 * run. Checks the eval delta — if `improved === 0` (no cases flipped to
 * correct), counts as "no improvement". After N consecutive no-improvement
 * evals (default 3), force-blocks the goal with code `'no-progress'`.
 *
 * @module @deepseek-ai/dsh-goal-eval-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { GoalRef } from '@deepseek-ai/dsh-goal'
import type {} from '@deepseek-ai/dsh-evidence-query'
import type {} from '@deepseek-ai/dsh-session'

export const name = 'goal-eval-policy'
export const inject = ['goals', 'evidenceQuery']
export const optional = ['evalRunner']

/** Plugin configuration. */
export interface Config {
  /** Every K admitted rounds, trigger an eval run. */
  goalEvalIntervalRounds: number
  /** Block goal after N consecutive no-improvement evals. */
  noProgressThreshold: number
}

export const Config: z<Config> = z.object({
  goalEvalIntervalRounds: z.number().default(3),
  noProgressThreshold: z.number().default(3),
})

/**
 * Subset of EvalRunnerService used by this policy plugin.
 * Full interface lives in @deepseek-ai/dsh-tool-trigger-eval.
 */
interface EvalRunnerSeam {
  runBatch(options?: { runId?: string; skipHealthGate?: boolean }): Promise<{ run_id: string }>
}

/** Per-goal state tracking. */
export interface GoalEvalState {
  roundsSinceLastEval: number
  consecutiveNoImprovement: number
  lastEvalRunId: string | null
  evalInFlight: boolean
  /** Track observed roundsStarted to detect increments. */
  lastObservedRounds: number
}

export function freshState(roundsStarted: number): GoalEvalState {
  return {
    roundsSinceLastEval: 0,
    consecutiveNoImprovement: 0,
    lastEvalRunId: null,
    evalInFlight: false,
    lastObservedRounds: roundsStarted,
  }
}

export function apply(ctx: Context, config: Config): void {
  const { goalEvalIntervalRounds: K, noProgressThreshold: N } = config
  const states = new Map<string, GoalEvalState>()

  // Track goal lifecycle: reset on create/resume, clean up on clear/complete
  ctx.on('goal/changed', ({ change }) => {
    const { operation, ref, goal } = change

    if (operation === 'create' || operation === 'resume') {
      states.set(ref.id, freshState(goal?.roundsStarted ?? 0))
      return
    }

    if (operation === 'clear' || operation === 'complete') {
      states.delete(ref.id)
      return
    }
  })

  // Count rounds via session events (roundsStarted increments on user/message
  // with goal source, not on goal/changed — see fold.ts)
  ctx.on('session/event', async (session, event) => {
    if (event.type !== 'user/message') return
    const data = event.data as { source?: { kind?: string; goalId?: string; round?: number; revision?: number } }
    const source = data.source
    if (source?.kind !== 'goal' || typeof source.round !== 'number' || source.round <= 0) return

    const goalId = source.goalId
    if (goalId === undefined) return

    let state = states.get(goalId)
    if (state === undefined) {
      state = freshState(source.round - 1)
      states.set(goalId, state)
    }

    // Detect round increment
    if (source.round <= state.lastObservedRounds) return
    state.lastObservedRounds = source.round
    state.roundsSinceLastEval++

    // Check if we've accumulated K rounds since last eval
    if (state.roundsSinceLastEval < K) return

    // Prevent overlapping evals
    if (state.evalInFlight) return
    state.evalInFlight = true

    // Resolve the agent for this session to call goals.block() if needed
    // oxlint-disable-next-line typescript/no-explicit-any -- framework boundary: agents.get expects SessionId
    const agent = ctx.get('agents')?.get(session.id as any) as any
    if (!agent) {
      state.evalInFlight = false
      return
    }

    const ref = { id: goalId, revision: source.revision ?? 0 } as GoalRef

    try {
      await runEvalCheck(ctx, agent, ref, state, N)
    } finally {
      state.evalInFlight = false
    }
  })
}

/**
 * Trigger an eval run, compute the delta, and possibly block the goal.
 */
async function runEvalCheck(
  ctx: Context,
  agent: unknown,
  ref: GoalRef,
  state: GoalEvalState,
  threshold: number,
): Promise<void> {
  state.roundsSinceLastEval = 0

  const evalRunner = ctx.get('evalRunner') as EvalRunnerSeam | undefined
  const evidenceQuery = ctx.evidenceQuery

  let currentRunId: string | null = null

  // Attempt to trigger a fresh eval run
  if (evalRunner) {
    try {
      const result = await evalRunner.runBatch()
      currentRunId = result.run_id
    } catch (error: unknown) {
      ctx.logger.warn(`goal-eval-policy: eval run failed for goal "${ref.id}": ${error instanceof Error ? error.message : String(error)}`)
      return
    }
  } else {
    // No eval runner: try to get latest run from evidence store
    const runIds = evidenceQuery.getEvalStore().getRunIds()
    if (runIds.length === 0) return
    currentRunId = runIds[runIds.length - 1] ?? ''
  }

  if (currentRunId === null) return

  // Compute delta if we have a previous run
  if (state.lastEvalRunId !== null) {
    let delta: { summary: { improved: number; regressed: number; unchanged: number } }
    try {
      delta = evidenceQuery.beforeAfterDelta(state.lastEvalRunId, currentRunId)
    } catch (error: unknown) {
      ctx.logger.warn(`goal-eval-policy: delta computation failed for goal "${ref.id}": ${error instanceof Error ? error.message : String(error)}`)
      state.lastEvalRunId = currentRunId
      return
    }

    if (delta.summary.improved === 0) {
      state.consecutiveNoImprovement++
    } else {
      // Improvement detected — reset counter
      state.consecutiveNoImprovement = 0
    }

    // Check threshold
    if (state.consecutiveNoImprovement >= threshold) {
      // Verify the goal is still active before blocking
      // oxlint-disable-next-line typescript/no-explicit-any -- GoalService.get/block expect Agent
      const currentGoal = ctx.goals.get(agent as any)
      if (currentGoal && currentGoal.id === ref.id && currentGoal.phase === 'active') {
        // oxlint-disable-next-line typescript/no-explicit-any -- GoalService.block expects Agent
        ctx.goals.block(agent as any, { id: ref.id, revision: currentGoal.revision }, {
          code: 'no-progress',
          message: `Goal blocked: ${state.consecutiveNoImprovement} consecutive eval runs showed no improvement (0 cases flipped to correct).`,
        })
      }
      state.lastEvalRunId = currentRunId
      return
    }
  }

  state.lastEvalRunId = currentRunId
}
