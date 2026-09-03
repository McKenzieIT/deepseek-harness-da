import type { FC } from 'react'
import type { EvalResultQueryResult } from './types.ts'

export interface EvalTrajectoryProps {
  evalResults: EvalResultQueryResult | null
  loading: boolean
  t: (key: string) => string
}

const STATUS_CLASS: Record<string, string> = {
  pass: 'sl-eval-trajectory__dot--pass',
  fail: 'sl-eval-trajectory__dot--fail',
  error: 'sl-eval-trajectory__dot--error',
  pending: 'sl-eval-trajectory__dot--pending',
}

export const EvalTrajectory: FC<EvalTrajectoryProps> = ({ evalResults, loading, t }) => {
  if (loading && !evalResults) {
    return (
      <div className="sl-eval-trajectory sl-eval-trajectory--loading">
        <p className="sl-eval-trajectory__loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!evalResults || evalResults.results.length === 0) {
    return (
      <div className="sl-eval-trajectory sl-eval-trajectory--empty">
        <p className="sl-eval-trajectory__empty-text">{t('evidence.eval.noResults')}</p>
      </div>
    )
  }

  const counts = { pass: 0, fail: 0, error: 0, pending: 0 }
  for (const r of evalResults.results) {
    counts[r.status]++
  }
  const passRate = evalResults.total > 0
    ? Math.round((counts.pass / evalResults.total) * 100)
    : 0

  return (
    <div className="sl-eval-trajectory">
      <h4 className="sl-eval-trajectory__title">{t('evidence.eval.title')}</h4>
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
      <div className="sl-eval-trajectory__timeline">
        {evalResults.results.map(result => (
          <div
            key={result.id}
            className={`sl-eval-trajectory__dot ${STATUS_CLASS[result.status] ?? ''}`}
            title={`${result.caseId}: ${result.status}${result.score !== undefined ? ` (${result.score})` : ''} — ${result.timestamp}`}
          />
        ))}
      </div>
      <ul className="sl-eval-trajectory__list">
        {evalResults.results.slice(0, 10).map(result => (
          <li key={result.id} className="sl-eval-trajectory__item">
            <span className={`sl-eval-trajectory__status-badge sl-eval-trajectory__status-badge--${result.status}`}>
              {result.status}
            </span>
            <span className="sl-eval-trajectory__case-id">{result.caseId}</span>
            <span className="sl-eval-trajectory__timestamp">{formatTimestamp(result.timestamp)}</span>
            {result.score !== undefined && (
              <span className="sl-eval-trajectory__score">{result.score.toFixed(2)}</span>
            )}
          </li>
        ))}
      </ul>
      {evalResults.total > 10 && (
        <p className="sl-eval-trajectory__more">
          +{evalResults.total - 10} {t('evidence.eval.more')}
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
