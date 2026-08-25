import type { FC } from 'react'
import type { EnrichedCoverageStats } from './types.ts'

export interface CoveragePanelProps {
  coverage: EnrichedCoverageStats | null
  loading: boolean
  t: (key: string) => string
}

export const CoveragePanel: FC<CoveragePanelProps> = ({ coverage, loading, t }) => {
  if (loading && !coverage) {
    return (
      <div className="sl-coverage-panel sl-coverage-panel--loading">
        <p className="sl-coverage-panel__loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!coverage) {
    return (
      <div className="sl-coverage-panel sl-coverage-panel--empty">
        <p className="sl-coverage-panel__empty-text">{t('evidence.coverage.empty')}</p>
      </div>
    )
  }

  const total = coverage.table_count + coverage.event_count + coverage.metric_count
  const confirmedPct = total > 0
    ? Math.round((coverage.confirmation.confirmed / total) * 100)
    : 0

  return (
    <div className="sl-coverage-panel">
      <h4 className="sl-coverage-panel__title">{t('evidence.coverage.title')}</h4>
      <div className="sl-coverage-panel__kpi-row">
        <div className="sl-coverage-panel__kpi">
          <span className="sl-coverage-panel__kpi-value">{total}</span>
          <span className="sl-coverage-panel__kpi-label">{t('evidence.coverage.total')}</span>
        </div>
        <div className="sl-coverage-panel__kpi">
          <span className="sl-coverage-panel__kpi-value">{coverage.table_count}</span>
          <span className="sl-coverage-panel__kpi-label">{t('evidence.coverage.tables')}</span>
        </div>
        <div className="sl-coverage-panel__kpi">
          <span className="sl-coverage-panel__kpi-value">{coverage.event_count}</span>
          <span className="sl-coverage-panel__kpi-label">{t('evidence.coverage.events')}</span>
        </div>
        <div className="sl-coverage-panel__kpi">
          <span className="sl-coverage-panel__kpi-value">{coverage.metric_count}</span>
          <span className="sl-coverage-panel__kpi-label">{t('evidence.coverage.metrics')}</span>
        </div>
      </div>
      <div className="sl-coverage-panel__status-row">
        <span className="sl-coverage-panel__confirmed">
          {coverage.confirmation.confirmed} {t('evidence.coverage.confirmed')}
        </span>
        <span className="sl-coverage-panel__draft">
          {coverage.confirmation.draft} {t('evidence.coverage.draft')}
        </span>
        <span className="sl-coverage-panel__pct">{confirmedPct}%</span>
      </div>
    </div>
  )
}
