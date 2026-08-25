/**
 * Unit tests for the NoProgressDetector.
 *
 * Tests the pure state machine logic: progress detection, threshold triggering,
 * reset behavior, and metric extraction.
 */

import { describe, it, expect } from 'vitest'
import type { RunSummary } from '../src/eval-runner-types.ts'
import type { NoProgressDetectorConfig } from '../src/types.ts'
import {
  detectProgress,
  resetDetector,
  shouldBlock,
  blockReason,
  INITIAL_NO_PROGRESS_STATE,
} from '../src/no-progress-detector.ts'
import type { NoProgressState } from '../src/no-progress-detector.ts'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeSummary(passRate: number, overrides: Partial<RunSummary> = {}): RunSummary {
  const total = overrides.total ?? 100
  const correct = overrides.correct ?? Math.round(passRate * total)
  return {
    total,
    correct,
    wrong: overrides.wrong ?? (total - correct),
    declined: overrides.declined ?? 0,
    unjudged: overrides.unjudged ?? 0,
    infra_failure: overrides.infra_failure ?? 0,
    pass_rate: passRate,
  }
}

const DEFAULT_CONFIG: NoProgressDetectorConfig = {
  threshold: 3,
  metric: 'pass_rate',
  minDelta: 0.0,
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('NoProgressDetector', () => {
  describe('initial state', () => {
    it('starts with zero counters and not triggered', () => {
      expect(INITIAL_NO_PROGRESS_STATE.consecutiveNoProgress).toBe(0)
      expect(INITIAL_NO_PROGRESS_STATE.lastProgressValue).toBeUndefined()
      expect(INITIAL_NO_PROGRESS_STATE.roundsObserved).toBe(0)
      expect(INITIAL_NO_PROGRESS_STATE.triggered).toBe(false)
    })
  })

  describe('detectProgress', () => {
    it('first observation always counts as progress (establishes baseline)', () => {
      const next = detectProgress(INITIAL_NO_PROGRESS_STATE, makeSummary(0.5), DEFAULT_CONFIG)
      expect(next.consecutiveNoProgress).toBe(0)
      expect(next.lastProgressValue).toBe(0.5)
      expect(next.roundsObserved).toBe(1)
      expect(next.triggered).toBe(false)
    })

    it('improvement resets the counter and updates high-water mark', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 2,
        lastProgressValue: 0.5,
        roundsObserved: 3,
        triggered: false,
      }
      const next = detectProgress(state, makeSummary(0.6), DEFAULT_CONFIG)
      expect(next.consecutiveNoProgress).toBe(0)
      expect(next.lastProgressValue).toBe(0.6)
      expect(next.roundsObserved).toBe(4)
      expect(next.triggered).toBe(false)
    })

    it('no improvement increments the counter', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: 0.5,
        roundsObserved: 1,
        triggered: false,
      }
      const next = detectProgress(state, makeSummary(0.5), DEFAULT_CONFIG)
      expect(next.consecutiveNoProgress).toBe(1)
      expect(next.lastProgressValue).toBe(0.5) // unchanged
      expect(next.roundsObserved).toBe(2)
      expect(next.triggered).toBe(false)
    })

    it('regression also counts as no progress', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 1,
        lastProgressValue: 0.7,
        roundsObserved: 2,
        triggered: false,
      }
      const next = detectProgress(state, makeSummary(0.6), DEFAULT_CONFIG)
      expect(next.consecutiveNoProgress).toBe(2)
      expect(next.lastProgressValue).toBe(0.7) // high-water mark preserved
      expect(next.triggered).toBe(false)
    })

    it('triggers when threshold is reached', () => {
      let state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: 0.5,
        roundsObserved: 1,
        triggered: false,
      }
      // Three consecutive rounds with no improvement
      state = detectProgress(state, makeSummary(0.5), DEFAULT_CONFIG)
      expect(state.consecutiveNoProgress).toBe(1)
      expect(state.triggered).toBe(false)

      state = detectProgress(state, makeSummary(0.4), DEFAULT_CONFIG)
      expect(state.consecutiveNoProgress).toBe(2)
      expect(state.triggered).toBe(false)

      state = detectProgress(state, makeSummary(0.5), DEFAULT_CONFIG)
      expect(state.consecutiveNoProgress).toBe(3)
      expect(state.triggered).toBe(true)
    })

    it('once triggered, remains triggered regardless of input', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 3,
        lastProgressValue: 0.5,
        roundsObserved: 4,
        triggered: true,
      }
      // Even a huge improvement does not un-trigger
      const next = detectProgress(state, makeSummary(1.0), DEFAULT_CONFIG)
      expect(next.triggered).toBe(true)
      expect(next).toBe(state) // same reference (early return)
    })

    it('respects minDelta: tiny improvement below threshold does not count', () => {
      const configWithDelta: NoProgressDetectorConfig = {
        threshold: 3,
        metric: 'pass_rate',
        minDelta: 0.05, // need at least 5% improvement
      }
      const state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: 0.5,
        roundsObserved: 1,
        triggered: false,
      }
      // 2% improvement — below minDelta
      const next = detectProgress(state, makeSummary(0.52), configWithDelta)
      expect(next.consecutiveNoProgress).toBe(1)
      expect(next.lastProgressValue).toBe(0.5) // not updated
    })

    it('respects minDelta: improvement at or above threshold counts', () => {
      const configWithDelta: NoProgressDetectorConfig = {
        threshold: 3,
        metric: 'pass_rate',
        minDelta: 0.05,
      }
      const state: NoProgressState = {
        consecutiveNoProgress: 2,
        lastProgressValue: 0.5,
        roundsObserved: 3,
        triggered: false,
      }
      // Exactly 5% improvement
      const next = detectProgress(state, makeSummary(0.55), configWithDelta)
      expect(next.consecutiveNoProgress).toBe(0)
      expect(next.lastProgressValue).toBe(0.55)
    })

    it('supports correct_count metric', () => {
      const config: NoProgressDetectorConfig = {
        threshold: 2,
        metric: 'correct_count',
        minDelta: 0.0,
      }
      const state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: 50,
        roundsObserved: 1,
        triggered: false,
      }
      // Same correct count = no progress
      const next = detectProgress(state, makeSummary(0.5, { correct: 50 }), config)
      expect(next.consecutiveNoProgress).toBe(1)

      // More correct = progress
      const next2 = detectProgress(next, makeSummary(0.55, { correct: 55 }), config)
      expect(next2.consecutiveNoProgress).toBe(0)
      expect(next2.lastProgressValue).toBe(55)
    })

    it('supports regression_count metric (fewer regressions = progress)', () => {
      const config: NoProgressDetectorConfig = {
        threshold: 2,
        metric: 'regression_count',
        minDelta: 0.0,
      }
      const state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: -(30 + 5), // -(wrong + declined)
        roundsObserved: 1,
        triggered: false,
      }
      // Same regressions = no progress
      const next = detectProgress(state, makeSummary(0.65, { wrong: 30, declined: 5 }), config)
      expect(next.consecutiveNoProgress).toBe(1)

      // Fewer regressions = progress (negated value increases)
      const next2 = detectProgress(next, makeSummary(0.7, { wrong: 25, declined: 3 }), config)
      expect(next2.consecutiveNoProgress).toBe(0)
      expect(next2.lastProgressValue).toBe(-(25 + 3))
    })

    it('custom threshold of 1 triggers immediately on first no-progress', () => {
      const config: NoProgressDetectorConfig = {
        threshold: 1,
        metric: 'pass_rate',
        minDelta: 0.0,
      }
      const state: NoProgressState = {
        consecutiveNoProgress: 0,
        lastProgressValue: 0.5,
        roundsObserved: 1,
        triggered: false,
      }
      const next = detectProgress(state, makeSummary(0.5), config)
      expect(next.triggered).toBe(true)
      expect(next.consecutiveNoProgress).toBe(1)
    })
  })

  describe('resetDetector', () => {
    it('full reset clears everything', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 3,
        lastProgressValue: 0.7,
        roundsObserved: 5,
        triggered: true,
      }
      const next = resetDetector(state, false)
      expect(next.consecutiveNoProgress).toBe(0)
      expect(next.lastProgressValue).toBeUndefined()
      expect(next.roundsObserved).toBe(0)
      expect(next.triggered).toBe(false)
    })

    it('preserveBaseline keeps the high-water mark and rounds', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 3,
        lastProgressValue: 0.7,
        roundsObserved: 5,
        triggered: true,
      }
      const next = resetDetector(state, true)
      expect(next.consecutiveNoProgress).toBe(0)
      expect(next.lastProgressValue).toBe(0.7) // preserved
      expect(next.roundsObserved).toBe(5) // preserved
      expect(next.triggered).toBe(false) // cleared
    })
  })

  describe('shouldBlock', () => {
    it('returns false when not triggered', () => {
      expect(shouldBlock({ ...INITIAL_NO_PROGRESS_STATE })).toBe(false)
    })

    it('returns true when triggered', () => {
      expect(shouldBlock({ ...INITIAL_NO_PROGRESS_STATE, triggered: true })).toBe(true)
    })
  })

  describe('blockReason', () => {
    it('produces a well-formed block reason', () => {
      const state: NoProgressState = {
        consecutiveNoProgress: 3,
        lastProgressValue: 0.5,
        roundsObserved: 4,
        triggered: true,
      }
      const reason = blockReason(state, DEFAULT_CONFIG)
      expect(reason.code).toBe('no-progress')
      expect(reason.message).toContain('3')
      expect(reason.message).toContain('pass_rate')
      expect(reason.message).toContain('threshold')
    })
  })
})
