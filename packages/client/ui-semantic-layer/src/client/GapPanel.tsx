import type { FC } from 'react'
import type { GapAnalysisResult } from './types.ts'

export interface GapPanelProps {
  gapAnalysis: GapAnalysisResult | null
  loading: boolean
  t: (key: string) => string
}

export const GapPanel: FC<GapPanelProps> = ({ gapAnalysis, loading, t }) => {
  if (loading && !gapAnalysis) {
    return (
      <div className="sl-gap-panel sl-gap-panel--loading">
        <p className="sl-gap-panel__loading-text">{t('loading')}</p>
      </div>
    )
  }

  if (!gapAnalysis) {
    return (
      <div className="sl-gap-panel sl-gap-panel--empty">
        <p className="sl-gap-panel__empty-text">{t('evidence.gap.empty')}</p>
      </div>
    )
  }

  if (gapAnalysis.gaps.length === 0) {
    return (
      <div className="sl-gap-panel sl-gap-panel--no-gaps">
        <p className="sl-gap-panel__text">{t('evidence.gap.noGaps')}</p>
      </div>
    )
  }

  return (
    <div className="sl-gap-panel">
      <h4 className="sl-gap-panel__title">{t('evidence.gap.title')}</h4>
      <p className="sl-gap-panel__source">
        {t('evidence.gap.from')} <code>{gapAnalysis.sourceAssetId}</code>
      </p>
      <ul className="sl-gap-panel__list">
        {gapAnalysis.gaps.slice(0, 15).map(gap => (
          <li key={gap.assetId} className="sl-gap-panel__item">
            <span className="sl-gap-panel__asset">{gap.assetId}</span>
            <span className="sl-gap-panel__path">
              {gap.joinPath.join(' → ')}
            </span>
          </li>
        ))}
      </ul>
      {gapAnalysis.gaps.length > 15 && (
        <p className="sl-gap-panel__more">
          +{gapAnalysis.gaps.length - 15} {t('evidence.gap.more')}
        </p>
      )}
    </div>
  )
}
