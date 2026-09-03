/**
 * Context plugin: inject eval evidence into goal round context.
 *
 * When a goal is active and eval results exist, this plugin registers a
 * system prompt section that outputs an `<eval_evidence>` XML block. The
 * model sees this evidence and uses it to self-adjust direction or decide
 * to block.
 *
 * @module @deepseek-ai/dsh-goal-eval-context
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-goal'
import type { EvalResultStore, EvalDeltaReport } from '@deepseek-ai/dsh-evidence-query'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'goal-eval-context'
// NIT: 'goals' is not injected — the plugin only listens to the global
// `goal/changed` event (dispatched on ctx without a service handle) and reads
// `ctx.evidenceQuery` / `ctx.systemPrompt`. Cordis events are available on
// any context, so the goals service handle is not required here.
export const inject = ['evidenceQuery', 'systemPrompt']

export interface Config {
  /**
   * Number of consecutive no-improvement evaluations after which the direction
   * hint escalates to "change approach". Default 2 — the hint escalates one
   * step before the goal policy blocks the goal (policy blocks at N=3).
   */
  hintEscalationThreshold: number
}
export const Config: z<Config> = z.object({
  hintEscalationThreshold: z.number().default(2),
})

// ── Rendering types ─────────────────────────────────────────────────────

/** Input parameters for the pure render function. */
export interface EvalEvidenceParams {
  /** Whether a goal is currently active. */
  goalActive: boolean
  /** Whether the eval store has any run data. */
  hasRuns: boolean
  /** Total cases in the latest run. */
  total?: number
  /** Number of passing cases in the latest run. */
  correct?: number
  /** Pass rate as a percentage integer (0–100). */
  passRate?: number
  /** Delta report between the two most recent runs (when 2+ runs exist). */
  delta?: {
    improved: number
    regressed: number
    unchanged: number
    prevRunId: string
  }
  /** Number of consecutive evaluations without improvement. */
  consecutiveNoImprovement?: number
  /**
   * Threshold at which the direction hint escalates to "change approach".
   * Defaults to 2 when omitted. Sourced from the plugin {@link Config}.
   */
  hintEscalationThreshold?: number
}

// ── Pure rendering logic ────────────────────────────────────────────────

/**
 * Compute a rule-based direction hint from the delta data.
 * No LLM calls — pure function.
 *
 * @param hintEscalationThreshold — number of consecutive no-improvement
 *   evaluations after which the hint escalates. Defaults to 2 (the hint
 *   escalates before the goal policy blocks at N=3).
 */
export function computeDirectionHint(
  delta: EvalEvidenceParams['delta'],
  consecutiveNoImprovement: number,
  hintEscalationThreshold: number = 2,
): string {
  if (delta === undefined) {
    return 'Continue working — first delta will appear after next evaluation.'
  }
  if (delta.improved > 0) {
    return 'Progress detected — continue current approach.'
  }
  if (consecutiveNoImprovement >= hintEscalationThreshold) {
    return `No improvement detected for ${consecutiveNoImprovement} consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.`
  }
  return 'No improvement in last evaluation. Consider investigating regressed or failed cases.'
}

/**
 * Render the eval evidence block from structured parameters.
 * Returns null when the section should not be emitted.
 */
export function renderEvalEvidence(params: EvalEvidenceParams): string | null {
  if (!params.goalActive) return null

  if (!params.hasRuns) {
    return '<eval_evidence>\nNo evaluation data yet. Consider triggering an evaluation to measure current quality.\n</eval_evidence>'
  }

  const { total, correct, passRate, delta, consecutiveNoImprovement, hintEscalationThreshold } = params

  if (delta !== undefined) {
    // Multiple runs — show delta
    const direction = computeDirectionHint(delta, consecutiveNoImprovement ?? 0, hintEscalationThreshold)
    return '<eval_evidence>\n'
      + `Pass rate: ${correct}/${total} (${passRate}%)\n`
      + `Last delta: +${delta.improved} improved, -${delta.regressed} regressed, ${delta.unchanged} unchanged (vs run ${delta.prevRunId})\n`
      + `Consecutive evaluations without improvement: ${consecutiveNoImprovement ?? 0}\n`
      + `Direction: ${direction}\n`
      + '</eval_evidence>'
  }

  // Single run — baseline only
  return '<eval_evidence>\n'
    + `Pass rate: ${correct}/${total} (${passRate}%)\n`
    + 'Baseline established. Next evaluation will show improvement delta.\n'
    + `Direction: ${computeDirectionHint(undefined, 0)}\n`
    + '</eval_evidence>'
}

// ── Evidence computation ────────────────────────────────────────────────

/**
 * Count consecutive evaluations without improvement by walking back
 * through run pairs from the latest.
 *
 * WARN 13 (intentional divergence): this context plugin walks the GLOBAL
 * historical run sequence (every run pair in the eval store), whereas the
 * goal-blocking policy tracks only its own triggers. The two counts can
 * differ — that is by design: the context surface shows the model the full
 * historical view so it can self-adjust, while the policy enforces a
 * per-goal, per-trigger counter that gates round advancement. Keeping the
 * two counters separate avoids the context accidentally shadowing policy
 * state.
 */
export function computeConsecutiveNoImprovement(
  runIds: string[],
  beforeAfterDelta: (runIdA: string, runIdB: string) => EvalDeltaReport,
): number {
  if (runIds.length < 2) return 0
  let count = 0
  for (let i = runIds.length - 1; i >= 1; i--) {
    const delta = beforeAfterDelta(runIds[i - 1] ?? '', runIds[i] ?? '')
    if (delta.summary.improved === 0) {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * Build the EvalEvidenceParams from live service state.
 */
export function buildEvalEvidenceParams(
  goalActive: boolean,
  store: EvalResultStore,
  beforeAfterDelta: (runIdA: string, runIdB: string) => EvalDeltaReport,
): EvalEvidenceParams {
  if (!goalActive) return { goalActive: false, hasRuns: false }

  const runIds = store.getRunIds()
  if (runIds.length === 0) return { goalActive: true, hasRuns: false }

  const latestRunId = runIds[runIds.length - 1] ?? ''
  const latestRecords = store.getByRunId(latestRunId)
  const total = latestRecords.length
  const correct = latestRecords.filter(r => r.status === 'pass').length
  const passRate = total > 0 ? Math.round((correct / total) * 100) : 0

  if (runIds.length < 2) {
    return { goalActive: true, hasRuns: true, total, correct, passRate }
  }

  const prevRunId = runIds[runIds.length - 2] ?? ''
  const deltaReport = beforeAfterDelta(prevRunId, latestRunId)
  const consecutiveNoImprovement = computeConsecutiveNoImprovement(runIds, beforeAfterDelta)

  return {
    goalActive: true,
    hasRuns: true,
    total,
    correct,
    passRate,
    delta: {
      improved: deltaReport.summary.improved,
      regressed: deltaReport.summary.regressed,
      unchanged: deltaReport.summary.unchanged,
      prevRunId,
    },
    consecutiveNoImprovement,
  }
}

// ── Plugin apply ────────────────────────────────────────────────────────

/**
 * Register the eval-evidence system prompt section.
 *
 * Tracks goal activity via `goal/changed` events (no agent reference needed
 * in the text function). When loaded in a scoped agent context (via preset),
 * the section participates only in that agent's prompt assembly.
 */
export function apply(ctx: Context, config: Config): void {
  let goalActive = false
  const hintEscalationThreshold = config.hintEscalationThreshold

  ctx.on('goal/changed', ({ change }) => {
    if (change.operation === 'clear') {
      goalActive = false
      return
    }
    if (change.goal) {
      goalActive = change.goal.phase === 'active'
    }
  })

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'eval-evidence',
    order: 50,
    text: () => {
      const store = ctx.evidenceQuery.getEvalStore()
      const params = buildEvalEvidenceParams(
        goalActive,
        store,
        (a, b) => ctx.evidenceQuery.beforeAfterDelta(a, b),
      )
      return renderEvalEvidence({ ...params, hintEscalationThreshold }) ?? ''
    },
  }), 'goal-eval-context: eval-evidence section')
}
