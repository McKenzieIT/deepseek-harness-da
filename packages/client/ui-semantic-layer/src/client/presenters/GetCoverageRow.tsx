import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SemanticLayerTranslate } from '../locales.ts'
import css from './presenters.module.css'

interface CoverageStats {
  table_count: number
  event_count: number
  metric_count: number
  confirmed_count: number
  draft_count: number
  domain_counts: Record<string, number>
}

interface CoverageMeta {
  ok: boolean
  stats?: CoverageStats
  message?: string
}

export interface GetCoverageRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
  t: SemanticLayerTranslate
}

export function GetCoverageRow({ block, inspect, t }: GetCoverageRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.coverage.loading')}</span>
        <span className={css.running}>{t('presenter.running')}</span>
      </div>
    )
  }

  const meta = block.meta as CoverageMeta | undefined
  if (!meta?.ok || !meta.stats) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.coverage.title')}</span>
        <span className={css.summary}>{meta?.message ?? t('presenter.unavailable')}</span>
      </div>
    )
  }

  const s = meta.stats
  const total = s.table_count + s.event_count + s.metric_count
  const domainCount = Object.keys(s.domain_counts).length

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.coverage.title')}</span>
        <span className={css.summary}>{t('presenter.coverage.assets', { count: total })}</span>
      </div>
      <div className={css.kpiRow}>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.table_count}</span>
          <span className={css.kpiLabel}>{t('presenter.coverage.tables')}</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.event_count}</span>
          <span className={css.kpiLabel}>{t('presenter.coverage.events')}</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.metric_count}</span>
          <span className={css.kpiLabel}>{t('presenter.coverage.metrics')}</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.confirmed_count}</span>
          <span className={css.kpiLabel}>{t('presenter.coverage.confirmed')}</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.draft_count}</span>
          <span className={css.kpiLabel}>{t('presenter.coverage.draft')}</span>
        </div>
        {domainCount > 0 && (
          <div className={css.kpiCard}>
            <span className={css.kpiValue}>{domainCount}</span>
            <span className={css.kpiLabel}>{t('presenter.coverage.domains')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
