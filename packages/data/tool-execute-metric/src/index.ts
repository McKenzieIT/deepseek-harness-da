/**
 * Model-facing `execute_metric` tool — deterministic Level 2.5 metric query
 * execution. When `search_data_sources` returns a metric hit and the question
 * is a pure metric query, the agent calls this tool to execute the metric's
 * computation rule directly (0 LLM SQL generation overhead).
 *
 * Structural probes (no static dep on semantic-layer / query packages):
 *  - `ctx.get('schema')` → loadMetricDefinition(name) + loadTableDefinition(source)
 *  - `ctx.get('query')` → execute({sql, scopeId}, signal)
 *  - `ctx.get('scopes')` → activeId() for the per-game scope
 *
 * @module @deepseek-ai/dsh-tool-execute-metric
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  extractTimeParams,
  buildExecutableSQL,
  type MetricDefinitionLite,
  type TimeParams,
} from '@deepseek-ai/dsh-nl2sql-engine/src/metric-engine.ts'

export const name = 'tool-execute-metric'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

/** Structural shape for the metric lookup on ctx.schema. */
interface MetricLookup {
  loadMetricDefinition(name: string): MetricDefinitionLite | null
  loadTableDefinition?(name: string): { partitions?: readonly { name: string }[] } | null
}

/** Structural shape for the query engine on ctx.query. */
interface QueryLike {
  execute(request: { sql: string; scopeId: string }, signal?: AbortSignal): Promise<{
    state: string
    columns?: string[]
    rows?: unknown[][]
    rowCount?: number
    error?: string
    instanceId?: unknown
  }>
}

/** Structural shape for the scope registry on ctx.scopes. */
interface ScopesLike {
  activeId(): string | undefined
}

/** The canonical value returned by `execute_metric`. */
export interface ExecuteMetricResult {
  readonly ok: boolean
  readonly sql?: string
  readonly result?: { columns?: string[]; rows?: unknown[][]; rowCount?: number }
  readonly metric?: { name: string; description?: string; source: string }
  readonly error?: string
}

/**
 * Resolve partition columns for a metric's source table. Falls back to ['ds']
 * when the schema service is unavailable or the table has no partition info.
 */
export function resolvePartitionCols(
  schema: MetricLookup | undefined,
  source: string,
): string[] {
  if (schema === undefined || typeof schema.loadTableDefinition !== 'function') return ['ds']
  const table = schema.loadTableDefinition(source)
  return table?.partitions?.map(p => p.name) ?? ['ds']
}

/**
 * Core execution logic — exported pure for testability without a Cordis context.
 */
export async function executeMetricCore(
  schema: MetricLookup | undefined,
  query: QueryLike | undefined,
  scopeId: string,
  args: { metric_name: string; question: string; today?: string },
  signal?: AbortSignal,
): Promise<ExecuteMetricResult> {
  if (schema === undefined) {
    return { ok: false, error: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  if (query === undefined) {
    return { ok: false, error: 'query engine not mounted (ctx.query unavailable)' }
  }

  const metricDef = schema.loadMetricDefinition(args.metric_name)
  if (metricDef === null) {
    return { ok: false, error: `metric "${args.metric_name}" not found in semantic layer` }
  }

  const today = args.today ?? new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const params: TimeParams = extractTimeParams(args.question, today)
  const source = metricDef.computation.metadata.source
  const partitionCols = resolvePartitionCols(schema, source)

  const sql = buildExecutableSQL(metricDef, params, partitionCols)

  // Safety: reject unpartitioned full-table scans
  const hasDs = partitionCols.map(p => p.toLowerCase()).includes('ds')
  if (hasDs && !params.date && !(params.start_date && params.end_date)) {
    return {
      ok: false,
      sql,
      error: '无法从问题中提取时间参数，拒绝执行（防止全表扫描）',
      metric: { name: metricDef.name, description: metricDef.description, source },
    }
  }

  if (signal?.aborted) {
    return { ok: false, error: 'aborted before execution' }
  }

  const outcome = await query.execute({ sql, scopeId }, signal)

  if (outcome.state === 'failed') {
    return {
      ok: false,
      sql,
      error: outcome.error ?? 'query execution failed',
      metric: { name: metricDef.name, description: metricDef.description, source },
    }
  }

  return {
    ok: true,
    sql,
    result: {
      columns: outcome.columns,
      rows: outcome.rows,
      rowCount: outcome.rowCount,
    },
    metric: { name: metricDef.name, description: metricDef.description, source },
  }
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'execute_metric',
    description:
      '对已注册的计算指标执行确定性查询（Level 2.5）。当 search_data_sources '
      + '返回 metric 命中且用户问题是纯指标查询时，优先调用此工具而非自己写 SQL '
      + '— 0 LLM 生成开销，确定性执行。',
    parameters: {
      metric_name: {
        type: 'string',
        required: true,
        description: '指标 id（如 dau, pay_amt_sum）— search_data_sources 结果中 metric 类数据源的 id。',
      },
      question: {
        type: 'string',
        required: true,
        description: '用户原始问题（用于时间参数提取）。',
      },
      today: {
        type: 'string',
        description: 'YYYYMMDD 参考日期（默认今天）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          sql: { type: 'string' },
          result: {
            type: 'object',
            additionalProperties: false,
            properties: {
              columns: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array' } },
              rowCount: { type: 'number' },
            },
          },
          metric: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              source: { type: 'string' },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines: string[] = []
        if (!value.ok) {
          lines.push(`execute_metric: FAILED — ${value.error ?? 'unknown error'}`)
          if (value.sql) lines.push(`SQL: ${value.sql}`)
        } else {
          lines.push('execute_metric: OK (deterministic Level 2.5)')
          if (value.metric) lines.push(`Metric: ${value.metric.name} (${value.metric.description ?? ''}) from ${value.metric.source}`)
          if (value.sql) lines.push(`SQL: ${value.sql}`)
          if (value.result) {
            lines.push(`Rows: ${value.result.rowCount ?? value.result.rows?.length ?? 0}`)
            if (value.result.columns) lines.push(`Columns: ${value.result.columns.join(', ')}`)
            if (value.result.rows && value.result.rows.length > 0) {
              for (const row of value.result.rows.slice(0, 10)) {
                lines.push(`  ${(row as unknown[]).map(c => c === null ? 'NULL' : String(c)).join(' | ')}`)
              }
              if (value.result.rows.length > 10) lines.push(`  ... +${value.result.rows.length - 10} more`)
            }
          }
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('execute_metric aborted before start')
      }

      const schema = ctx.get('schema') as MetricLookup | undefined
      const query = ctx.get('query') as QueryLike | undefined
      const scopes = ctx.get('scopes') as ScopesLike | undefined
      const scopeId = scopes?.activeId() ?? 'default'

      return executeMetricCore(schema, query, scopeId, args, exec.signal)
    },
  }))
}
