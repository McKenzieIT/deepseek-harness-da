import { useMemo, useRef, useState } from 'react'
import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { useVirtualizer } from '@tanstack/react-virtual'
import ChartView from './ChartView.tsx'
import css from './TableCard.module.css'

export interface KpiColumn {
  column: number
  aggregation: string
  label: string
  format?: string
}

export interface ChartConfig {
  type: 'line' | 'bar'
  x_column: number
  y_columns: number[]
}

export interface PresentTableArgs {
  result_id: string
  title: string
  columns?: string[]
  column_types?: string[]
  sort_column?: number
  kpi_columns?: KpiColumn[]
  chart?: ChartConfig
}

export interface TableCardProps {
  block: ToolCallBlock
  useSession: <T>(selector: (s: ConversationSnapshot) => T) => T
}

const MAX_DISPLAY_ROWS = 10000
const VIRTUAL_THRESHOLD = 100
const ROW_HEIGHT = 32

function parseArgs(argsRaw: string): PresentTableArgs | null {
  try {
    const parsed = JSON.parse(argsRaw) as PresentTableArgs
    if (typeof parsed.result_id !== 'string' || typeof parsed.title !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export interface TsvData {
  headers: string[]
  rows: string[][]
}

export function parseTsv(content: string): TsvData | null {
  const lines = content.split('\n').filter(l => l.trim() !== '')
  if (lines.length < 1) return null
  const lastLine = lines[lines.length - 1] as string
  const dataLines = /^\(\d+ rows?\)$/.test(lastLine.trim()) ? lines.slice(0, -1) : lines
  if (dataLines.length < 1) return null
  const headers = (dataLines[0] as string).split('\t')
  const rows = dataLines.slice(1).map(line => line.split('\t'))
  return { headers, rows }
}

function computeKpi(rows: string[][], kpi: KpiColumn): string {
  const values = rows
    .map(r => parseFloat(r[kpi.column] ?? ''))
    .filter(v => !isNaN(v))
  if (values.length === 0) return '—'
  let result: number
  switch (kpi.aggregation) {
    case 'sum': result = values.reduce((a, b) => a + b, 0); break
    case 'avg': result = values.reduce((a, b) => a + b, 0) / values.length; break
    case 'max': result = Math.max(...values); break
    case 'min': result = Math.min(...values); break
    case 'count': result = values.length; break
    default: return '—'
  }
  if (kpi.format === '%') return `${(result * 100).toFixed(1)}%`
  if (kpi.format?.startsWith(',.')) {
    const decimals = parseInt(kpi.format.slice(2, -1)) || 0
    return result.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  if (Number.isInteger(result)) return result.toLocaleString()
  return result.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function generateCsvBlob(headers: string[], rows: string[][]): string {
  const escape = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"`
    : v
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  return lines.join('\n')
}

function RunningState() {
  return (
    <div className={css.card}>
      <div className={css.skeleton}>
        <div className={css.skeletonLine} style={{ width: '50%' }} />
        <div className={css.skeletonKpiRow}>
          <div className={css.skeletonKpi} />
          <div className={css.skeletonKpi} />
          <div className={css.skeletonKpi} />
        </div>
        <div className={css.skeletonLine} style={{ width: '100%' }} />
        <div className={css.skeletonLine} style={{ width: '100%' }} />
        <div className={css.skeletonLine} style={{ width: '80%' }} />
      </div>
    </div>
  )
}

function extractText(block: ToolCallBlock): string {
  /* v8 ignore next -- defensive: callers only pass settled blocks */
  if (!('kind' in block)) return ''
  return (block.content as readonly { text?: string }[]).map(c => c.text ?? '').join('\n')
}

function FallbackContent({ block }: { block: ToolCallBlock }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

function DataExpired({ block }: { block: ToolCallBlock }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.expiredBanner}>数据已过期</div>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

function KpiCards({ kpis, rows }: { kpis: KpiColumn[]; rows: string[][] }) {
  return (
    <div className={css.kpiRow}>
      {kpis.map(kpi => (
        <div key={kpi.label} className={css.kpiCard}>
          <span className={css.kpiValue}>{computeKpi(rows, kpi)}</span>
          <span className={css.kpiLabel}>{kpi.label}</span>
        </div>
      ))}
    </div>
  )
}

function PlainTable({ headers, rows }: TsvData) {
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            {headers.map((h, i) => <th key={i} className={css.th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={css.tr}>
              {row.map((cell, ci) => <td key={ci} className={css.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VirtualTable({ headers, rows }: TsvData) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            {headers.map((h, i) => <th key={i} className={css.th}>{h}</th>)}
          </tr>
        </thead>
      </table>
      <div ref={parentRef} className={css.virtualScroll}>
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {/* v8 ignore start -- virtualizer items require real DOM dimensions unavailable in jsdom */}
          {virtualizer.getVirtualItems().map(vRow => (
            <div
              key={vRow.index}
              className={css.virtualRow}
              style={{ height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}
            >
              {(rows[vRow.index] as string[]).map((cell, ci) => (
                <span key={ci} className={css.virtualCell}>{cell}</span>
              ))}
            </div>
          ))}
          {/* v8 ignore stop */}
        </div>
      </div>
    </div>
  )
}

function CsvDownload({ headers, rows, title }: { headers: string[]; rows: string[][]; title: string }) {
  const handleClick = () => {
    const csv = generateCsvBlob(headers, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button type="button" className={css.csvButton} onClick={handleClick}>
      下载 CSV
    </button>
  )
}

export function TableCard({ block, useSession }: TableCardProps) {
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

  const seq = ('seq' in block) ? (block as { seq: number }).seq : /* v8 ignore next -- defensive: only settled blocks reach here */ 0
  return (
    <TableCardInner
      block={block} blockSeq={seq} args={args}
      useSession={useSession} collapsed={collapsed} setCollapsed={setCollapsed}
    />
  )
}

interface TableCardInnerProps {
  block: ToolCallBlock
  blockSeq: number
  args: PresentTableArgs
  useSession: <T>(selector: (s: ConversationSnapshot) => T) => T
  collapsed: boolean
  setCollapsed: (fn: (v: boolean) => boolean) => void
}

function selectQueryData(snapshot: ConversationSnapshot, blockSeq: number): string | null {
  const nodes = snapshot.nodes
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i] as (typeof nodes)[number]
    if (node.kind !== 'tool-result') continue
    if (node.seq >= blockSeq) continue
    if (node.call?.name !== 'query_data') continue
    if (node.isError) continue
    const text = (node.content as readonly { text?: string }[]).map(c => c.text ?? '').join('\n')
    if (text.trim()) return text
  }
  return null
}

function TableCardInner({ block, blockSeq, args, useSession, collapsed, setCollapsed }: TableCardInnerProps) {
  const rawTsv = useSession(s => selectQueryData(s, blockSeq))

  const data = useMemo((): TsvData | null => {
    if (rawTsv === null) return null
    const parsed = parseTsv(rawTsv)
    if (parsed === null) return null
    if (args.columns && args.columns.length > 0) {
      parsed.headers = args.columns
    }
    if (parsed.rows.length > MAX_DISPLAY_ROWS) {
      parsed.rows = parsed.rows.slice(0, MAX_DISPLAY_ROWS)
    }
    return parsed
  }, [rawTsv, args.columns])

  if (data === null) {
    return <DataExpired block={block} />
  }

  const useVirtual = data.rows.length > VIRTUAL_THRESHOLD
  const rowCount = data.rows.length

  return (
    <div className={css.card}>
      <button
        type="button"
        className={css.header}
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
      >
        <span className={css.chevron} data-collapsed={collapsed || undefined}>▾</span>
        <span className={css.headerTitle}>{args.title}</span>
        <span className={css.rowCount}>{rowCount} 行</span>
      </button>
      {args.kpi_columns && args.kpi_columns.length > 0 && (
        <KpiCards kpis={args.kpi_columns} rows={data.rows} />
      )}
      {!collapsed && (
        <div className={css.body}>
          {useVirtual
            ? <VirtualTable headers={data.headers} rows={data.rows} />
            : <PlainTable headers={data.headers} rows={data.rows} />}
          {args.chart && (
            <ChartView chart={args.chart} headers={data.headers} rows={data.rows} />
          )}
          {rawTsv !== null && data.rows.length >= MAX_DISPLAY_ROWS && (
            <CsvDownload headers={data.headers} rows={data.rows} title={args.title} />
          )}
        </div>
      )}
    </div>
  )
}
