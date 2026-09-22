import { describe, expect, it } from 'vitest'
import {
  renderEvalEvidence,
  computeDirectionHint,
  computeConsecutiveNoImprovement,
  buildEvalEvidenceParams,
} from '@deepseek-ai/dsh-goal-eval-context'
import { EvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import type { EvalResultRecord, EvalDeltaReport } from '@deepseek-ai/dsh-evidence-query'

// ── renderEvalEvidence ──────────────────────────────────────────────────

function record(runId: string, caseId: string, status: 'pass' | 'fail'): EvalResultRecord {
  return {
    id: `${runId}:${caseId}`,
    assetId: caseId,
    caseId,
    status,
    timestamp: '2026-01-01T00:00:00Z',
    metadata: { runId },
  }
}

describe('renderEvalEvidence', () => {
  it('returns null when goal is not active', () => {
    const result = renderEvalEvidence({ goalActive: false, hasRuns: false })
    expect(result).toBeNull()
  })

  it('returns fallback message when goal is active but no eval data', () => {
    const result = renderEvalEvidence({ goalActive: true, hasRuns: false })
    expect(result).toContain('<eval_evidence>')
    expect(result).toContain('No evaluation data yet.')
    expect(result).toContain('Consider triggering an evaluation to measure current quality.')
    expect(result).toContain('</eval_evidence>')
  })

  it('returns baseline message with pass_rate when only one run exists', () => {
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 10,
      correct: 7,
      passRate: 70,
    })
    expect(result).toContain('<eval_evidence>')
    expect(result).toContain('Pass rate: 7/10 (70%)')
    expect(result).toContain('Baseline established. Next evaluation will show improvement delta.')
    expect(result).toContain('Direction: Continue working — first delta will appear after next evaluation.')
    expect(result).toContain('</eval_evidence>')
  })

  it('returns delta with "Progress detected" direction when improvement detected', () => {
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 10,
      correct: 8,
      passRate: 80,
      delta: { improved: 2, regressed: 0, unchanged: 8, prevRunId: 'run-1' },
      consecutiveNoImprovement: 0,
    })
    expect(result).toContain('<eval_evidence>')
    expect(result).toContain('Pass rate: 8/10 (80%)')
    expect(result).toContain('Last delta: +2 improved, -0 regressed, 8 unchanged (vs run run-1)')
    expect(result).toContain('Consecutive evaluations without improvement: 0')
    expect(result).toContain('Direction: Progress detected — continue current approach.')
    expect(result).toContain('</eval_evidence>')
  })

  it('returns "No improvement" direction when no improvement in last evaluation', () => {
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 10,
      correct: 7,
      passRate: 70,
      delta: { improved: 0, regressed: 1, unchanged: 9, prevRunId: 'run-2' },
      consecutiveNoImprovement: 1,
    })
    expect(result).toContain('Direction: No improvement in last evaluation. Consider investigating regressed or failed cases.')
  })

  it('returns escalated direction hint when multiple consecutive no-improvement', () => {
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 10,
      correct: 7,
      passRate: 70,
      delta: { improved: 0, regressed: 0, unchanged: 10, prevRunId: 'run-3' },
      consecutiveNoImprovement: 3,
    })
    expect(result).toContain('Direction: No improvement detected for 3 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.')
    expect(result).toContain('Consecutive evaluations without improvement: 3')
  })

  it('treats an omitted consecutiveNoImprovement as 0 in both the count line and the hint', () => {
    // A caller that has a delta but no counter (e.g. a params object assembled
    // without the walk) must read as "0 consecutive", not as a blank or an
    // escalation: 0 is below the default threshold 2, so the hint stays mild.
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 4,
      correct: 4,
      passRate: 100,
      delta: { improved: 0, regressed: 0, unchanged: 4, prevRunId: 'run-9' },
    })
    expect(result).toContain('Consecutive evaluations without improvement: 0')
    expect(result).toContain('Direction: No improvement in last evaluation. Consider investigating regressed or failed cases.')
    expect(result).not.toContain('consecutive evaluations. Consider changing approach')
  })

  it('honours hintEscalationThreshold passed via params', () => {
    // count 2 with the default threshold 2 would escalate; raising the
    // threshold to 3 keeps the hint mild until count reaches 3.
    const result = renderEvalEvidence({
      goalActive: true,
      hasRuns: true,
      total: 10,
      correct: 7,
      passRate: 70,
      delta: { improved: 0, regressed: 0, unchanged: 10, prevRunId: 'run-3' },
      consecutiveNoImprovement: 2,
      hintEscalationThreshold: 3,
    })
    expect(result).toContain('Direction: No improvement in last evaluation. Consider investigating regressed or failed cases.')
  })
})

// ── computeDirectionHint ────────────────────────────────────────────────

describe('computeDirectionHint', () => {
  it('returns baseline message when no delta', () => {
    expect(computeDirectionHint(undefined, 0))
      .toBe('Continue working — first delta will appear after next evaluation.')
  })

  it('returns progress message when improved > 0', () => {
    expect(computeDirectionHint({ improved: 3, regressed: 0, unchanged: 7, prevRunId: 'x' }, 0))
      .toBe('Progress detected — continue current approach.')
  })

  it('returns mild warning when no improvement but consecutiveNoImprovement < 2', () => {
    expect(computeDirectionHint({ improved: 0, regressed: 1, unchanged: 9, prevRunId: 'x' }, 1))
      .toBe('No improvement in last evaluation. Consider investigating regressed or failed cases.')
  })

  it('returns escalated warning when consecutiveNoImprovement >= 2', () => {
    expect(computeDirectionHint({ improved: 0, regressed: 0, unchanged: 10, prevRunId: 'x' }, 2))
      .toBe('No improvement detected for 2 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.')
  })

  it('returns escalated warning with exact count when consecutiveNoImprovement is 5', () => {
    expect(computeDirectionHint({ improved: 0, regressed: 2, unchanged: 8, prevRunId: 'x' }, 5))
      .toContain('for 5 consecutive evaluations')
  })

  it('honours a custom hintEscalationThreshold (escalates only at the configured count)', () => {
    // Threshold 5: count 4 stays a mild warning...
    expect(computeDirectionHint({ improved: 0, regressed: 0, unchanged: 10, prevRunId: 'x' }, 4, 5))
      .toBe('No improvement in last evaluation. Consider investigating regressed or failed cases.')
    // ...and meeting the threshold escalates.
    expect(computeDirectionHint({ improved: 0, regressed: 0, unchanged: 10, prevRunId: 'x' }, 5, 5))
      .toBe('No improvement detected for 5 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.')
  })

  it('uses default threshold 2 when hintEscalationThreshold is omitted', () => {
    // count 1 → mild (below default threshold 2)
    expect(computeDirectionHint({ improved: 0, regressed: 1, unchanged: 9, prevRunId: 'x' }, 1))
      .toBe('No improvement in last evaluation. Consider investigating regressed or failed cases.')
    // count 2 → escalated (meets default threshold 2)
    expect(computeDirectionHint({ improved: 0, regressed: 0, unchanged: 10, prevRunId: 'x' }, 2))
      .toBe('No improvement detected for 2 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.')
  })
})

// ── computeConsecutiveNoImprovement ─────────────────────────────────────

describe('computeConsecutiveNoImprovement', () => {
  it('returns 0 when less than 2 runs', () => {
    const result = computeConsecutiveNoImprovement(['run-1'], () => {
      throw new Error('should not be called')
    })
    expect(result).toBe(0)
  })

  it('returns 0 when latest delta has improvement', () => {
    const mockDelta = (_a: string, _b: string): EvalDeltaReport => ({
      runIdA: 'run-1',
      runIdB: 'run-2',
      flipped: [{ caseId: 'c1', before: 'fail', after: 'pass' }],
      summary: { improved: 1, regressed: 0, unchanged: 4 },
    })

    expect(computeConsecutiveNoImprovement(['run-1', 'run-2'], mockDelta)).toBe(0)
  })

  it('counts consecutive no-improvement runs from the end', () => {
    const deltas: Record<string, EvalDeltaReport> = {
      'run-1:run-2': { runIdA: 'run-1', runIdB: 'run-2', flipped: [], summary: { improved: 2, regressed: 0, unchanged: 3 } },
      'run-2:run-3': { runIdA: 'run-2', runIdB: 'run-3', flipped: [], summary: { improved: 0, regressed: 1, unchanged: 4 } },
      'run-3:run-4': { runIdA: 'run-3', runIdB: 'run-4', flipped: [], summary: { improved: 0, regressed: 0, unchanged: 5 } },
    }
    const mockDelta = (a: string, b: string): EvalDeltaReport => deltas[`${a}:${b}`]!

    expect(computeConsecutiveNoImprovement(['run-1', 'run-2', 'run-3', 'run-4'], mockDelta)).toBe(2)
  })

  it('substitutes an empty run id for a gap on either side of a walked pair', () => {
    // The run index is an injected boundary: a gap (a pruned/unloaded entry)
    // must degrade to the empty run id rather than handing `undefined` to the
    // delta lookup, which would surface as `undefined` in the rendered prompt.
    const asked: Array<[string, string]> = []
    const noImprovement = (a: string, b: string): EvalDeltaReport => {
      asked.push([a, b])
      return { runIdA: a, runIdB: b, flipped: [], summary: { improved: 0, regressed: 0, unchanged: 0 } }
    }
    const gapped: string[] = []
    gapped.length = 3
    gapped[1] = 'run-2' // indices 0 and 2 are gaps

    expect(computeConsecutiveNoImprovement(gapped, noImprovement)).toBe(2)
    // Walked from the end: (gapped[1], gapped[2]) then (gapped[0], gapped[1]).
    expect(asked).toEqual([['run-2', ''], ['', 'run-2']])
  })

  it('stops counting at the first improvement from the end', () => {
    const deltas: Record<string, EvalDeltaReport> = {
      'run-1:run-2': { runIdA: 'run-1', runIdB: 'run-2', flipped: [], summary: { improved: 0, regressed: 0, unchanged: 5 } },
      'run-2:run-3': { runIdA: 'run-2', runIdB: 'run-3', flipped: [], summary: { improved: 1, regressed: 0, unchanged: 4 } },
      'run-3:run-4': { runIdA: 'run-3', runIdB: 'run-4', flipped: [], summary: { improved: 0, regressed: 0, unchanged: 5 } },
    }
    const mockDelta = (a: string, b: string): EvalDeltaReport => deltas[`${a}:${b}`]!

    expect(computeConsecutiveNoImprovement(['run-1', 'run-2', 'run-3', 'run-4'], mockDelta)).toBe(1)
  })
})

// ── buildEvalEvidenceParams ─────────────────────────────────────────────

/**
 * A store with a caller-controlled run index. The store is an injected
 * boundary for `buildEvalEvidenceParams`, so its run index and its record
 * index can disagree (a pruned run, a gap in a partially loaded index) —
 * these stubs reproduce exactly that disagreement.
 */
function storeWithRunIndex(
  runIds: string[],
  byRunId: Record<string, EvalResultRecord[]> = {},
  asked?: string[],
): EvalResultStore {
  return {
    getRunIds: () => runIds,
    getByRunId: (runId: string) => {
      asked?.push(runId)
      return byRunId[runId] ?? []
    },
  } as unknown as EvalResultStore
}

describe('buildEvalEvidenceParams', () => {

  it('reports a 0% pass rate, never NaN, when the latest run holds no records', () => {
    const params = buildEvalEvidenceParams(true, storeWithRunIndex(['run-1']), () => {
      throw new Error('a single run needs no delta')
    })
    expect(params).toEqual({ goalActive: true, hasRuns: true, total: 0, correct: 0, passRate: 0 })
    // The rendered prompt must show a number the model can read, not NaN%.
    expect(renderEvalEvidence(params)).toContain('Pass rate: 0/0 (0%)')
  })

  it('substitutes the empty run id when the newest run-index entry is a gap', () => {
    const gapped: string[] = []
    gapped.length = 1 // index 0 is a gap
    const asked: string[] = []

    const params = buildEvalEvidenceParams(true, storeWithRunIndex(gapped, {}, asked), () => {
      throw new Error('a single run needs no delta')
    })

    // The record lookup received '' rather than `undefined`, and the empty
    // result reads as an established-but-empty baseline.
    expect(asked).toEqual([''])
    expect(params).toEqual({ goalActive: true, hasRuns: true, total: 0, correct: 0, passRate: 0 })
  })

  it('substitutes the empty run id when the previous run-index entry is a gap', () => {
    const gapped: string[] = []
    gapped.length = 2
    gapped[1] = 'run-2' // index 0 is a gap
    const asked: Array<[string, string]> = []
    const delta = (a: string, b: string): EvalDeltaReport => {
      asked.push([a, b])
      return { runIdA: a, runIdB: b, flipped: [], summary: { improved: 1, regressed: 0, unchanged: 1 } }
    }
    const store = storeWithRunIndex(gapped, {
      'run-2': [record('run-2', 'c1', 'pass'), record('run-2', 'c2', 'fail')],
    })

    const params = buildEvalEvidenceParams(true, store, delta)

    // The latest run still measures normally; only the missing predecessor
    // degrades to '' — both the delta call and the reported prevRunId.
    expect(params.total).toBe(2)
    expect(params.correct).toBe(1)
    expect(params.passRate).toBe(50)
    expect(params.delta).toEqual({ improved: 1, regressed: 0, unchanged: 1, prevRunId: '' })
    expect(params.consecutiveNoImprovement).toBe(0)
    expect(asked).toEqual([['', 'run-2'], ['', 'run-2']])
  })

  it('returns goalActive false when goal is not active', () => {
    const store = new EvalResultStore()
    const params = buildEvalEvidenceParams(false, store, () => { throw new Error() })
    expect(params.goalActive).toBe(false)
  })

  it('returns hasRuns false when store is empty', () => {
    const store = new EvalResultStore()
    const params = buildEvalEvidenceParams(true, store, () => { throw new Error() })
    expect(params.goalActive).toBe(true)
    expect(params.hasRuns).toBe(false)
  })

  it('returns baseline params for a single run', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'fail'))
    store.add(record('run-1', 'c3', 'pass'))

    const params = buildEvalEvidenceParams(true, store, () => { throw new Error() })
    expect(params.goalActive).toBe(true)
    expect(params.hasRuns).toBe(true)
    expect(params.total).toBe(3)
    expect(params.correct).toBe(2)
    expect(params.passRate).toBe(67)
    expect(params.delta).toBeUndefined()
  })

  it('returns full delta params for multiple runs', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'fail'))
    store.add(record('run-2', 'c1', 'pass'))
    store.add(record('run-2', 'c2', 'pass'))

    const mockDelta = (a: string, b: string): EvalDeltaReport => ({
      runIdA: a,
      runIdB: b,
      flipped: [{ caseId: 'c2', before: 'fail', after: 'pass' }],
      summary: { improved: 1, regressed: 0, unchanged: 1 },
    })

    const params = buildEvalEvidenceParams(true, store, mockDelta)
    expect(params.goalActive).toBe(true)
    expect(params.hasRuns).toBe(true)
    expect(params.total).toBe(2)
    expect(params.correct).toBe(2)
    expect(params.passRate).toBe(100)
    expect(params.delta).toEqual({
      improved: 1,
      regressed: 0,
      unchanged: 1,
      prevRunId: 'run-1',
    })
    expect(params.consecutiveNoImprovement).toBe(0)
  })

  it('computes consecutiveNoImprovement correctly', () => {
    const store = new EvalResultStore()
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-2', 'c1', 'pass'))
    store.add(record('run-3', 'c1', 'pass'))

    const mockDelta = (_a: string, _b: string): EvalDeltaReport => ({
      runIdA: _a,
      runIdB: _b,
      flipped: [],
      summary: { improved: 0, regressed: 0, unchanged: 1 },
    })

    const params = buildEvalEvidenceParams(true, store, mockDelta)
    expect(params.consecutiveNoImprovement).toBe(2)
  })
})
