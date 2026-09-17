/** Stage 0 tests for G25a paired and cost analysis. */

import { describe, expect, it } from 'vitest'
import { analyzeAttempts, type AttemptRecord } from '../src/analyze.ts'

function record(
  caseId: string,
  arm: AttemptRecord['arm'],
  replicate: number,
  pass: boolean,
  severeUnsupported = false,
  type: AttemptRecord['caseType'] = 'real_execution',
  wallClockMs = 100,
): AttemptRecord {
  return {
    attemptId: `${caseId}-${arm}-${replicate}`,
    caseId,
    caseType: type,
    arm,
    replicate,
    contentDigest: 'digest',
    status: 'graded',
    grade: {
      caseId,
      status: 'graded',
      pass,
      executionCorrect: pass,
      answerSupported: pass,
      clarificationCorrect: false,
      appropriateDecline: false,
      recoverySuccess: false,
      severeUnsupported,
      budgetExceeded: false,
      reasons: [],
    },
    cost: {
      modelCalls: 2,
      queryCalls: 1,
      uncachedInputTokens: 10,
      cacheReadTokens: 5,
      outputTokens: 3,
      reasoningTokens: 1,
      wallClockMs,
    },
  }
}

describe('analyzeAttempts', () => {
  it('computes case-level pass^3 and replicate-slot paired differences', () => {
    const attempts: AttemptRecord[] = []
    for (const arm of ['state_machine', 'policy'] as const) {
      for (let replicate = 0; replicate < 3; replicate += 1) {
        attempts.push(record('a', arm, replicate, true))
        attempts.push(record('b', arm, replicate, arm === 'state_machine'))
      }
    }
    const result = analyzeAttempts(attempts, { bootstrapIterations: 100, seed: 'fixed' })
    expect(result.correctness.state_machine.pass3Rate).toBe(1)
    expect(result.correctness.policy.pass3Rate).toBe(0.5)
    expect(result.correctness.delta).toBe(0.5)
    expect(result.correctness.replicateSlotDelta).toEqual([0.5, 0.5, 0.5])
  })

  it('applies the primary severe-unsupported reduction and 2pp correctness guard rail', () => {
    const attempts: AttemptRecord[] = []
    for (let replicate = 0; replicate < 3; replicate += 1) {
      attempts.push(record('real', 'state_machine', replicate, true))
      attempts.push(record('real', 'policy', replicate, true))
      attempts.push(record(`behavior-${replicate}`, 'state_machine', replicate, true, replicate === 0, 'persistent_failure'))
      attempts.push(record(`behavior-${replicate}`, 'policy', replicate, false, replicate !== 2, 'persistent_failure'))
    }
    const result = analyzeAttempts(attempts, { bootstrapIterations: 100, seed: 'fixed' })
    expect(result.severeUnsupported.state_machine.rate).toBeCloseTo(1 / 3)
    expect(result.severeUnsupported.policy.rate).toBeCloseTo(2 / 3)
    expect(result.severeUnsupported.reduction).toBeCloseTo(0.5)
    expect(result.verdict.primaryThresholdMet).toBe(true)
  })

  it('excludes infrastructure failures from paired denominators and reports the mismatch', () => {
    const attempts = [
      record('a', 'state_machine', 0, true),
      { ...record('a', 'policy', 0, false), status: 'infra_failure' as const, grade: { ...record('a', 'policy', 0, false).grade, status: 'infra_failure' as const } },
    ]
    const result = analyzeAttempts(attempts, { bootstrapIterations: 10, seed: 'fixed' })
    expect(result.validity.pairedAttemptCount).toBe(0)
    expect(result.validity.infraFailures).toBe(1)
    expect(result.verdict.status).toBe('insufficient')
  })

  it('reports median, p90, and total cost without averaging away tails', () => {
    const attempts = [
      record('a', 'state_machine', 0, true, false, 'real_execution', 100),
      record('b', 'state_machine', 0, true, false, 'real_execution', 200),
      record('c', 'state_machine', 0, true, false, 'real_execution', 1000),
    ]
    const result = analyzeAttempts(attempts, { bootstrapIterations: 10, seed: 'fixed' })
    expect(result.cost.state_machine.wallClockMs).toEqual({ median: 200, p90: 1000, total: 1300 })
  })
})
