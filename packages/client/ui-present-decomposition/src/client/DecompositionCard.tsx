import { useState } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import clsx from 'clsx'
import css from './DecompositionCard.module.css'

export interface Metric {
  name: string
  value: string
  unit?: string
}

export interface PresentDecompositionArgs {
  summary: string
  metrics: Metric[]
  dimensions: string[]
  time_range: string
  source?: string
  filters?: string[]
  confidence?: number
}

export interface DecompositionCardProps {
  block: ToolCallBlock
}

function parseArgs(argsRaw: string): PresentDecompositionArgs | null {
  try {
    const parsed = JSON.parse(argsRaw) as PresentDecompositionArgs
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.metrics)) return null
    return parsed
  } catch {
    return null
  }
}

function isLowConfidence(confidence: number | undefined): boolean {
  return confidence !== undefined && confidence < 0.7
}

function RunningState() {
  return (
    <div className={css.card}>
      <div className={css.skeleton}>
        <div className={css.skeletonLine} style={{ width: '60%' }} />
        <div className={css.skeletonLine} style={{ width: '40%' }} />
        <div className={css.skeletonLine} style={{ width: '80%' }} />
      </div>
    </div>
  )
}

function FallbackContent({ block }: { block: ToolCallBlock & { kind: 'tool-result' } }) {
  const text = (block as unknown as { content: readonly { text?: string }[] }).content.map(c => c.text ?? '').join('\n')
  return (
    <div className={css.card}>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

export function DecompositionCard({ block }: DecompositionCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (!('kind' in block)) {
    return <RunningState />
  }

  if (block.call === null) {
    return <FallbackContent block={block} />
  }

  const args = parseArgs(block.call.argsRaw)
  if (args === null) {
    return <FallbackContent block={block} />
  }

  const lowConfidence = isLowConfidence(args.confidence)

  return (
    <div className={clsx(css.card, lowConfidence && css.lowConfidence)}>
      <button
        type="button"
        className={css.header}
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
      >
        <span className={css.chevron} data-collapsed={collapsed || undefined}>▾</span>
        <span className={css.headerTitle}>查询理解</span>
        {lowConfidence && (
          <span className={css.confidenceWarning}>理解可能不准确，请确认</span>
        )}
      </button>
      {!collapsed && (
        <div className={css.body}>
          <p className={css.summary}>{args.summary}</p>
          <div className={css.metricsRow}>
            {args.metrics.map(m => (
              <div key={m.name} className={css.metricCard}>
                <span className={css.metricValue}>{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                <span className={css.metricLabel}>{m.name}</span>
              </div>
            ))}
          </div>
          <div className={css.metaSection}>
            <div className={css.metaRow}>
              <span className={css.metaLabel}>维度</span>
              <span className={css.metaValue}>
                {args.dimensions.map(d => (
                  <span key={d} className={css.badge}>{d}</span>
                ))}
              </span>
            </div>
            <div className={css.metaRow}>
              <span className={css.metaLabel}>时间范围</span>
              <span className={css.metaValue}>{args.time_range}</span>
            </div>
            {args.source !== undefined && (
              <div className={css.metaRow}>
                <span className={css.metaLabel}>数据源</span>
                <span className={css.metaValue}>{args.source}</span>
              </div>
            )}
            {args.filters !== undefined && args.filters.length > 0 && (
              <div className={css.metaRow}>
                <span className={css.metaLabel}>筛选</span>
                <span className={css.metaValue}>
                  {args.filters.map(f => (
                    <span key={f} className={css.badge}>{f}</span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
