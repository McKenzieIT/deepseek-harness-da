/**
 * Toolview presenter for `trigger_eval` tool calls. Renders eval run results
 * as a structured card in the conversation: pass rate KPI, before/after delta
 * summary, and case flip highlights.
 */
import type { FC } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SemanticLayerTranslate } from '../locales.ts'

export interface TriggerEvalMeta {
  ok: boolean
  mode: 'full_run' | 'report_last' | 'not_configured'
  runId?: string
  summary?: {
    total: number
    correct: number
    wrong: number
    declined: number
    unjudged: number
    infra_failure: number
    pass_rate: number
  }
  delta?: {
    run_a_id: string
    run_b_id: string
    flips: Array<{ case_id: string; old_verdict: string; new_verdict: string }>
    summary: { improved: number; regressed: number; unchanged: number }
  } | null
  previousRunId?: string
}

export interface TriggerEvalRowProps {
  block: ToolCallBlock
  t: SemanticLayerTranslate
}

export const TriggerEvalRow: FC<TriggerEvalRowProps> = ({ block, t }) => {
  const meta = ('kind' in block ? block.meta : undefined) as TriggerEvalMeta | undefined
  if (!meta || !meta.ok) {
    return (
      <div className="sl-trigger-eval-row sl-trigger-eval-row--error">
        <span className="sl-trigger-eval-row__icon">⚠️</span>
        <span className="sl-trigger-eval-row__text">
          {meta?.mode === 'not_configured'
            ? t('evidence.eval.notConfigured')
            : t('evidence.eval.failed')}
        </span>
      </div>
    )
  }

  if (!meta.summary) {
    return (
      <div className="sl-trigger-eval-row sl-trigger-eval-row--report">
        <span className="sl-trigger-eval-row__icon">📊</span>
        <span className="sl-trigger-eval-row__text">
          {t('evidence.eval.reportMode')} ({meta.runId?.slice(0, 8)})
        </span>
      </div>
    )
  }

  const s = meta.summary
  const passPct = (s.pass_rate * 100).toFixed(0)

  return (
    <div className="sl-trigger-eval-row">
      <div className="sl-trigger-eval-row__header">
        <span className="sl-trigger-eval-row__icon">✅</span>
        <span className="sl-trigger-eval-row__title">
          {t('evidence.eval.complete')} — {meta.runId?.slice(0, 8)}
        </span>
      </div>
      <div className="sl-trigger-eval-row__stats">
        <span className="sl-trigger-eval-row__pass-rate">{passPct}%</span>
        <span className="sl-trigger-eval-row__detail">
          {t('evidence.eval.passCount', { correct: s.correct, total: s.total })}
          {s.wrong > 0 && t('evidence.eval.failCount', { count: s.wrong })}
          {s.infra_failure > 0 && t('evidence.eval.infraFailureCount', { count: s.infra_failure })}
        </span>
      </div>
      {meta.delta && (meta.delta.summary.improved > 0 || meta.delta.summary.regressed > 0) && (
        <div className="sl-trigger-eval-row__delta">
          <span className="sl-trigger-eval-row__delta-label">
            {t('evidence.eval.versus', { run: meta.previousRunId?.slice(0, 8) ?? meta.delta.run_a_id.slice(0, 8) })}
          </span>
          {meta.delta.summary.improved > 0 && (
            <span className="sl-trigger-eval-row__improved">
              ⬆{meta.delta.summary.improved}
            </span>
          )}
          {meta.delta.summary.regressed > 0 && (
            <span className="sl-trigger-eval-row__regressed">
              ⬇{meta.delta.summary.regressed}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
