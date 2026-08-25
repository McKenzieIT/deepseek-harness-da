/**
 * GoalRoundDriver — orchestrates the autonomous goal loop:
 *   run eval → compute delta → feed back to goal context → decide next action.
 *
 * This is the state machine skeleton. The actual management agent preset and
 * tool implementations are TBD (gate-③). The driver manages the phase
 * transitions and integrates the NoProgressDetector.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/goal-round-driver
 */

import type { RunResult, RunSummary, DeltaReport } from './eval-runner-types.ts'
import type {
  GoalRoundDriverConfig,
  ManagementAction,
  ManagementAgentToolset,
  NoProgressDetectorConfig,
  RoundPhase,
  RoundState,
  EvalEvidence,
} from './types.ts'
import { DEFAULT_GOAL_ROUND_DRIVER_CONFIG, DEFAULT_NO_PROGRESS_CONFIG } from './types.ts'
import {
  detectProgress,
  resetDetector,
  shouldBlock,
  blockReason,
  INITIAL_NO_PROGRESS_STATE,
} from './no-progress-detector.ts'
import type { NoProgressState } from './no-progress-detector.ts'

// ─── Collaborator Interfaces ───────────────────────────────────────────────────

/**
 * Abstract eval executor: the driver calls this to run eval rounds.
 * Wired to the real eval runner when gate-③ activates.
 */
export interface EvalExecutor {
  /** Run a full eval batch and return the result. */
  runEval(): Promise<RunResult>
}

/**
 * Abstract delta computer: compares two runs.
 * Wired to the real compareDelta when gate-③ activates.
 */
export interface DeltaComputer {
  /** Compute delta between the previous run and the current run. */
  computeDelta(previous: RunResult, current: RunResult): DeltaReport
}

/**
 * Abstract goal feedback sink: receives eval evidence to feed into the goal.
 * Wired to the goal service when gate-③ activates.
 */
export interface GoalFeedbackSink {
  /** Feed eval evidence into the goal system. */
  feedEvidence(evidence: EvalEvidence): Promise<void>
  /** Block the goal with a reason. */
  blockGoal(reason: { code: string; message: string }): Promise<void>
  /** Complete the goal. */
  completeGoal(summary: string): Promise<void>
}

/**
 * Abstract decision maker: the management agent decides what to do next.
 * Placeholder interface — the real management agent preset is TBD.
 */
export interface DecisionMaker {
  /** Given the current state and evidence, decide what action to take. */
  decide(evidence: EvalEvidence, toolset: ManagementAgentToolset): Promise<ManagementAction | null>
}

// ─── Driver State Machine ──────────────────────────────────────────────────────

/**
 * Internal mutable state of the GoalRoundDriver.
 */
export interface DriverInternalState {
  phase: RoundPhase
  round: number
  previousRun: RunResult | undefined
  currentRun: RunResult | undefined
  noProgressState: NoProgressState
  rounds: RoundState[]
  startedAt: number | undefined
}

/** Create fresh internal state. */
export function createInitialDriverState(): DriverInternalState {
  return {
    phase: 'idle',
    round: 0,
    previousRun: undefined,
    currentRun: undefined,
    noProgressState: INITIAL_NO_PROGRESS_STATE,
    rounds: [],
    startedAt: undefined,
  }
}

/**
 * GoalRoundDriver: the state machine that orchestrates autonomous goal rounds.
 *
 * Lifecycle:
 *   1. `start()` — begins the loop from idle
 *   2. Each iteration: runEval → computeDelta → feedGoal → decide → act
 *   3. Terminates when: goal complete, no-progress blocked, or max rounds hit
 *
 * This class manages transitions and delegates actual work to collaborators.
 */
export class GoalRoundDriver {
  private readonly config: GoalRoundDriverConfig
  private readonly noProgressConfig: NoProgressDetectorConfig
  private state: DriverInternalState

  constructor(
    config: Partial<GoalRoundDriverConfig> = {},
    noProgressConfig: Partial<NoProgressDetectorConfig> = {},
  ) {
    this.config = { ...DEFAULT_GOAL_ROUND_DRIVER_CONFIG, ...config }
    this.noProgressConfig = { ...DEFAULT_NO_PROGRESS_CONFIG, ...noProgressConfig }
    this.state = createInitialDriverState()
  }

  // ─── Getters (observable state) ────────────────────────────────────────────

  /** Current phase of the driver. */
  get phase(): RoundPhase { return this.state.phase }

  /** Current round number (0 if idle). */
  get round(): number { return this.state.round }

  /** All recorded round states. */
  get rounds(): readonly RoundState[] { return this.state.rounds }

  /** Current no-progress detector state. */
  get noProgress(): NoProgressState { return this.state.noProgressState }

  /** Whether the driver has terminated (blocked or complete). */
  get terminated(): boolean {
    return this.state.phase === 'blocked' || this.state.phase === 'complete'
  }

  // ─── State Machine Transitions ─────────────────────────────────────────────

  /**
   * Run one full round of the goal loop.
   *
   * Returns the round state after completion. Throws if the driver is in
   * a terminal state.
   */
  async runRound(
    evalExecutor: EvalExecutor,
    deltaComputer: DeltaComputer,
    goalFeedback: GoalFeedbackSink,
    decisionMaker: DecisionMaker,
    toolset: ManagementAgentToolset,
  ): Promise<RoundState> {
    if (this.terminated) {
      throw new Error(`GoalRoundDriver: cannot run round in terminal phase "${this.state.phase}"`)
    }

    if (this.state.round >= this.config.maxRounds) {
      this.state.phase = 'blocked'
      const reason = {
        code: 'round-limit',
        message: `Reached maximum of ${this.config.maxRounds} goal rounds without achieving target.`,
      }
      await goalFeedback.blockGoal(reason)
      return this.recordRound('blocked')
    }

    // Advance round counter
    this.state.round++
    const roundStartedAt = Date.now()
    this.state.startedAt = roundStartedAt

    // Phase 1: Run eval
    this.state.phase = 'running_eval'
    const runResult = await evalExecutor.runEval()
    this.state.previousRun = this.state.currentRun
    this.state.currentRun = runResult

    // Phase 2: Compute delta
    this.state.phase = 'computing_delta'
    let delta: DeltaReport | undefined
    if (this.state.previousRun !== undefined) {
      delta = deltaComputer.computeDelta(this.state.previousRun, runResult)
    }

    // Phase 3: Feed evidence to goal + check no-progress
    const newNoProgressState = detectProgress(
      this.state.noProgressState,
      runResult.summary,
      this.noProgressConfig,
    )
    this.state.noProgressState = newNoProgressState

    const evidence: EvalEvidence = {
      runId: runResult.run_id,
      summary: runResult.summary,
      ...(delta !== undefined ? { delta } : {}),
      round: this.state.round,
      isProgress: !shouldBlock(newNoProgressState) && newNoProgressState.consecutiveNoProgress === 0,
      noProgressCount: newNoProgressState.consecutiveNoProgress,
    }

    await goalFeedback.feedEvidence(evidence)

    // Check no-progress threshold
    if (shouldBlock(newNoProgressState)) {
      this.state.phase = 'blocked'
      const reason = blockReason(newNoProgressState, this.noProgressConfig)
      await goalFeedback.blockGoal(reason)
      return this.recordRound('blocked', runResult.summary, delta)
    }

    // Check if goal is achieved (configurable target — for now, use threshold from driver config)
    // The target is implicitly "pass_rate >= 1.0 or user-defined" — placeholder for gate-③.

    // Phase 4: Decide next action
    this.state.phase = 'deciding'
    const action = await decisionMaker.decide(evidence, toolset)

    // Phase 5: Act (if the management agent chose an action)
    if (action !== null) {
      this.state.phase = 'acting'
      // Action execution is handled by the decisionMaker internally via the toolset.
      // We just record the result.
    }

    // Return to idle for next round
    this.state.phase = 'idle'
    return this.recordRound('idle', runResult.summary, delta, action ?? undefined)
  }

  /**
   * Reset the driver state. Used when unblocking or restarting.
   */
  reset(preserveBaseline: boolean = false): void {
    this.state.phase = 'idle'
    this.state.round = 0
    this.state.noProgressState = resetDetector(this.state.noProgressState, preserveBaseline)
    if (!preserveBaseline) {
      this.state.previousRun = undefined
      this.state.currentRun = undefined
      this.state.rounds = []
    }
    this.state.startedAt = undefined
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private recordRound(
    phase: RoundPhase,
    evalResult?: RunSummary,
    delta?: DeltaReport,
    chosenAction?: ManagementAction,
  ): RoundState {
    const roundState: RoundState = {
      phase,
      round: this.state.round,
      ...(evalResult !== undefined ? { evalResult } : {}),
      ...(delta !== undefined ? { delta } : {}),
      ...(chosenAction !== undefined ? { chosenAction } : {}),
      startedAt: this.state.startedAt ?? Date.now(),
      endedAt: Date.now(),
    }
    this.state.rounds.push(roundState)
    return roundState
  }
}
