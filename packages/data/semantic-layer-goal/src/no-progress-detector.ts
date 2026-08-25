/**
 * NoProgressDetector — tracks consecutive rounds with no improvement and
 * signals when the goal should be blocked.
 *
 * This is pure, deterministic logic with no I/O dependencies. It receives
 * RunSummary snapshots and answers "has there been progress?" based on the
 * configured metric and threshold.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/no-progress-detector
 */

import type { RunSummary } from './eval-runner-types.ts'
import type { NoProgressDetectorConfig, ProgressMetric } from './types.ts'
import { DEFAULT_NO_PROGRESS_CONFIG } from './types.ts'

/**
 * Extract the tracked metric value from a RunSummary.
 */
function extractMetric(summary: RunSummary, metric: ProgressMetric): number {
  switch (metric) {
    case 'pass_rate':
      return summary.pass_rate
    case 'correct_count':
      return summary.correct
    case 'regression_count':
      // For regression_count, "progress" means fewer regressions (wrong + declined).
      // We negate so that a decrease in bad outcomes looks like an increase in the metric.
      return -(summary.wrong + summary.declined)
    default:
      return summary.pass_rate
  }
}

/**
 * Immutable state of the no-progress detector.
 * Pure value object — create a new one on each transition.
 */
export interface NoProgressState {
  /** Number of consecutive rounds with no improvement. */
  readonly consecutiveNoProgress: number
  /** The metric value from the last round that counted as the "high-water mark". */
  readonly lastProgressValue: number | undefined
  /** Total rounds observed. */
  readonly roundsObserved: number
  /** Whether the detector has triggered (threshold reached). */
  readonly triggered: boolean
}

/** Initial state for the detector. */
export const INITIAL_NO_PROGRESS_STATE: NoProgressState = {
  consecutiveNoProgress: 0,
  lastProgressValue: undefined,
  roundsObserved: 0,
  triggered: false,
}

/**
 * Transition the no-progress state given a new eval summary.
 *
 * Pure function: takes current state + new evidence, returns next state.
 * No side effects, no I/O.
 *
 * @param state - Current detector state.
 * @param summary - The RunSummary from the latest eval round.
 * @param config - Detector configuration (defaults applied if omitted).
 * @returns The next detector state.
 */
export function detectProgress(
  state: NoProgressState,
  summary: RunSummary,
  config: NoProgressDetectorConfig = DEFAULT_NO_PROGRESS_CONFIG,
): NoProgressState {
  // If already triggered, remain triggered (terminal state until reset).
  if (state.triggered) {
    return state
  }

  const currentValue = extractMetric(summary, config.metric)
  const { lastProgressValue } = state

  // First observation: always counts as progress (establishing baseline).
  if (lastProgressValue === undefined) {
    return {
      consecutiveNoProgress: 0,
      lastProgressValue: currentValue,
      roundsObserved: state.roundsObserved + 1,
      triggered: false,
    }
  }

  const improvement = currentValue - lastProgressValue
  const isProgress = improvement > config.minDelta

  if (isProgress) {
    // Progress detected: reset the counter, update high-water mark.
    return {
      consecutiveNoProgress: 0,
      lastProgressValue: currentValue,
      roundsObserved: state.roundsObserved + 1,
      triggered: false,
    }
  }

  // No progress: increment counter.
  const newCount = state.consecutiveNoProgress + 1
  const triggered = newCount >= config.threshold

  return {
    consecutiveNoProgress: newCount,
    lastProgressValue: state.lastProgressValue,
    roundsObserved: state.roundsObserved + 1,
    triggered,
  }
}

/**
 * Reset the detector state. Use after unblocking a goal or starting fresh.
 *
 * @param preserveBaseline - If true, keep the last progress value as the
 *   new baseline (useful after manual intervention). If false, reset fully.
 */
export function resetDetector(
  state: NoProgressState,
  preserveBaseline: boolean = false,
): NoProgressState {
  return {
    consecutiveNoProgress: 0,
    lastProgressValue: preserveBaseline ? state.lastProgressValue : undefined,
    roundsObserved: preserveBaseline ? state.roundsObserved : 0,
    triggered: false,
  }
}

/**
 * Check if the detector should block the goal.
 * Convenience predicate — equivalent to checking `state.triggered`.
 */
export function shouldBlock(state: NoProgressState): boolean {
  return state.triggered
}

/**
 * Get a human-readable block reason for the goal system.
 */
export function blockReason(state: NoProgressState, config: NoProgressDetectorConfig): {
  code: string
  message: string
} {
  return {
    code: 'no-progress',
    message: `Goal blocked: no improvement in ${config.metric} for ${state.consecutiveNoProgress} consecutive rounds (threshold: ${config.threshold}).`,
  }
}
