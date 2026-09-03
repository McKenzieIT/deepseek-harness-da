/**
 * Batch eval runner — drives the full case set through `runMultiTurnCase` and
 * produces a `BatchResult` suitable for persistence and delta analysis.
 *
 * Design:
 * - G4 决议: eval runs ALL cases (no affected-case subsetting — catches side effects)
 * - pass_k anti-flakiness: each case is run `passK` times (default 3)
 * - Infra failures are bounded-retried separately (see health-gate.ts)
 * - Output aligns with evidence-query `EvalResultRecord` interface
 *
 * @module @deepseek-ai/dsh-eval/runner
 */

import { runMultiTurnCase, DEFAULT_PASS_K } from './multi_turn.ts'
import type { EvalCase } from './eval_case.ts'
import type {
  CaseSqlExecutor,
  JudgeProvider,
  MultiTurnCaseResult,
  Responder,
  Verdict,
} from './types.ts'
import type { DeliveryOpts } from './delivery.ts'

/** Classification of a case outcome for aggregation and evidence-query alignment. */
export type CaseOutcome = 'correct' | 'declined' | 'wrong' | 'unjudged'

/** Classify a `MultiTurnCaseResult` into a top-level outcome bucket. */
export function classifyCaseOutcome(result: MultiTurnCaseResult): CaseOutcome {
  if (result.passed) return 'correct'
  if (result.attempts.every(a => a.error !== null)) return 'unjudged'
  if (result.verdict === 'fail') return 'wrong'
  if (result.verdict === 'partial') return 'declined'
  return 'unjudged'
}

/** Summary statistics for one batch run. */
export interface BatchSummary {
  readonly totalCases: number
  readonly correct: number
  readonly declined: number
  readonly wrong: number
  readonly unjudged: number
  readonly passRate: number
  readonly totalLatencyMs: number
}

/** Per-case result with its classified outcome. */
export interface ClassifiedCaseResult {
  readonly caseId: string
  readonly outcome: CaseOutcome
  readonly verdict: Verdict | null
  readonly result: MultiTurnCaseResult
}

/** Output of a full batch eval run. */
export interface BatchResult {
  readonly runId: string
  readonly timestamp: string
  readonly passK: number
  readonly perCase: readonly ClassifiedCaseResult[]
  readonly summary: BatchSummary
}

/** Options for `runBatch`. */
export interface RunBatchOptions {
  readonly runId: string
  readonly responder: Responder
  readonly executeSql?: CaseSqlExecutor | null
  readonly provider?: JudgeProvider | null
  readonly passK?: number
  readonly deliveryOpts?: DeliveryOpts
  readonly timeoutMs?: number | null
  readonly onTimeout?: ((sessionId: string, attempt: number | null, turnIndex: number) => Promise<void>) | null
  readonly onCaseComplete?: (result: ClassifiedCaseResult, index: number, total: number) => void
  /** Max infra retries per case (default 2). Infra = error + not timeout. */
  readonly maxInfraRetries?: number
}

/**
 * Run the full case batch sequentially. Each case runs `passK` times via
 * `runMultiTurnCase`. Infra failures (errors that are not timeouts and not
 * scoreable) are retried up to `maxInfraRetries` times — these retries do NOT
 * count toward pass_k attempts (they are infrastructure faults, not model
 * performance).
 *
 * NOTE: Sequential execution — no concurrency. For 161 cases × pass_k=3 this
 * may be slow. A bounded-concurrency option is deferred (requires session
 * isolation per concurrent case).
 *
 * @param cases - the validated case set.
 * @param opts - run configuration.
 * @returns the batch result.
 */
export async function runBatch(cases: readonly EvalCase[], opts: RunBatchOptions): Promise<BatchResult> {
  const passK = opts.passK ?? DEFAULT_PASS_K
  const maxInfraRetries = opts.maxInfraRetries ?? 2
  const timestamp = new Date().toISOString()
  const perCase: ClassifiedCaseResult[] = []

  for (let i = 0; i < cases.length; i++) {
    const case_ = cases[i]
    /* v8 ignore next 1 -- dense parsed-JSON array: index i < length always defined */
    if (case_ === undefined) continue
    let result: MultiTurnCaseResult | null = null
    let infraRetries = 0

    while (infraRetries <= maxInfraRetries) {
      result = await runMultiTurnCase(case_, {
        runId: opts.runId,
        responder: opts.responder,
        passK,
        executeSql: opts.executeSql ?? null,
        provider: opts.provider ?? null,
        ...(opts.deliveryOpts !== undefined ? { deliveryOpts: opts.deliveryOpts } : {}),
        timeoutMs: opts.timeoutMs ?? null,
        onTimeout: opts.onTimeout ?? null,
      })

      if (isInfraFailure(result) && infraRetries < maxInfraRetries) {
        infraRetries++
        continue
      }
      break
    }

    /* v8 ignore next 3 -- the retry loop always assigns result before exiting */
    if (result === null) {
      throw new Error('runner: retry loop exited without a case result')
    }
    const outcome = classifyCaseOutcome(result)
    const classified: ClassifiedCaseResult = {
      caseId: case_.case_id,
      outcome,
      verdict: result.verdict,
      result,
    }
    perCase.push(classified)
    opts.onCaseComplete?.(classified, i, cases.length)
  }

  const summary = computeSummary(perCase)
  return { runId: opts.runId, timestamp, passK, perCase, summary }
}

/** Check if a case result represents an infra failure (all attempts errored, none timed out). */
function isInfraFailure(result: MultiTurnCaseResult): boolean {
  return result.attempts.every(a => a.error !== null && !a.timeout)
}

/** Compute aggregate summary from classified results. */
function computeSummary(perCase: readonly ClassifiedCaseResult[]): BatchSummary {
  let correct = 0
  let declined = 0
  let wrong = 0
  let unjudged = 0
  let totalLatencyMs = 0

  for (const c of perCase) {
    switch (c.outcome) {
      case 'correct': correct++; break
      case 'declined': declined++; break
      case 'wrong': wrong++; break
      case 'unjudged': unjudged++; break
      default: { const _exhaustive: never = c.outcome; throw new Error(`unknown outcome: ${String(_exhaustive)}`) }
    }
    totalLatencyMs += c.result.latencyMs
  }

  const totalCases = perCase.length
  const passRate = totalCases > 0 ? correct / totalCases : 0

  return { totalCases, correct, declined, wrong, unjudged, passRate, totalLatencyMs }
}
