/**
 * P4 metric computation engine — pure functions for Level 2 metric context
 * injection (the Level 2.5 deterministic SQL builder was removed in M1b:
 * deterministically wrong on SUM-on-_df snapshot metrics — over-counting;
 * ~0% real-case trigger rate). Free of the semantic-layer runtime dependency
 * (mirrors EventDefinitionLite/SchemaCorpusSource decoupling) so this module
 * never imports substrate I/O.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/metric-engine
 */
import type { RetrievalHit } from './bm25-linking.ts'

/** Minimal host-table info for time-filter hint generation (structurally compatible with the semantic-layer TableModel). */
export interface HostTableInfo {
  readonly partitions?: readonly ({ readonly name: string } | string)[]
  readonly granularity?: string
}

/** Local metric shape (the semantic-layer MetricDefinition structurally satisfies it). */
export interface MetricDefinitionLite {
  readonly name: string
  readonly description?: string
  readonly computation: {
    readonly sql: string
    readonly metadata: { readonly source: string; readonly aggregation?: string; readonly field?: string; readonly time_grain?: string }
  }
}

/** Extracted time parameters (YYYYMMDD strings; ds partition format). */
export interface TimeParams {
  readonly date?: string
  readonly start_date?: string
  readonly end_date?: string
}

/**
 * Is a retrieval hit a metric corpus item? (the corpus item's `payload` is the
 * MetricDefinition; its `kind` === 'metric' distinguishes it from table defs,
 * whose `kind` is 'dws'/'dim', and events, which have no `kind`.)
 * @param hit - the retrieval hit to test.
 * @returns true when the hit's payload kind is 'metric'.
 */
export function isMetricHit(hit: RetrievalHit): boolean {
  const inner = hit.payload?.payload as { kind?: string } | undefined
  return inner?.kind === 'metric'
}

/**
 * Extract the MetricDefinitionLite payload from a metric retrieval hit.
 * @param hit - the retrieval hit to unwrap.
 * @returns the metric definition, or null when the hit is not a metric hit.
 */
export function metricFromHit(hit: RetrievalHit): MetricDefinitionLite | null {
  if (!isMetricHit(hit)) return null
  const outer = hit.payload
  return outer !== undefined ? (outer.payload as MetricDefinitionLite) : null
}

/**
 * Route a query by its candidates (D1): metric present => Level 2 (metric rule
 * injected as context for the LLM); no metric => null (normal LLM path). The
 * Level 2.5 deterministic arm was removed in M1b (deterministically wrong on
 * SUM-on-_df snapshot metrics — over-counting; ~0% real-case trigger rate).
 * @param candidates - the BM25 retrieval hits to route on.
 * @returns 'level-2' when a metric hit is present, or null for the normal LLM path.
 */
export function routeMetric(candidates: readonly RetrievalHit[]): 'level-2' | null {
  const metricHits = candidates.filter(isMetricHit)
  if (metricHits.length === 0) return null
  return 'level-2'
}

/** Format a Date (UTC) as YYYYMMDD. */
function fmt(dt: Date): string {
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Extract time parameters from a question relative to a reference `today`
 * (YYYYMMDD; deterministic — no `Date.now`). Supports 昨天/今天/前天/上周/本月
 * + explicit YYYY-MM-DD / YYYYMMDD. Returns {} when nothing recognized.
 * @param question - the natural-language question to extract time params from.
 * @param today - the reference date (YYYYMMDD).
 * @returns the extracted time parameters, or {} when nothing is recognized / today is invalid.
 */
export function extractTimeParams(question: string, today: string): TimeParams {
  if (!today || !/^\d{8}$/.test(today)) return {}
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(4, 6))
  const d = Number(today.slice(6, 8))
  const base = new Date(Date.UTC(y, m - 1, d))
  const shift = (days: number): string => {
    const dt = new Date(base.getTime())
    dt.setUTCDate(dt.getUTCDate() + days)
    return fmt(dt)
  }
  if (/昨天|昨日/.test(question)) return { date: shift(-1) }
  if (/前天/.test(question)) return { date: shift(-2) }
  if (/今天|今日/.test(question)) return { date: today }
  if (/上周|上一周/.test(question)) {
    const day = base.getUTCDay() === 0 ? 7 : base.getUTCDay() // Mon=1..Sun=7
    const thisMonday = new Date(base.getTime())
    thisMonday.setUTCDate(base.getUTCDate() - (day - 1))
    const sun = new Date(thisMonday.getTime())
    sun.setUTCDate(thisMonday.getUTCDate() - 1)
    const mon = new Date(thisMonday.getTime())
    mon.setUTCDate(thisMonday.getUTCDate() - 7)
    return { start_date: fmt(mon), end_date: fmt(sun) }
  }
  if (/本月|当月/.test(question)) return { start_date: `${y}${String(m).padStart(2, '0')}01`, end_date: today }
  const m1 = question.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m1) {
    const yy = m1[1]; const mo = m1[2]; const dd = m1[3]
    if (yy !== undefined && mo !== undefined && dd !== undefined) return { date: `${yy}${mo}${dd}` }
  }
  const m2 = question.match(/(?<!\d)(\d{8})(?!\d)/)
  if (m2) {
    const v = m2[1]
    if (v !== undefined) return { date: v }
  }
  return {}
}

/**
 * Generate a time-filter hint based on the host table's partition and granularity info.
 * Snapshot tables (_df / 快照 / 全量) get a MAX_PT() hint; daily-partitioned tables
 * get a ds WHERE hint; tables without ds partition get no hint.
 * @param hostTable - the host table's partition + granularity info.
 * @returns the time-filter hint string, or '' when the table has no ds partition.
 */
export function buildTimeFilterHint(hostTable: HostTableInfo): string {
  const hasDs = hostTable.partitions?.some(p =>
    (typeof p === 'string' ? p : p.name) === 'ds',
  )
  if (!hasDs) return ''

  const gran = hostTable.granularity || ''
  if (/快照|_df|全量/.test(gran)) {
    return '\n时间过滤：该指标基于日全量快照表，ds 取最近可用分区（如 MAX_PT()），勿跨天 SUM/COUNT 避免重复计数。'
  }
  return '\n时间过滤：该指标按 ds 分区过滤（日粒度），使用 WHERE ds = \'...\' 或 ds BETWEEN 限制时间范围。'
}

/**
 * Render the metric context line for a Level 2 (mixed) prompt (D3).
 * @param metric - the metric definition to render.
 * @param params - the extracted time parameters for the WHERE hint.
 * @param hostTable - optional host-table info for the time-filter hint.
 * @returns the metric context line (definition + optional time-filter hint).
 */
export function buildMetricContext(metric: MetricDefinitionLite, params: TimeParams, hostTable?: HostTableInfo): string {
  const source = metric.computation.metadata.source
  const expr = metric.computation.sql
  // Hint-quality WHERE: surfaces the time filter so the LLM reproduces it in
  // generated SQL (the critic + executed-SQL path still validate). Single day →
  // ds = date; range (本月/上周) → ds BETWEEN start AND end; no time param → none.
  let where = ''
  if (params.date) where = ` WHERE ds = '${params.date}'`
  else if (params.start_date && params.end_date) where = ` WHERE ds BETWEEN '${params.start_date}' AND '${params.end_date}'`
  const body = expr.includes('{{') ? expr : `SELECT ${expr} FROM ${source}${where}`
  const base = `- ${metric.name} = ${body}（${metric.description ?? ''}）`
  return hostTable !== undefined ? base + buildTimeFilterHint(hostTable) : base
}
