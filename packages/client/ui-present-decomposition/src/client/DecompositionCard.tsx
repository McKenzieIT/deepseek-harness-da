import { useState, type ReactElement } from 'react'
import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import clsx from 'clsx'
import css from './DecompositionCard.module.css'
import type { DecompositionKey } from './locales.ts'

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
  useSession: <S>(sel: (s: ConversationSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  t: (key: DecompositionKey) => string
}

/** argsRaw after defensive normalization: every field present and typed. */
interface NormalizedArgs {
  summary: string
  metrics: Metric[]
  dimensions: string[]
  time_range: string
  source?: string
  filters: string[]
  confidence?: number
}

const LOW_CONFIDENCE = 0.7

/**
 * Parse argsRaw defensively (R9-B2): every field is validated and normalized
 * so a malformed payload degrades to the text fallback instead of throwing
 * inside render. Duplicate-safe composite keys everywhere (suggestion-audit
 * B1 lesson).
 */
function parseArgs(argsRaw: string): NormalizedArgs | null {
  try {
    const parsed = JSON.parse(argsRaw) as Partial<PresentDecompositionArgs> | null
    if (parsed === null || typeof parsed !== 'object') return null
    if (typeof parsed.summary !== 'string' || parsed.summary === '') return null
    if (!Array.isArray(parsed.metrics)) return null
    const metrics: Metric[] = []
    for (const item of parsed.metrics as unknown[]) {
      if (typeof item !== 'object' || item === null) continue
      const m = item as Partial<Metric>
      if (typeof m.name !== 'string' || m.name === '') continue
      const unit = typeof m.unit === 'string' && m.unit !== '' ? m.unit : undefined
      metrics.push({
        name: m.name,
        value: typeof m.value === 'string' ? m.value : '',
        ...(unit !== undefined ? { unit } : {}),
      })
    }
    if (metrics.length === 0) return null
    const source = typeof parsed.source === 'string' && parsed.source !== '' ? parsed.source : undefined
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : undefined
    return {
      summary: parsed.summary,
      metrics,
      dimensions: Array.isArray(parsed.dimensions)
        ? parsed.dimensions.filter((d): d is string => typeof d === 'string')
        : [],
      time_range: typeof parsed.time_range === 'string' ? parsed.time_range : '',
      filters: Array.isArray(parsed.filters)
        ? parsed.filters.filter((f): f is string => typeof f === 'string')
        : [],
      ...(source !== undefined ? { source } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    }
  } catch {
    return null
  }
}

/** Whether the block belongs to the turn the conversation is still on. */
function isLatestTurn(block: ToolCallBlock, snapshot: ConversationSnapshot): boolean {
  if (!('kind' in block)) return true
  const turnOrder = snapshot.chat.timeline.turnOrder
  if (turnOrder.length === 0) return true
  const latestTurn = turnOrder[turnOrder.length - 1] as number
  const timing = snapshot.turnTimings.get(latestTurn)
  if (!timing) return true
  return block.time >= timing.startTime
}

function contentText(block: ToolCallBlock & { kind: 'tool-result' }): string {
  return (block as unknown as { content: readonly { text?: string }[] }).content.map(c => c.text ?? '').join('\n').trim()
}

function interpolate(template: string, value: string): string {
  return template.replace('{value}', value).replace('{count}', value)
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
  const text = contentText(block)
  return (
    <div className={css.card}>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

function ErrorState({ block, t }: { block: ToolCallBlock & { kind: 'tool-result' }; t: DecompositionCardProps['t'] }) {
  const detail = contentText(block)
  return (
    <div className={css.card}>
      <div className={css.error} role="alert">
        <div className={css.errorTitle}>{t('error')}</div>
        {detail !== '' && <div className={css.errorDetail}>{detail}</div>}
        <div className={css.errorHint}>{t('errorHint')}</div>
      </div>
    </div>
  )
}

/** One lineage segment: a micro label plus plain values or typed chips. */
function LineageSegment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className={css.lineageSegment}>
      <span className={css.lineageLabel}>{label}</span>
      {children}
    </span>
  )
}

/** Collapsed focal tail: time + dimensions + metric names, all capped at
 *  three with a "+N" overflow chip — real payloads may omit dimensions
 *  entirely (null), so metric names carry the caliber recall alone. */
function MiniLine({ args }: { args: PresentDecompositionArgs }) {
  const chips: ReactElement[] = []
  if (args.time_range !== '') {
    chips.push(<span key="time" className={css.chip}>{args.time_range}</span>)
  }
  args.dimensions.slice(0, 3).forEach((d, i) => {
    chips.push(<span key={`dim-${i}`} className={clsx(css.chip, css.chipDimension)} title={d}>{d}</span>)
  })
  if (args.dimensions.length > 3) {
    chips.push(<span key="dim-more" className={clsx(css.chip, css.chipMore)}>+{args.dimensions.length - 3}</span>)
  }
  args.metrics.slice(0, 3).forEach((m, i) => {
    chips.push(<span key={`met-${i}`} className={clsx(css.chip, css.chipMetric)} title={m.value !== '' ? m.value : m.name}>{m.name}</span>)
  })
  if (args.metrics.length > 3) {
    chips.push(<span key="met-more" className={clsx(css.chip, css.chipMore)}>+{args.metrics.length - 3}</span>)
  }
  return <div className={css.miniLine}>{chips}</div>
}

/**
 * Query-understanding card (P1 verdict): the card is the query's contract,
 * not a result card. Focal line (summary as the title, confidence badge
 * always visible, survives collapsing) → lineage chips row (time, dimensions,
 * filters, source on one line) → metrics grid with calibers always visible
 * in auto-filling columns → trust band (low-confidence warning, error row).
 */
export function DecompositionCard({ block, useSession, t }: DecompositionCardProps) {
  // Toggled state wins once the user interacts; until then the card collapses
  // itself on turns the conversation has moved past (P1 Phase 2).
  const [toggled, setToggled] = useState<boolean | null>(null)
  const isLatest = useSession(snapshot => isLatestTurn(block, snapshot))
  const collapsed = toggled ?? !isLatest

  if (!('kind' in block)) {
    return <RunningState />
  }

  if (block.isError) {
    return <ErrorState block={block} t={t} />
  }

  if (block.call === null) {
    return <FallbackContent block={block} />
  }

  const args = parseArgs(block.call.argsRaw)
  if (args === null) {
    return <FallbackContent block={block} />
  }

  const lowConfidence = args.confidence !== undefined && args.confidence < LOW_CONFIDENCE
  const confidenceBadge = args.confidence !== undefined
    ? interpolate(lowConfidence ? t('confidenceLow') : t('confidence'), args.confidence.toFixed(2))
    : null

  return (
    <div className={clsx(css.card, lowConfidence && css.lowConfidence)}>
      <button
        type="button"
        className={css.header}
        onClick={() => { setToggled(!collapsed) }}
        aria-expanded={!collapsed}
      >
        <span className={css.chevron} data-collapsed={collapsed || undefined}>▾</span>
        <span className={css.headerMain}>
          <span className={css.eyebrow}>{t('cardTitle')}</span>
          <span className={css.title} title={args.summary}>{args.summary}</span>
        </span>
        {confidenceBadge !== null && (
          <span className={clsx(css.confidence, lowConfidence && css.confidenceLow)}>{confidenceBadge}</span>
        )}
      </button>
      {collapsed
        ? <MiniLine args={args} />
        : (
          <div className={css.body}>
            {(args.time_range !== '' || args.dimensions.length > 0 || args.filters.length > 0 || args.source !== undefined) && (
              <div className={css.lineage}>
                {args.time_range !== '' && (
                  <LineageSegment label={t('timeLabel')}>
                    <span className={css.lineageValue}>{args.time_range}</span>
                  </LineageSegment>
                )}
                {args.dimensions.length > 0 && (
                  <LineageSegment label={t('dimensionLabel')}>
                    {args.dimensions.map((d, i) => (
                      <span key={`dim-${i}`} className={clsx(css.chip, css.chipDimension)} title={d}>{d}</span>
                    ))}
                  </LineageSegment>
                )}
                {args.filters.length > 0 && (
                  <LineageSegment label={t('filterLabel')}>
                    {args.filters.map((f, i) => (
                      <span key={`filter-${i}`} className={clsx(css.chip, css.chipFilter)} title={f}>{f}</span>
                    ))}
                  </LineageSegment>
                )}
                {args.source !== undefined && (
                  <LineageSegment label={t('sourceLabel')}>
                    <span className={clsx(css.chip, css.chipSource)} title={args.source}>{args.source}</span>
                  </LineageSegment>
                )}
              </div>
            )}
            <div className={css.metrics}>
              <div className={css.metricsCaption}>{interpolate(t('metricsCaption'), String(args.metrics.length))}</div>
              <div className={css.metricsGrid}>
                {args.metrics.map((m, i) => (
                  <div key={`${m.name}-${i}`} className={css.metricCell}>
                    <div className={css.metricTop}>
                      <span className={css.metricName} title={m.name}>{m.name}</span>
                      {m.unit !== undefined && <span className={css.metricUnit}>{m.unit}</span>}
                    </div>
                    {m.value !== '' && <div className={css.metricExpr} title={m.value}>{m.value}</div>}
                  </div>
                ))}
              </div>
            </div>
            {lowConfidence && (
              <div className={css.warningLine}>
                <span aria-hidden="true">⚠</span>
                <span>{t('warning')}</span>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
