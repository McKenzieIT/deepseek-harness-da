/**
 * Model-facing `trigger_eval` tool — triggers an eval run against the data
 * agent's case set, persists results, and reports before/after delta.
 *
 * Progressive behavior:
 * - When `ctx.evalRunner` is mounted: runs full batch (health-gate → run → persist → delta)
 * - When only results directory has past runs: reports last run info
 * - When nothing is available: reports configuration status
 *
 * @module @deepseek-ai/dsh-tool-trigger-eval
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult, JsonValue } from '@deepseek-ai/dsh-tools'
import type { RunResult, RunSummary, DeltaReport } from '@deepseek-ai/dsh-eval-runner'

export const name = 'tool-trigger-eval'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

/** The Cordis service seam for eval execution. */
export interface EvalRunnerService {
  runBatch(options?: { runId?: string; skipHealthGate?: boolean }): Promise<RunResult>
  getLastRun(): RunResult | null
  getLastTwoRuns(): [RunResult, RunResult] | null
  computeDelta(runA: RunResult, runB: RunResult): DeltaReport
  getCaseCount(): number
  getResultsDir(): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    evalRunner?: EvalRunnerService
  }
}

export interface TriggerEvalResult {
  readonly ok: boolean
  readonly mode: 'full_run' | 'report_last' | 'not_configured'
  readonly runId: string | null
  readonly summary: RunSummary | null
  readonly delta: DeltaReport | null
  readonly caseCount: number
  readonly message: string | null
  readonly previousRunId: string | null
}

export function formatTriggerEval(value: TriggerEvalResult): string {
  if (!value.ok) return value.message ?? 'trigger_eval failed'

  const lines: string[] = []

  if (value.mode === 'full_run') {
    lines.push(`Eval run completed: ${value.runId}`)
    if (value.summary) {
      const s = value.summary
      lines.push(`Results: ${s.correct}/${s.total} correct (${(s.pass_rate * 100).toFixed(1)}% pass rate)`)
      if (s.wrong > 0) lines.push(`  Wrong: ${s.wrong}`)
      if (s.declined > 0) lines.push(`  Declined: ${s.declined}`)
      if (s.infra_failure > 0) lines.push(`  Infra failures: ${s.infra_failure}`)
    }
  } else if (value.mode === 'report_last') {
    lines.push(`Last eval run: ${value.runId}`)
    if (value.summary) {
      const s = value.summary
      lines.push(`Results: ${s.correct}/${s.total} correct (${(s.pass_rate * 100).toFixed(1)}% pass rate)`)
    }
  } else {
    lines.push(value.message ?? 'Eval runner not configured')
    return lines.join('\n')
  }

  if (value.delta) {
    const d = value.delta.summary
    lines.push(`\nDelta vs previous (${value.previousRunId ?? value.delta.run_a_id}):`)
    lines.push(`  Improved: ${d.improved} | Regressed: ${d.regressed} | Unchanged: ${d.unchanged}`)
    if (value.delta.flips.length > 0) {
      lines.push('  Flips:')
      for (const f of value.delta.flips.slice(0, 10)) {
        const arrow = f.old_verdict === 'correct' ? '⬇' : '⬆'
        lines.push(`    ${arrow} ${f.case_id}: ${f.old_verdict} → ${f.new_verdict}`)
      }
      if (value.delta.flips.length > 10) {
        lines.push(`    ... +${value.delta.flips.length - 10} more`)
      }
    }
  }

  return lines.join('\n')
}

/** Project TriggerEvalResult into a JsonValue-compatible record for persistence. */
export function projectMeta(v: TriggerEvalResult): { [key: string]: JsonValue } {
  const meta: { [key: string]: JsonValue } = {
    ok: v.ok,
    mode: v.mode,
    runId: v.runId,
    caseCount: v.caseCount,
    message: v.message,
    previousRunId: v.previousRunId,
  }
  if (v.summary) {
    meta.summary = {
      total: v.summary.total,
      correct: v.summary.correct,
      wrong: v.summary.wrong,
      declined: v.summary.declined,
      unjudged: v.summary.unjudged,
      infra_failure: v.summary.infra_failure,
      pass_rate: v.summary.pass_rate,
    }
  } else {
    meta.summary = null
  }
  if (v.delta) {
    meta.delta = {
      run_a_id: v.delta.run_a_id,
      run_b_id: v.delta.run_b_id,
      flips: v.delta.flips.map(f => ({
        case_id: f.case_id,
        old_verdict: f.old_verdict,
        new_verdict: f.new_verdict,
      })),
      summary: {
        improved: v.delta.summary.improved,
        regressed: v.delta.summary.regressed,
        unchanged: v.delta.summary.unchanged,
      },
    }
  } else {
    meta.delta = null
  }
  return meta
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'trigger_eval',
    description:
      'Trigger a semantic layer eval run to measure data agent quality. '
      + 'Runs the full case set, reports pass rate, and compares against '
      + 'the previous run (before/after delta showing which cases improved '
      + 'or regressed). Use after making changes to assess impact.',
    parameters: {
      skip_health_gate: {
        type: 'boolean',
        description: 'Skip the pre-flight health check (use when debugging connectivity issues)',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          mode: { type: 'string', required: true },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatTriggerEval(value as unknown as TriggerEvalResult) }],
      presentationMeta: (_args, value) => {
        const v = value as unknown as TriggerEvalResult
        return projectMeta(v)
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('trigger_eval aborted')

      const evalRunner = ctx.get('evalRunner') as EvalRunnerService | undefined

      // Full run mode: eval runner service is available
      if (evalRunner) {
        const runId = randomUUID()
        const previousRun = evalRunner.getLastRun()

        const result = await evalRunner.runBatch({
          runId,
          skipHealthGate: args.skip_health_gate ?? false,
        })

        let delta: DeltaReport | null = null
        if (previousRun) {
          delta = evalRunner.computeDelta(previousRun, result)
        }

        return {
          ok: true,
          mode: 'full_run',
          runId: result.run_id,
          summary: result.summary,
          delta,
          caseCount: result.cases.length,
          message: null,
          previousRunId: previousRun?.run_id ?? null,
        } as unknown as TriggerEvalResult
      }

      // Report-last mode: no runner but past results exist via evidenceQuery
      const evidenceQuery = ctx.get('evidenceQuery') as { getEvalStore(): { getRunIds(): string[] } } | undefined
      if (evidenceQuery) {
        const store = evidenceQuery.getEvalStore()
        const runIds = store.getRunIds()
        if (runIds.length > 0) {
          return {
            ok: true,
            mode: 'report_last',
            runId: runIds[runIds.length - 1] ?? null,
            summary: null,
            delta: null,
            caseCount: 0,
            message: `Eval runner not wired (collaborators not configured). ${runIds.length} past run(s) available via evidence-query. Configure the eval runner service to trigger new runs.`,
            previousRunId: null,
          } as unknown as TriggerEvalResult
        }
      }

      // Not configured mode
      return {
        ok: false,
        mode: 'not_configured',
        runId: null,
        summary: null,
        delta: null,
        caseCount: 0,
        message: 'Eval runner service (ctx.evalRunner) is not mounted. The host composition must wire AgentResponder + QueryExecutor + JudgeExecutor collaborators to enable eval runs.',
        previousRunId: null,
      } as unknown as TriggerEvalResult
    },
    presentCall(): GenericCallView {
      return {
        card: 'generic',
        title: 'Trigger Eval Run',
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as Record<string, unknown> | undefined
      if (!meta) return { card: 'generic', title: 'Eval result unavailable' }

      if (meta.mode === 'not_configured') {
        return { card: 'generic', title: 'Eval runner not configured' }
      }

      const summary = meta.summary as RunSummary | null | undefined
      if (!summary) {
        return { card: 'generic', title: `Eval: ${String(meta.mode)}` }
      }

      const passPct = (summary.pass_rate * 100).toFixed(0)
      let title = `${passPct}% pass rate · ${summary.correct}/${summary.total} correct`

      const delta = meta.delta as DeltaReport | null | undefined
      if (delta) {
        const d = delta.summary
        if (d.improved > 0 || d.regressed > 0) {
          title += ` · ${d.improved}⬆ ${d.regressed}⬇`
        }
      }

      return { card: 'generic', title }
    },
  }))
}
