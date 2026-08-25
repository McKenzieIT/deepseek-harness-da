import { describe, expect, it } from 'vitest'
import {
  renderEvalEvidence,
  buildEvalEvidenceParams,
  computeConsecutiveNoImprovement,
} from '@deepseek-ai/dsh-goal-eval-context'
import { EvalResultStore } from '@deepseek-ai/dsh-evidence-query'
import type { EvalResultRecord, EvalDeltaReport, EvalCaseFlip } from '@deepseek-ai/dsh-evidence-query'

// ──────────────────── Helpers ────────────────────

const STATUS_RANK: Record<EvalResultRecord['status'], number> = {
  pass: 3,
  fail: 1,
  error: 0,
  pending: 0,
}

/** Create an eval result record for a run + case. */
function record(
  runId: string,
  caseId: string,
  status: 'pass' | 'fail',
): EvalResultRecord {
  return {
    id: `${runId}:${caseId}`,
    assetId: caseId,
    caseId,
    status,
    timestamp: '2026-01-01T00:00:00Z',
    metadata: { runId },
  }
}

/**
 * Real before/after delta computation — mirrors the logic in
 * EvidenceQueryService.beforeAfterDelta(). Reads from the REAL
 * EvalResultStore's getByRunId() method and computes the case-flip summary.
 * This is NOT a stub: it produces real deltas from real store data.
 */
function makeRealBeforeAfterDelta(
  store: EvalResultStore,
): (runIdA: string, runIdB: string) => EvalDeltaReport {
  return (runIdA: string, runIdB: string): EvalDeltaReport => {
    const recordsA = store.getByRunId(runIdA)
    const recordsB = store.getByRunId(runIdB)
    const mapA = new Map(recordsA.map(r => [r.caseId, r]))
    const mapB = new Map(recordsB.map(r => [r.caseId, r]))

    const flipped: EvalCaseFlip[] = []
    let improved = 0
    let regressed = 0
    let unchanged = 0

    const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()])
    for (const caseId of allCaseIds) {
      const a = mapA.get(caseId)
      const b = mapB.get(caseId)
      if (!a || !b) continue

      if (a.status === b.status) {
        unchanged++
      } else {
        flipped.push({ caseId, before: a.status, after: b.status })
        if (b.status === 'pass' && a.status !== 'pass') improved++
        else if (a.status === 'pass' && b.status !== 'pass') regressed++
        else if (STATUS_RANK[b.status] > STATUS_RANK[a.status]) improved++
        else regressed++
      }
    }

    return { runIdA, runIdB, flipped, summary: { improved, regressed, unchanged } }
  }
}

/**
 * Simulate the plugin's systemPrompt text function. This is the exact
 * pipeline the goal-eval-context plugin uses in apply():
 *   store → buildEvalEvidenceParams → renderEvalEvidence
 * No Cordis ctx or systemPrompt service needed — the pure functions
 * are exercised end-to-end with a REAL EvalResultStore.
 */
function simulateTextFunction(
  goalActive: boolean,
  store: EvalResultStore,
  hintEscalationThreshold: number = 2,
): string {
  const beforeAfterDelta = makeRealBeforeAfterDelta(store)
  const params = buildEvalEvidenceParams(goalActive, store, beforeAfterDelta)
  return renderEvalEvidence({ ...params, hintEscalationThreshold }) ?? ''
}

// ──────────────────── Integration Tests ────────────────────

describe('goal-eval-context integration (real EvalResultStore data layer)', () => {
  it('goal active + 3 runs in store → section outputs correct XML', () => {
    const store = new EvalResultStore()
    // run-1: 1 pass, 2 fail (33%)
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'fail'))
    store.add(record('run-1', 'c3', 'fail'))
    // run-2: c2 flipped to pass (67%), delta improved=1
    store.add(record('run-2', 'c1', 'pass'))
    store.add(record('run-2', 'c2', 'pass'))
    store.add(record('run-2', 'c3', 'fail'))
    // run-3: c3 flipped to pass (100%), delta improved=1
    store.add(record('run-3', 'c1', 'pass'))
    store.add(record('run-3', 'c2', 'pass'))
    store.add(record('run-3', 'c3', 'pass'))

    const output = simulateTextFunction(true, store)

    // XML structure
    expect(output).toContain('<eval_evidence>')
    expect(output).toContain('</eval_evidence>')

    // Pass rate from latest run (run-3: 3/3 = 100%)
    expect(output).toContain('Pass rate: 3/3 (100%)')

    // Delta summary (run-2 → run-3: 1 improved, 0 regressed, 2 unchanged)
    expect(output).toContain('Last delta: +1 improved, -0 regressed, 2 unchanged (vs run run-2)')

    // Direction hint — improvement detected
    expect(output).toContain('Direction: Progress detected — continue current approach.')

    // Consecutive no-improvement count (latest delta has improvement → 0)
    expect(output).toContain('Consecutive evaluations without improvement: 0')
  })

  it('goal active + 1 run → baseline message', () => {
    const store = new EvalResultStore()
    // Single run: 2 pass, 1 fail (67%)
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-1', 'c2', 'pass'))
    store.add(record('run-1', 'c3', 'fail'))

    const output = simulateTextFunction(true, store)

    expect(output).toContain('<eval_evidence>')
    expect(output).toContain('Pass rate: 2/3 (67%)')
    expect(output).toContain('Baseline established. Next evaluation will show improvement delta.')
    expect(output).toContain('Direction: Continue working — first delta will appear after next evaluation.')
    expect(output).toContain('</eval_evidence>')
  })

  it('goal inactive → text function returns empty string', () => {
    const store = new EvalResultStore()
    // Store has data, but goal is not active — should return ''
    store.add(record('run-1', 'c1', 'pass'))
    store.add(record('run-2', 'c1', 'pass'))

    const output = simulateTextFunction(false, store)

    // renderEvalEvidence returns null when goalActive=false → text = ''
    expect(output).toBe('')
  })

  it('multiple consecutive no-improvement runs → escalated hint', () => {
    const store = new EvalResultStore()
    // 4 runs where ALL pairs have improved=0 (no case ever flips to pass)
    // run-1: c1=fail, c2=fail
    store.add(record('run-1', 'c1', 'fail'))
    store.add(record('run-1', 'c2', 'fail'))
    // run-2: same statuses → delta improved=0
    store.add(record('run-2', 'c1', 'fail'))
    store.add(record('run-2', 'c2', 'fail'))
    // run-3: same statuses → delta improved=0
    store.add(record('run-3', 'c1', 'fail'))
    store.add(record('run-3', 'c2', 'fail'))
    // run-4: same statuses → delta improved=0
    store.add(record('run-4', 'c1', 'fail'))
    store.add(record('run-4', 'c2', 'fail'))

    // Verify the real delta computation produces improved=0 for all pairs
    const deltaFn = makeRealBeforeAfterDelta(store)
    const runIds = store.getRunIds()
    expect(runIds).toEqual(['run-1', 'run-2', 'run-3', 'run-4'])

    // computeConsecutiveNoImprovement walks all 3 pairs from the end
    const consecutive = computeConsecutiveNoImprovement(runIds, deltaFn)
    expect(consecutive).toBe(3)

    const output = simulateTextFunction(true, store)

    // Escalated hint with the count
    expect(output).toContain('No improvement detected for 3 consecutive evaluations')
    expect(output).toContain('Consecutive evaluations without improvement: 3')
    expect(output).toContain('Consider changing approach or investigating regressed cases before continuing.')
  })
})
