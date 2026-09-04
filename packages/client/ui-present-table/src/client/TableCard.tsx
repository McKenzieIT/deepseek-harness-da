import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
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

export type ChartType = 'line' | 'bar' | 'area' | 'hbar' | 'scatter' | 'doughnut' | 'bubble' | 'radar' | 'polarArea'

export interface ChartConfig {
  type: ChartType
  x_column: number
  y_columns: number[]
  /** Column index for the bubble radius (the 3rd numeric metric; bubble only). */
  r_column?: number
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

/**
 * One cached query/compute result, mirrored locally (not imported from the
 * result-cache package) so this browser plugin stays self-contained at the
 * type boundary — the same stance the result-cache package takes for its own
 * `ResultEntry` mirror of the apiproxy contract. Structurally identical to
 * the `result.get` RPC value, so the inject face's `fetchResult` return
 * assigns without coercion.
 */
export interface FetchResultEntry {
  readonly columns: string[]
  readonly rows: unknown[][]
  readonly metadata?: { readonly sql?: string; readonly truncated?: boolean; readonly row_count?: number }
}

/**
 * The inject face the slot wires into `TableCard` (mirrors `FollowupChipsInjected`
 * for the `submit` face). `fetchResult` is the primary row source (a hot cache
 * over the `result.get` RPC); `invalidateResult` drops a stale entry on a
 * fresh same-turn `query_data` (R5 fresh-vs-folded). Both are optional on the
 * component so the TSV fallback path still renders when the result-cache
 * plugin is absent.
 */
export interface TableCardInjected {
  fetchResult: (resultId: string) => Promise<FetchResultEntry | undefined>
  invalidateResult: (resultId: string) => void
}

export interface TableCardProps {
  block: ToolCallBlock
  useSession: <T>(selector: (s: ConversationSnapshot) => T, eq?: (a: T, b: T) => boolean) => T
  /** Primary row source over the result-store hot cache; absent → TSV fallback. */
  fetchResult?: TableCardInjected['fetchResult']
  /** Drops a stale entry so a fresh `query_data` re-fetches (R5 fresh-vs-folded). */
  invalidateResult?: TableCardInjected['invalidateResult']
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

/** A query_data result bound to the presented result_id, with its SQL and seq. */
interface BoundQuery {
  parsed: ParsedQueryData
  sql: string | null
  /** The candidate's `seq` — the freshness signal: a higher seq than the last
   * invalidated one means a fresh `query_data` re-ran for this result_id. */
  seq: number
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
      if (parsed.resultId === wantId) return { parsed, sql, seq: candidate.seq }
    } else if (legacy === null) {
      legacy = { parsed, sql, seq: candidate.seq }
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

/** R4 client chart-type validator's degradation-reason keys (one per rule). */
export type DegradeReason =
  | 'degradeScatter'
  | 'degradeDoughnut'
  | 'degradeLineDate'
  | 'degradeBubble'
  | 'degradeRadar'

export type ChartValidationResult = { ok: true } | { ok: false; reasonKey: DegradeReason; fallback: 'bar' }

/**
 * Client-side chart-type validator (R4): degrade an infeasible choice to bar,
 * honestly surfacing why. Mirrors the R4 heuristic's feasibility floor — the
 * sniffed column kinds (declared win; otherwise sniffed upstream) + the x
 * cardinality decide whether the requested type can render the data shape:
 *
 *   line/area      x must be a date (time series)
 *   scatter        x + y numeric (≥2 numeric columns)
 *   bubble         x + y + r_column numeric (≥3 numeric columns)
 *   doughnut       ≤8 distinct x classes
 *   radar/polarArea categorical x + numeric y (one entity × N metrics)
 *   bar/hbar       always feasible
 *
 * Ordinal-numeric x for line/area is not relaxed here (the heuristic guides a
 * date column); see the Agent Note.
 */
export function validateChartType(
  type: ChartType,
  chart: ChartConfig,
  colKinds: ReadonlyArray<'number' | 'date' | 'string'>,
  rows: string[][],
): ChartValidationResult {
  const xKind = colKinds[chart.x_column]
  const yKind = colKinds[chart.y_columns[0] ?? -1]
  if (type === 'line' || type === 'area') {
    if (xKind !== 'date') return { ok: false, reasonKey: 'degradeLineDate', fallback: 'bar' }
    return { ok: true }
  }
  if (type === 'scatter') {
    if (xKind !== 'number' || yKind !== 'number') return { ok: false, reasonKey: 'degradeScatter', fallback: 'bar' }
    return { ok: true }
  }
  if (type === 'bubble') {
    const rKind = chart.r_column !== undefined ? colKinds[chart.r_column] : undefined
    if (xKind !== 'number' || yKind !== 'number' || rKind !== 'number') {
      return { ok: false, reasonKey: 'degradeBubble', fallback: 'bar' }
    }
    return { ok: true }
  }
  if (type === 'doughnut') {
    const distinct = new Set(rows.map(r => r[chart.x_column] ?? '')).size
    if (distinct > 8) return { ok: false, reasonKey: 'degradeDoughnut', fallback: 'bar' }
    return { ok: true }
  }
  if (type === 'radar' || type === 'polarArea') {
    if (xKind !== 'string' || yKind !== 'number') return { ok: false, reasonKey: 'degradeRadar', fallback: 'bar' }
    return { ok: true }
  }
  // bar / hbar always render the data shape
  return { ok: true }
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

function ExpiredCard({ block, t, retry }: { block: ToolCallBlock; t: TableCardProps['t']; retry?: () => void }) {
  const text = extractText(block)
  return (
    <div className={css.card}>
      <div className={css.expiredBanner}>{t('expired')}</div>
      <div className={css.fallback}>
        <pre className={css.fallbackText}>{text}</pre>
      </div>
      {retry !== undefined && (
        <button type="button" className={css.actionBtn} onClick={retry}>{t('retry')}</button>
      )}
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
    // ui-present-misc-11: defer revoke — Safari lazily reads the blob on click;
    // a synchronous revoke can abort the download before the browser reads it.
    window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
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
      .catch(() => {
        // clipboard write rejected (permissions/abort/unsupported document);
        // copy button silently no-ops — non-critical, no user error surface.
      })
  }
  return (
    <button type="button" className={css.actionBtn} onClick={handleClick}>
      {copied ? t('copied') : t('copyMd')}
    </button>
  )
}

/** The 9 R4 native chart types in toolbar order. */
const CHART_TYPE_ORDER: readonly ChartType[] = [
  'line', 'bar', 'area', 'hbar', 'scatter', 'doughnut', 'bubble', 'radar', 'polarArea',
]

/** Per-type toolbar label (locale key). */
const CHART_TYPE_LABEL: Record<ChartType, TableKey> = {
  line: 'chartLine',
  bar: 'chartBar',
  area: 'chartArea',
  hbar: 'chartHbar',
  scatter: 'chartScatter',
  doughnut: 'chartDoughnut',
  bubble: 'chartBubble',
  radar: 'chartRadar',
  polarArea: 'chartPolarArea',
}

interface ChartSectionProps {
  chart: ChartConfig
  headers: string[]
  rows: string[][]
  colKinds: ColumnKind[]
  t: TableCardProps['t']
}

/**
 * Chart toolbar (R4): one pill per native type (the user's override), plus the
 * 显示数值 (valueLabels) and 仅数据 (data-only) toggles. The validator runs on
 * the selected type; an infeasible choice degrades to bar with an honest banner.
 * `仅数据` hides the chart (the real table is always rendered above).
 */
function ChartSection({ chart, headers, rows, colKinds, t }: ChartSectionProps) {
  const [kind, setKind] = useState<ChartType | 'data'>(chart.type)
  const [showLabels, setShowLabels] = useState(false)
  const validation = kind === 'data' ? null : validateChartType(kind, chart, colKinds, rows)
  // `kind === 'data'` narrows the else-branch to ChartType; validation is null
  // only on the data-only branch, so the ok-branch kind is a ChartType.
  const effectiveType: ChartType = kind === 'data' ? 'bar' : (validation?.ok ? kind : 'bar')
  return (
    <div className={css.chartSection}>
      <div className={css.chartToolbar} role="group" aria-label={t('chartGroup')}>
        {CHART_TYPE_ORDER.map(type => (
          <button key={type} type="button" className={css.chartBtn} aria-pressed={kind === type} onClick={() => { setKind(type) }}>
            {t(CHART_TYPE_LABEL[type])}
          </button>
        ))}
        <button type="button" className={css.chartBtn} aria-pressed={showLabels} onClick={() => { setShowLabels(v => !v) }}>
          {t('chartLabels')}
        </button>
        <button type="button" className={css.chartBtn} aria-pressed={kind === 'data'} onClick={() => { setKind('data') }}>
          {t('chartData')}
        </button>
      </div>
      {validation !== null && !validation.ok && (
        <div className={css.chartWarn}>{t(validation.reasonKey)}</div>
      )}
      {kind !== 'data' && (
        <div className={css.chartBox}>
          <Suspense fallback={<div className={css.chartSkeleton} />}>
            <ChartView
              chart={{ ...chart, type: effectiveType }}
              headers={headers}
              rows={rows}
              showLabels={showLabels}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export function TableCard({ block, useSession, fetchResult, invalidateResult, t }: TableCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (!('kind' in block)) {
    return <RunningState />
  }

  // ui-present-misc-4: check isError BEFORE call===null (matching
  // DecompositionCard) — for an errored result-only node (call:null && isError)
  // the prior order rendered FallbackContent, hiding the error.
  if (block.isError) {
    return <ErrorCard block={block} t={t} />
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
      block={block} blockSeq={seq} args={args} useSession={useSession}
      fetchResult={fetchResult} invalidateResult={invalidateResult}
      collapsed={collapsed} setCollapsed={setCollapsed} t={t}
    />
  )
}

interface TableCardInnerProps {
  block: ToolCallBlock
  blockSeq: number
  args: PresentTableArgs
  useSession: TableCardProps['useSession']
  fetchResult?: TableCardProps['fetchResult']
  invalidateResult?: TableCardProps['invalidateResult']
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

/** Apply the `args.columns` override + the `MAX_DISPLAY_ROWS` cap to a raw row
 *  set. Shared by the result-store entry and the same-turn TSV scan so the
 *  override + cap logic lives (and is exercised by the TSV tests) once. */
function toTableData(headers: string[], rows: string[][], totalRows: number | null, truncated: boolean, args: PresentTableArgs): TableData {
  const finalHeaders = args.columns !== undefined && args.columns.length > 0 ? [...args.columns] : headers
  let finalRows = rows
  let finalTruncated = truncated
  if (finalRows.length > MAX_DISPLAY_ROWS) {
    finalRows = finalRows.slice(0, MAX_DISPLAY_ROWS)
    finalTruncated = true
  }
  return { headers: finalHeaders, rows: finalRows, totalRows, truncated: finalTruncated }
}

/** Coerce a result-store entry into the string-row pipeline the table, KPI,
 *  sort, CSV, and Markdown helpers already consume (they all work on strings). */
function resultEntryToTableData(entry: FetchResultEntry, args: PresentTableArgs): TableData {
  const rows = entry.rows.map(r => r.map(c => (c === null || c === undefined ? '' : String(c))))
  return toTableData([...entry.columns], rows, entry.metadata?.row_count ?? null, entry.metadata?.truncated ?? false, args)
}

type FetchStatus = 'loading' | 'success' | 'not-found' | 'error'

interface FetchState {
  status: FetchStatus | 'no-face'
  entry: FetchResultEntry | null
  retry: () => void
}

/** No-op retry for the no-face state — no `fetchResult` ⇒ no retry button renders. */
/* v8 ignore next -- never called: the no-face path renders no retry button */
const NOOP_RETRY: () => void = () => {}

/**
 * Drive the async result-store fetch and the R5 fresh-vs-folded invalidation.
 * The inject-face callbacks are held in refs so the effect's identity deps
 * stay `[resultId, freshSeq, retryNonce]` — a new function instance per render
 * (the slot need not memoize the inject face) cannot re-trigger a fetch.
 *
 * - `freshSeq` advances (a new same-turn `query_data` re-ran for this id) →
 *   invalidate the cache entry, then refetch (miss → fresh RPC). A re-render
 *   with the same `freshSeq` (fold/expand) does not re-run the effect, so the
 *   cached entry is reused without a re-RPC (G1: fold/expand preserves data).
 * - retry bumps `retryNonce` → refetch (failures are not cached, so retry re-RPCs).
 */
function useFetchResult(
  resultId: string,
  fetchResult: TableCardProps['fetchResult'],
  invalidateResult: TableCardProps['invalidateResult'],
  freshSeq: number | null,
): FetchState {
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [entry, setEntry] = useState<FetchResultEntry | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const lastInvalidatedSeq = useRef(-1)
  // Latest-callback refs: the effect deps stay off the callback identities.
  const fetchRef = useRef(fetchResult)
  fetchRef.current = fetchResult
  const invalidateRef = useRef(invalidateResult)
  invalidateRef.current = invalidateResult

  useEffect(() => {
    const fetchFn = fetchRef.current
    if (fetchFn === undefined) return
    let cancelled = false
    const invalidate = invalidateRef.current
    if (invalidate !== undefined && freshSeq !== null && freshSeq > lastInvalidatedSeq.current) {
      invalidate(resultId)
      lastInvalidatedSeq.current = freshSeq
    }
    setStatus('loading')
    fetchFn(resultId)
      .then((resolved) => {
        if (cancelled) return
        if (resolved === undefined) { setEntry(null); setStatus('not-found') }
        else { setEntry(resolved); setStatus('success') }
      })
      .catch(() => {
        if (cancelled) return
        setEntry(null); setStatus('error')
      })
    return () => { cancelled = true }
  }, [resultId, freshSeq, retryNonce])

  if (fetchResult === undefined) return { status: 'no-face', entry: null, retry: NOOP_RETRY }
  return { status, entry, retry: () => { setRetryNonce(n => n + 1) } }
}

type RenderState = 'ready' | 'loading' | 'mismatch' | 'expired-retry' | 'expired-noretry'

/**
 * Decide the final table data, SQL, and render state from the fetch + the
 * bound same-turn `query_data`. `fetchResult` (primary) wins on success; a
 * not-found (undefined) falls back to the TSV scan; a rejection surfaces as
 * expired+retry (G1 D2: result store unavailable). Without the `fetchResult`
 * face the TSV scan is the sole source and no retry is offered.
 */
function decideTable(
  fetch: FetchState,
  fetchResult: TableCardProps['fetchResult'],
  bound: BoundQuery | null | 'mismatch',
  tsvData: TableData | null,
  args: PresentTableArgs,
): { tableData: TableData | null; sql: string | null; renderState: RenderState } {
  const isBound = bound !== null && bound !== 'mismatch'
  const boundSql = isBound ? (bound as BoundQuery).sql : null
  const entry = fetch.entry
  if (fetchResult !== undefined) {
    if (entry !== null && (fetch.status === 'success' || fetch.status === 'loading')) {
      return { tableData: resultEntryToTableData(entry, args), sql: entry.metadata?.sql ?? boundSql, renderState: 'ready' }
    }
    if (fetch.status === 'loading') return { tableData: null, sql: null, renderState: 'loading' }
    if (fetch.status === 'not-found') {
      if (tsvData !== null) return { tableData: tsvData, sql: boundSql, renderState: 'ready' }
      return { tableData: null, sql: null, renderState: 'expired-retry' }
    }
    // fetch.status === 'error' (a rejected fetch). 'no-face' is unreachable
    // here — the outer guard ensures fetchResult is defined, and the hook
    // only returns 'no-face' when fetchResult is undefined — so the error
    // case is the final return, with no separate branch to leave uncovered.
    return { tableData: null, sql: null, renderState: 'expired-retry' }
  }
  if (bound === 'mismatch') return { tableData: null, sql: null, renderState: 'mismatch' }
  if (tsvData !== null) return { tableData: tsvData, sql: boundSql, renderState: 'ready' }
  return { tableData: null, sql: null, renderState: 'expired-noretry' }
}

function TableCardInner({
  block, blockSeq, args, useSession, fetchResult, invalidateResult, collapsed, setCollapsed, t,
}: TableCardInnerProps) {
  const candidates = useSession(s => collectQueryCandidates(s, blockSeq), candidatesEqual)
  const bound = useMemo(() => bindQuery(candidates, args.result_id), [candidates, args.result_id])

  const isBound = bound !== null && bound !== 'mismatch'
  const tsvData = useMemo<TableData | null>(() => {
    if (!isBound) return null
    const parsed = (bound as BoundQuery).parsed
    return toTableData(parsed.headers, parsed.rows, parsed.totalRows, parsed.truncated, args)
  }, [bound, args.columns])

  // Fresh-vs-folded signal: the bound query_data's seq (when its result_id
  // matches args.result_id). A higher seq than last invalidated ⇒ a fresh
  // same-turn re-run ⇒ invalidate the cache entry + refetch (R5).
  const freshSeq = isBound && (bound as BoundQuery).parsed.resultId === args.result_id ? (bound as BoundQuery).seq : null
  const fetch = useFetchResult(args.result_id, fetchResult, invalidateResult, freshSeq)
  const { tableData, sql, renderState } = decideTable(fetch, fetchResult, bound, tsvData, args)

  const [sort, setSort] = useState<SortState | null>(() => {
    const col = args.sort_column
    if (col === undefined || col < 0 || tsvData === null || col >= tsvData.headers.length) return null
    return { col, dir: 'desc' }
  })

  const colKinds = useMemo(() => {
    if (tableData === null) return []
    return tableData.headers.map((_, i) => sniffKind(tableData.rows.map(r => r[i] ?? ''), args.column_types?.[i]))
  }, [tableData, args.column_types])

  const sortedRows = useMemo(() => {
    if (tableData === null) return []
    if (sort === null) return tableData.rows
    const rows = [...tableData.rows]
    /* v8 ignore next -- sort.col is always a valid header index (init-validated or user-clicked) */
    const kind = colKinds[sort.col] ?? 'string'
    rows.sort((a, b) => compareCells(a[sort.col] ?? '', b[sort.col] ?? '', kind))
    if (sort.dir === 'desc') rows.reverse()
    return rows
  }, [tableData, sort, colKinds])

  const onSortClick = (col: number) => {
    setSort((prev) => {
      if (prev === null || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  if (renderState === 'mismatch') {
    return <MismatchCard block={block} t={t} />
  }

  if (renderState === 'loading') {
    return <RunningState />
  }

  if (renderState === 'expired-retry') {
    return <ExpiredCard block={block} t={t} retry={fetch.retry} />
  }

  if (renderState === 'expired-noretry') {
    return <ExpiredCard block={block} t={t} />
  }

  const data = tableData as TableData
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
      {sql !== null && !collapsed && (
        <details className={css.sqlBox}>
          <summary className={css.sqlSummary}>{t('viewSql')}</summary>
          <pre className={css.sqlText}>{sql}</pre>
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
            <ChartSection chart={args.chart} headers={data.headers} rows={sortedRows} colKinds={colKinds} t={t} />
          )}
        </div>
      )}
    </div>
  )
}
