import type { FC } from 'react'
import type { EvalDeltaReport } from './types.ts'

export interface EvalDeltaViewProps {
  evalDelta: EvalDeltaReport | null
  loading: boolean
  t: (key: string) => string
}

export const EvalDeltaView: FC<EvalDeltaViewProps> = ({ evalDelta, loading, t }) => {
  if (loading && !evalDelta) {
    return (
      <div className="sl-eval-delta sl-eval-delta--loading">
        <p className="sl-eval-delta__loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!evalDelta) {
    return (
      <div className="sl-eval-delta sl-eval-delta--empty">
        <p className="sl-eval-delta__empty-text">{t('evidence.evalDelta.empty')}</p>
      </div>
    )
  }

  const { summary, flipped } = evalDelta

  return (
    <div className="sl-eval-delta">
      <h4 className="sl-eval-delta__title">{t('evidence.evalDelta.title')}</h4>
      <div className="sl-eval-delta__runs">
        <span className="sl-eval-delta__run-label">{t('evidence.evalDelta.comparing')}</span>
        <code className="sl-eval-delta__run-id">{evalDelta.runIdA.slice(0, 8)}</code>
        <span className="sl-eval-delta__arrow">→</span>
        <code className="sl-eval-delta__run-id">{evalDelta.runIdB.slice(0, 8)}</code>
      </div>
      <div className="sl-eval-delta__summary">
        <span className="sl-eval-delta__stat sl-eval-delta__stat--improved">
          ⬆ {summary.improved} {t('evidence.evalDelta.improved')}
        </span>
        <span className="sl-eval-delta__stat sl-eval-delta__stat--regressed">
          ⬇ {summary.regressed} {t('evidence.evalDelta.regressed')}
        </span>
        <span className="sl-eval-delta__stat sl-eval-delta__stat--unchanged">
          {summary.unchanged} {t('evidence.evalDelta.unchanged')}
        </span>
      </div>
      {flipped.length > 0 && (
        <ul className="sl-eval-delta__flip-list">
          {flipped.slice(0, 20).map(flip => (
            <li key={flip.caseId} className="sl-eval-delta__flip">
              <span className={`sl-eval-delta__flip-badge sl-eval-delta__flip-badge--${flip.after}`}>
                {flip.before} → {flip.after}
              </span>
              <span className="sl-eval-delta__flip-case">{flip.caseId}</span>
            </li>
          ))}
        </ul>
      )}
      {flipped.length > 20 && (
        <p className="sl-eval-delta__more">
          +{flipped.length - 20} {t('evidence.evalDelta.more')}
        </p>
      )}
    </div>
  )
}
