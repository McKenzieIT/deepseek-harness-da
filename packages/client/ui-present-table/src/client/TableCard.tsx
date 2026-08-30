import { Suspense, lazy, useMemo, useRef, useState } from 'react'
import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { TableKey } from './locales.ts'
import css from './TableCard.module.css'

const ChartView = lazy(() => import('./ChartView.tsx'))

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
  useSession: <T>(selector: (s: ConversationSnapshot) => T, eq?: (a: T, b: T) => boolean) => T
  t: (key: TableKey) => string
}

const MAX_DISPLAY_ROWS = 10000
const VIRTUAL_THRESHOLD = 100
const ROW_HEIGHT = 32
/** How many recent query_data nodes to inspect when binding by result_id. */
const MAX_CANDIDATES = 6

function parseArgs(argsRaw: string): PresentTableArgs | null {
  try {
    const parsed = JSON.parse(argsRaw) as PresentTableArgs
    if (typeof parsed.result_id !== 'string' || typeof parsed.title !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * One `query_data` node's render text parsed back into shape. Mirrors
 * `renderCompleted` in dsh-query-tool: an optional `result_id: <id>` first
 * line, a header line, data rows, optional elision markers, and a trailing
 * `(N rows)` trailer. Those control lines are metadata here, never headers
 * or data rows.
 */
export interface ParsedQueryData {
  headers: string[]
  rows: string[][]
  resultId: string | null
  totalRows: number | null
  truncated: boolean
}

const RESULT_ID_RE = /^result_id:\s*(\S+)$/
const ROWS_TRAILER_RE = /^\((\d+) rows?\)$/
const ELISION_PART = '(?:\\d+ more rows elided|result truncated by the engine)'
const ELISION_RE = new RegExp(`^\\(\\.\\.\\. ${ELISION_PART}(?:; ${ELISION_PART})*\\)$`)

export function parseQueryData(content: string): ParsedQueryData | null {
  const lines = content.split('\n').filter(l => l.trim() !== '')
  if (lines.length < 1) return null
  let totalRows: number | null = null
  let data = lines
  const trailer = lines[lines.length - 1]?.trim().match(ROWS_TRAILER_RE)
  if (trailer?.[1] !== undefined) {
    totalRows = parseInt(trailer[1], 10)
    data = lines.slice(0, -1)
  }
  let truncated = false
  data = data.filter((l) => {
    if (ELISION_RE.test(l.trim())) {
      truncated = true
      return false
    }
    return true
  })
  let resultId: string | null = null
  const idMatch = data[0]?.trim().match(RESULT_ID_RE) ?? null
  if (idMatch !== null) {
    resultId = idMatch[1] as string
    data = data.slice(1)
  }
  const first = data[0]
  if (data.length < 1 || first === undefined) return null
  const headers = first.split('\t')
  const rows = data.slice(1).map(line => line.split('\t'))
  if (totalRows !== null && rows.length < totalRows) truncated = true
  return { headers, rows, resultId, totalRows, truncated }
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

function toMarkdown(title: string, headers: string[], rows: string[][]): string {
  const esc = (v: string) => v.replace(/\|/g, '\\|')
  const lines = [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.map(esc).join(' | ')} |`),
  ]
  return `### ${title}\n\n${lines.join('\n')}`
}

function extractText(block: ToolCallBlock): string {
  /* v8 ignore next -- defensive: callers only pass settled blocks */
  if (!('kind' in block)) return ''
  return (block.content as readonly { text?: string }[]).map(c => c.text ?? '').join('\n')
}

function extractSql(argsRaw: string | null): string | null {
  if (argsRaw === null) return null
  try {
    const parsed = JSON.parse(argsRaw) as { sql?: unknown }
    return typeof parsed.sql === 'string' && parsed.sql.trim() !== '' ? parsed.sql : null
  } catch {
    return null
  }
}

/** One candidate query_data node: its render text and call argsRaw. */
export interface QueryCandidate {
  seq: number
  text: string
  argsRaw: string | null
}

function collectQueryCandidates(snapshot: ConversationSnapshot, blockSeq: number): QueryCandidate[] {
  const out: QueryCandidate[] = []
  const nodes = snapshot.nodes
  for (let i = nodes.length - 1; i >= 0 && out.length < MAX_CANDIDATES; i--) {
    const node = nodes[i] as (typeof nodes)[number]
    if (node.kind !== 'tool-result') continue
    if (node.seq >= blockSeq) continue
    if (node.call?.name !== 'query_data') continue
    if (node.isError) continue
    const text = (node.content as readonly { text?: string }[]).map(c => c.text ?? '').join('\n')
    if (text.trim() === '') continue
    out.push({ seq: node.seq, text, argsRaw: node.call.argsRaw })
  }
  return out
}

export function candidatesEqual(a: QueryCandidate[], b: QueryCandidate[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as QueryCandidate
    const y = b[i] as QueryCandidate
    if (x.seq !== y.seq || x.text !== y.text || x.argsRaw !== y.argsRaw) return false
  }
  return true
}

/** A query_data result bound to the presented result_id, with its SQL. */
interface BoundQuery {
  parsed: ParsedQueryData
  sql: string | null
}

/**
 * Bind `wantId` to a query_data candidate. Exact `result_id` match wins;
 * candidates without any id (older render format) fall back to the most
 * recent one; ids present but none matching yields `'mismatch'` so the card
 * can say so instead of silently binding the wrong result.
 */
function bindQuery(candidates: QueryCandidate[], wantId: string): BoundQuery | null | 'mismatch' {
  let legacy: BoundQuery | null = null
  let sawId = false
  for (const candidate of candidates) {
    const parsed = parseQueryData(candidate.text)
    if (parsed === null) continue
    const sql = extractSql(candidate.argsRaw)
    if (parsed.resultId !== null) {
      sawId = true
      if (parsed.resultId === wantId) return { parsed, sql }
    } else if (legacy === null) {
      legacy = { parsed, sql }
    }
  }
  if (sawId) return 'mismatch'
  return legacy
}

type ColumnKind = 'number' | 'date' | 'string'

/** Declared column_types win; otherwise sniff non-empty cell values. */
function sniffKind(values: string[], declared?: string): ColumnKind {
  if (declared === 'number') return 'number'
  if (declared === 'date') return 'date'
  if (declared === 'string') return 'string'
  let checked = 0
  let nums = 0
  let dates = 0
  for (const v of values) {
    const s = v.trim()
    if (s === '') continue
    checked++
    const n = Number(s)
    if (Number.isFinite(n)) {
      nums++
    } else if (!isNaN(Date.parse(s))) {
      dates++
    }
  }
  if (checked === 0) return 'string'
  if (nums === checked) return 'number'
  if (dates === checked) return 'date'
  return 'string'
}

function compareCells(a: string, b: string, kind: ColumnKind): number {
  if (kind === 'number' || kind === 'date') {
    const na = kind === 'number' ? Number(a) : Date.parse(a)
    const nb = kind === 'number' ? Number(b) : Date.parse(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
  }
  return a.localeCompare(b)
}

interface SortState {
  col: number
  dir: 'asc' | 'desc'
}

function ariaSort(sort: SortState | null, col: number): 'ascending' | 'descending' | 'none' {
  if (sort === null || sort.col !== col) return 'none'
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}

function cellClass(base: string | undefined, kind: ColumnKind | undefined): string {
  const parts = [base, kind === 'number' ? css.num : undefined]
  return parts.filter(p => p !== undefined).join(' ')
}

function sortMark(sort: SortState | null, col: number): string {
  if (sort === null || sort.col !== col) return ''
  return sort.dir === 'asc' ? ' ▲' : ' ▼'
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

function ExpiredCard({ block, t }: { block: ToolCallBlock; t: TableCardProps['t'] }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.expiredBanner}>{t('expired')}</div>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

function ErrorCard({ block, t }: { block: ToolCallBlock; t: TableCardProps['t'] }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.errorBanner}>{t('error')}</div>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
    </div>
  )
}

function MismatchCard({ block, t }: { block: ToolCallBlock; t: TableCardProps['t'] }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.errorBanner}>
        <div>{t('mismatch')}</div>
        <div className={css.mismatchHint}>{t('mismatchHint')}</div>
      </div>
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

interface TableBodyProps {
  headers: string[]
  rows: string[][]
  colKinds: ColumnKind[]
  sort: SortState | null
  onSortClick: (col: number) => void
  t: TableCardProps['t']
}

function SortableTable({ headers, rows, colKinds, sort, onSortClick, t }: TableBodyProps) {
  return (
    <div className={css.tableWrap}>
      <table className={css.table} aria-label={t('tableAria')}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cellClass(css.th, colKinds[i])} aria-sort={ariaSort(sort, i)}>
                <button type="button" className={css.sortBtn} onClick={() => { onSortClick(i) }} aria-label={t('sortAria')}>
                  {h}{sortMark(sort, i)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={css.tr}>
              {row.map((cell, ci) => <td key={ci} className={cellClass(css.td, colKinds[ci])}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GridVirtualTable({ headers, rows, colKinds, sort, onSortClick, t }: TableBodyProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const template = `repeat(${headers.length}, minmax(120px, 1fr))`

  return (
    <div className={css.tableWrap} role="table" aria-label={t('tableAria')} aria-rowcount={rows.length + 1}>
      <div className={css.gridHead} style={{ gridTemplateColumns: template }} role="row">
        {headers.map((h, i) => (
          <div key={i} role="columnheader" className={cellClass(css.gridTh, colKinds[i])} aria-sort={ariaSort(sort, i)}>
            <button type="button" className={css.sortBtn} onClick={() => { onSortClick(i) }} aria-label={t('sortAria')}>
              {h}{sortMark(sort, i)}
            </button>
          </div>
        ))}
      </div>
      <div ref={parentRef} className={css.virtualScroll}>
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {/* v8 ignore start -- virtualizer items require real DOM dimensions unavailable in jsdom */}
          {virtualizer.getVirtualItems().map(vRow => (
            <div
              key={vRow.index}
              role="row"
              className={css.gridRow}
              style={{
                height: `${vRow.size}px`,
                transform: `translateY(${vRow.start}px)`,
                gridTemplateColumns: template,
              }}
            >
              {(rows[vRow.index] as string[]).map((cell, ci) => (
                <div key={ci} role="cell" className={cellClass(css.gridCell, colKinds[ci])}>{cell}</div>
              ))}
            </div>
          ))}
          {/* v8 ignore stop */}
        </div>
      </div>
    </div>
  )
}

function CsvDownload({ headers, rows, title, t }: { headers: string[]; rows: string[][]; title: string; t: TableCardProps['t'] }) {
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
    <button type="button" className={css.actionBtn} onClick={handleClick}>
      {t('downloadCsv')}
    </button>
  )
}

function CopyMdButton({ headers, rows, title, t }: { headers: string[]; rows: string[][]; title: string; t: TableCardProps['t'] }) {
  const [copied, setCopied] = useState(false)
  const handleClick = () => {
    if (!('clipboard' in navigator)) return
    void navigator.clipboard.writeText(toMarkdown(title, headers, rows))
      .then(() => {
        setCopied(true)
        window.setTimeout(() => { setCopied(false) }, 1500)
      })
      .catch(() => {})
  }
  return (
    <button type="button" className={css.actionBtn} onClick={handleClick}>
      {copied ? t('copied') : t('copyMd')}
    </button>
  )
}

function ChartSection({ chart, headers, rows, t }: { chart: ChartConfig; headers: string[]; rows: string[][]; t: TableCardProps['t'] }) {
  const [kind, setKind] = useState<'line' | 'bar' | 'off'>(chart.type)
  return (
    <div className={css.chartSection}>
      <div className={css.chartToolbar} role="group" aria-label={t('chartGroup')}>
        <button type="button" className={css.chartBtn} aria-pressed={kind === 'line'} onClick={() => { setKind('line') }}>{t('chartLine')}</button>
        <button type="button" className={css.chartBtn} aria-pressed={kind === 'bar'} onClick={() => { setKind('bar') }}>{t('chartBar')}</button>
        <button type="button" className={css.chartBtn} aria-pressed={kind === 'off'} onClick={() => { setKind('off') }}>{t('chartOff')}</button>
      </div>
      {kind !== 'off' && (
        <div className={css.chartBox}>
          <Suspense fallback={<div className={css.chartSkeleton} />}>
            <ChartView
              chart={{ type: kind, x_column: chart.x_column, y_columns: chart.y_columns }}
              headers={headers}
              rows={rows}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export function TableCard({ block, useSession, t }: TableCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (!('kind' in block)) {
    return <RunningState />
  }

  if (block.call === null) {
    return <FallbackContent block={block} />
  }

  if (block.isError) {
    return <ErrorCard block={block} t={t} />
  }

  const args = parseArgs(block.call.argsRaw)
  if (args === null) {
    return <FallbackContent block={block} />
  }

  const seq = ('seq' in block) ? (block as { seq: number }).seq : /* v8 ignore next -- defensive: only settled blocks reach here */ 0
  return (
    <TableCardInner
      block={block} blockSeq={seq} args={args}
      useSession={useSession} collapsed={collapsed} setCollapsed={setCollapsed} t={t}
    />
  )
}

interface TableCardInnerProps {
  block: ToolCallBlock
  blockSeq: number
  args: PresentTableArgs
  useSession: TableCardProps['useSession']
  collapsed: boolean
  setCollapsed: (fn: (v: boolean) => boolean) => void
  t: TableCardProps['t']
}

interface TableData {
  headers: string[]
  rows: string[][]
  totalRows: number | null
  truncated: boolean
}

function TableCardInner({ block, blockSeq, args, useSession, collapsed, setCollapsed, t }: TableCardInnerProps) {
  const candidates = useSession(s => collectQueryCandidates(s, blockSeq), candidatesEqual)
  const bound = useMemo(() => bindQuery(candidates, args.result_id), [candidates, args.result_id])

  const data = useMemo<TableData | null>(() => {
    if (bound === null || bound === 'mismatch') return null
    const parsed = bound.parsed
    const headers = args.columns !== undefined && args.columns.length > 0 ? [...args.columns] : parsed.headers
    let rows = parsed.rows
    let truncated = parsed.truncated
    if (rows.length > MAX_DISPLAY_ROWS) {
      rows = rows.slice(0, MAX_DISPLAY_ROWS)
      truncated = true
    }
    return { headers, rows, totalRows: parsed.totalRows, truncated }
  }, [bound, args.columns])

  const [sort, setSort] = useState<SortState | null>(() => {
    const col = args.sort_column
    if (col === undefined || col < 0 || data === null || col >= data.headers.length) return null
    return { col, dir: 'desc' }
  })

  const colKinds = useMemo(() => {
    if (data === null) return []
    return data.headers.map((_, i) => sniffKind(data.rows.map(r => r[i] ?? ''), args.column_types?.[i]))
  }, [data, args.column_types])

  const sortedRows = useMemo(() => {
    if (data === null) return []
    if (sort === null) return data.rows
    const rows = [...data.rows]
    /* v8 ignore next -- defensive: sort.col is validated against headers on every path */
    const kind = colKinds[sort.col] ?? 'string'
    rows.sort((a, b) => compareCells(a[sort.col] ?? '', b[sort.col] ?? '', kind))
    if (sort.dir === 'desc') rows.reverse()
    return rows
  }, [data, sort, colKinds])

  const onSortClick = (col: number) => {
    setSort((prev) => {
      if (prev === null || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  if (bound === 'mismatch') {
    return <MismatchCard block={block} t={t} />
  }

  if (bound === null || data === null) {
    return <ExpiredCard block={block} t={t} />
  }

  const useVirtual = data.rows.length > VIRTUAL_THRESHOLD
  const incomplete = data.truncated
  const rowCountText = incomplete && data.totalRows !== null
    ? `${data.rows.length} / ${data.totalRows} ${t('rows')}`
    : `${data.rows.length} ${t('rows')}`

  return (
    <div className={css.card}>
      <div className={css.headerBar}>
        <button
          type="button"
          className={css.header}
          onClick={() => { setCollapsed(v => !v) }}
          aria-expanded={!collapsed}
        >
          <span className={css.chevron} data-collapsed={collapsed || undefined}>▾</span>
          <span className={css.headerTitle}>{args.title}</span>
          <span className={css.rowCount}>{rowCountText}</span>
        </button>
        <div className={css.headerActions}>
          <CopyMdButton headers={data.headers} rows={sortedRows} title={args.title} t={t} />
          <CsvDownload headers={data.headers} rows={sortedRows} title={args.title} t={t} />
        </div>
      </div>
      {bound.sql !== null && !collapsed && (
        <details className={css.sqlBox}>
          <summary className={css.sqlSummary}>{t('viewSql')}</summary>
          <pre className={css.sqlText}>{bound.sql}</pre>
        </details>
      )}
      {args.kpi_columns !== undefined && args.kpi_columns.length > 0 && (
        <>
          <KpiCards kpis={args.kpi_columns} rows={sortedRows} />
          {incomplete && <div className={css.kpiNote}>{t('kpiSampleNote')}</div>}
        </>
      )}
      {!collapsed && (
        <div className={css.body}>
          {useVirtual
            ? <GridVirtualTable headers={data.headers} rows={sortedRows} colKinds={colKinds} sort={sort} onSortClick={onSortClick} t={t} />
            : <SortableTable headers={data.headers} rows={sortedRows} colKinds={colKinds} sort={sort} onSortClick={onSortClick} t={t} />}
          {args.chart !== undefined && (
            <ChartSection chart={args.chart} headers={data.headers} rows={sortedRows} t={t} />
          )}
        </div>
      )}
    </div>
  )
}
