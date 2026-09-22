import type { FC } from 'react'
import type { EvalRunHistoryResult } from './types.ts'

/** Maximum complete runs loaded and presented by the evidence history views. */
export const EVAL_TRAJECTORY_RUN_LIMIT = 10

export interface EvalTrajectoryProps {
  evalHistory: EvalRunHistoryResult | null
  loading: boolean
  t: (key: string) => string
}

export const EvalTrajectory: FC<EvalTrajectoryProps> = ({ evalHistory, loading, t }) => {
  if (loading && !evalHistory) {
    return (
      <div className="sl-eval-trajectory sl-eval-trajectory--loading">
        <p className="sl-eval-trajectory__loading-text">{t('loading')}</p>
      </div>
    )
  }

  const runs = evalHistory?.runs ?? []
  if (!evalHistory || runs.length === 0) {
    return (
      <div className="sl-eval-trajectory sl-eval-trajectory--empty">
        {evalHistory?.assetFilterStatus === 'unavailable' && (
          <p className="sl-eval-trajectory__filter-unavailable">
            {t('evidence.eval.assetFilterUnavailable')}
          </p>
        )}
        <p className="sl-eval-trajectory__empty-text">{t('evidence.eval.noResults')}</p>
      </div>
    )
  }

  const counts = { pass: 0, fail: 0, error: 0, pending: 0, total: 0 }
  for (const run of runs) {
    counts.pass += run.pass
    counts.fail += run.fail
    counts.error += run.error
    counts.pending += run.pending
    counts.total += run.total
  }
  const omittedRuns = Math.max(0, evalHistory.total - runs.length)
  const passRate = counts.total > 0
    ? Math.round((counts.pass / counts.total) * 100)
    : 0

  return (
    <div className="sl-eval-trajectory">
      <h4 className="sl-eval-trajectory__title">{t('evidence.eval.title')}</h4>
      {evalHistory.assetFilterStatus === 'unavailable' && (
        <p className="sl-eval-trajectory__filter-unavailable">
          {t('evidence.eval.assetFilterUnavailable')}
        </p>
      )}
      <div className="sl-eval-trajectory__summary">
        <span className="sl-eval-trajectory__stat sl-eval-trajectory__stat--pass">
          {counts.pass} {t('evidence.eval.pass')}
        </span>
        <span className="sl-eval-trajectory__stat sl-eval-trajectory__stat--fail">
          {counts.fail} {t('evidence.eval.fail')}
        </span>
        <span className="sl-eval-trajectory__stat sl-eval-trajectory__stat--error">
          {counts.error} {t('evidence.eval.error')}
        </span>
        <span className="sl-eval-trajectory__rate">
          {passRate}% {t('evidence.eval.passRate')}
        </span>
      </div>
      <ul className="sl-eval-trajectory__list">
        {runs.slice(0, EVAL_TRAJECTORY_RUN_LIMIT).map(run => (
          <li key={run.runId} className="sl-eval-trajectory__item">
            <code className="sl-eval-trajectory__run-id">{run.runId}</code>
            <span className="sl-eval-trajectory__run-result">
              {run.pass}/{run.total} {t('evidence.eval.pass')}
            </span>
            <span className="sl-eval-trajectory__timestamp">{formatTimestamp(run.timestamp)}</span>
          </li>
        ))}
      </ul>
      {omittedRuns > 0 && (
        <p className="sl-eval-trajectory__more">
          +{omittedRuns} {t('evidence.eval.more')}
        </p>
      )}
    </div>
  )
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}
