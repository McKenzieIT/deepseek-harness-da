/**
 * Minimal type re-declarations from @deepseek-ai/dsh-eval-runner.
 *
 * The eval-runner package is WIP (W3 workstream) and does not yet compile
 * cleanly under strict tsc. This file provides the exact subset of types
 * needed by the semantic-layer-goal framework, ensuring this package can
 * type-check independently.
 *
 * When eval-runner stabilizes and its index.ts is healthy, these re-declarations
 * can be replaced with direct imports from '@deepseek-ai/dsh-eval-runner'.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/eval-runner-types
 */

/**
 * Runner-level verdict for a case.
 */
export type RunnerVerdict = 'correct' | 'declined' | 'wrong' | 'unjudged' | 'infra_failure'

/**
 * Summary statistics for a run.
 */
export interface RunSummary {
  readonly total: number
  readonly correct: number
  readonly wrong: number
  readonly declined: number
  readonly unjudged: number
  readonly infra_failure: number
  readonly pass_rate: number
}

/**
 * The persisted result of a full batch eval run.
 */
export interface RunResult {
  readonly run_id: string
  readonly timestamp: string
  readonly cases: CaseVerdict[]
  readonly summary: RunSummary
}

/**
 * The verdict for one eval case within a batch run.
 */
export interface CaseVerdict {
  readonly case_id: string
  readonly verdict: RunnerVerdict
  readonly latency_ms: number
}

/**
 * A flip: one case whose verdict changed between two runs.
 */
export interface CaseFlip {
  readonly case_id: string
  readonly old_verdict: RunnerVerdict
  readonly new_verdict: RunnerVerdict
}

/**
 * Delta summary: counts of improved, regressed, and unchanged cases.
 */
export interface DeltaSummary {
  readonly improved: number
  readonly regressed: number
  readonly unchanged: number
}

/**
 * Before/after delta report comparing two runs.
 */
export interface DeltaReport {
  readonly run_a_id: string
  readonly run_b_id: string
  readonly flips: CaseFlip[]
  readonly summary: DeltaSummary
}
