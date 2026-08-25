import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
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
}

export function GetCoverageRow({ block, inspect }: GetCoverageRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>Loading coverage...</span>
        <span className={css.running}>running</span>
      </div>
    )
  }

  const meta = block.meta as CoverageMeta | undefined
  if (!meta?.ok || !meta.stats) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>Coverage</span>
        <span className={css.summary}>{meta?.message ?? 'unavailable'}</span>
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
        <span className={css.title}>Coverage Statistics</span>
        <span className={css.summary}>{total} assets</span>
      </div>
      <div className={css.kpiRow}>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.table_count}</span>
          <span className={css.kpiLabel}>Tables</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.event_count}</span>
          <span className={css.kpiLabel}>Events</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.metric_count}</span>
          <span className={css.kpiLabel}>Metrics</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.confirmed_count}</span>
          <span className={css.kpiLabel}>Confirmed</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiValue}>{s.draft_count}</span>
          <span className={css.kpiLabel}>Draft</span>
        </div>
        {domainCount > 0 && (
          <div className={css.kpiCard}>
            <span className={css.kpiValue}>{domainCount}</span>
            <span className={css.kpiLabel}>Domains</span>
          </div>
        )}
      </div>
    </div>
  )
}
