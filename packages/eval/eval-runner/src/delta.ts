/**
 * Before/after delta comparison: which cases flipped between two runs.
 *
 * Enables tracking regressions and improvements across model/agent changes.
 * A flip is any case whose verdict changed from run A to run B.
 *
 * @module @deepseek-ai/dsh-eval-runner/delta
 */

import type { RunResult, RunnerVerdict, CaseFlip, DeltaReport, DeltaSummary } from './types.ts'

/** Verdict severity ordering (lower = better). Used to determine improvement vs regression. */
const VERDICT_SEVERITY: Record<RunnerVerdict, number> = {
  correct: 0,
  declined: 1,
  unjudged: 2,
  wrong: 3,
  infra_failure: 4,
}

/**
 * Compare two runs and produce a delta report.
 *
 * A flip is any case present in both runs whose verdict changed. Cases
 * present in only one run are not reported as flips (they are new or removed).
 *
 * @param runA - the "before" run (baseline).
 * @param runB - the "after" run (new).
 * @returns the delta report.
 */
export function compareDelta(runA: RunResult, runB: RunResult): DeltaReport {
  // Build lookup maps by case_id
  const mapA = new Map(runA.cases.map(c => [c.case_id, c.verdict]))
  const mapB = new Map(runB.cases.map(c => [c.case_id, c.verdict]))

  const flips: CaseFlip[] = []

  // Find cases present in both runs with different verdicts
  for (const [caseId, verdictA] of mapA) {
    const verdictB = mapB.get(caseId)
    if (verdictB === undefined) continue // case removed in B
    if (verdictA !== verdictB) {
      flips.push({ case_id: caseId, old_verdict: verdictA, new_verdict: verdictB })
    }
  }

  // Sort flips: regressions first (ascending severity change), then improvements
  flips.sort((a, b) => {
    const deltaA = VERDICT_SEVERITY[a.new_verdict] - VERDICT_SEVERITY[a.old_verdict]
    const deltaB = VERDICT_SEVERITY[b.new_verdict] - VERDICT_SEVERITY[b.old_verdict]
    // Regressions (positive delta) first, then improvements (negative delta)
    return deltaB - deltaA
  })

  const summary = computeSummary(flips, mapA, mapB)

  return {
    run_a_id: runA.run_id,
    run_b_id: runB.run_id,
    flips,
    summary,
  }
}

/**
 * Compute the delta summary.
 */
function computeSummary(
  flips: CaseFlip[],
  mapA: Map<string, RunnerVerdict>,
  mapB: Map<string, RunnerVerdict>,
): DeltaSummary {
  let improved = 0
  let regressed = 0

  for (const flip of flips) {
    const severityOld = VERDICT_SEVERITY[flip.old_verdict]
    const severityNew = VERDICT_SEVERITY[flip.new_verdict]
    if (severityNew < severityOld) {
      improved++
    } else {
      regressed++
    }
  }

  // Unchanged = cases present in both runs with same verdict
  const commonCases = [...mapA.keys()].filter(k => mapB.has(k))
  const unchanged = commonCases.length - flips.length

  return { improved, regressed, unchanged }
}

/**
 * Filter flips to only regressions (verdict got worse).
 */
export function regressions(report: DeltaReport): CaseFlip[] {
  return report.flips.filter(f => VERDICT_SEVERITY[f.new_verdict] > VERDICT_SEVERITY[f.old_verdict])
}

/**
 * Filter flips to only improvements (verdict got better).
 */
export function improvements(report: DeltaReport): CaseFlip[] {
  return report.flips.filter(f => VERDICT_SEVERITY[f.new_verdict] < VERDICT_SEVERITY[f.old_verdict])
}
