/**
 * Model-facing `get_coverage` tool — semantic layer coverage statistics:
 * total assets by kind, domain breakdown, and confirmation status. The
 * management agent uses this to assess the current state of the semantic
 * layer and identify coverage gaps.
 *
 * @module @deepseek-ai/dsh-tool-get-coverage
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import {
  loadTables,
  loadEvents,
  TableDefinitionSchema,
  EventDefinitionSchema,
} from '@deepseek-ai/dsh-semantic-layer'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-get-coverage'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface CoverageStats {
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
  readonly confirmed_count: number
  readonly draft_count: number
  readonly domain_counts: Record<string, number>
  readonly [key: string]: JsonValue
}

export interface GetCoverageResult {
  readonly ok: boolean
  readonly stats?: CoverageStats
  readonly message?: string
  readonly [key: string]: JsonValue
}

export function getCoverageResult(schema: SemanticLayerService | undefined): GetCoverageResult {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }
  }
  const root = schema.semanticRoot
  if (!root) {
    return { ok: true, stats: { table_count: 0, event_count: 0, metric_count: 0, confirmed_count: 0, draft_count: 0, domain_counts: {} } }
  }

  let tableCount = 0
  let eventCount = 0
  let metricCount = 0
  let confirmed = 0
  let draft = 0
  const domainCounts: Record<string, number> = {}

  for (const t of loadTables(root)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    tableCount++
    metricCount += Object.keys(r.data.metrics).length
    const status = (r.data as { confirmation?: { status?: string } }).confirmation?.status
    if (status === 'confirmed') confirmed++
    else draft++
    for (const d of r.data.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
  }
  for (const e of loadEvents(root)) {
    const r = EventDefinitionSchema.safeParse(e.raw)
    if (!r.success) continue
    eventCount++
    metricCount += Object.keys(r.data.metrics).length
    const status = (r.data as { confirmation?: { status?: string } }).confirmation?.status
    if (status === 'confirmed') confirmed++
    else draft++
    for (const d of r.data.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
  }

  return {
    ok: true,
    stats: {
      table_count: tableCount,
      event_count: eventCount,
      metric_count: metricCount,
      confirmed_count: confirmed,
      draft_count: draft,
      domain_counts: domainCounts,
    },
  }
}

export function formatGetCoverage(value: GetCoverageResult): string {
  if (!value.ok) return value.message ?? 'get_coverage failed'
  const s = value.stats
  if (s === undefined) return 'no stats'
  const total = s.table_count + s.event_count + s.metric_count
  const lines = [
    `Coverage: ${total} total assets (${s.table_count} tables, ${s.event_count} events, ${s.metric_count} metrics)`,
    `Status: ${s.confirmed_count} confirmed, ${s.draft_count} draft`,
  ]
  const domains = Object.entries(s.domain_counts).sort(([, a], [, b]) => b - a)
  if (domains.length > 0) {
    lines.push(`Domains (${domains.length}): ${domains.map(([d, n]) => `${d}(${n})`).join(', ')}`)
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'get_coverage',
    description:
      'Get semantic layer coverage statistics: total assets by kind (tables, '
      + 'events, metrics), confirmation status breakdown (confirmed vs draft), '
      + 'and per-domain asset counts. Use this to assess the overall health '
      + 'and completeness of the semantic layer.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGetCoverage(value as unknown as GetCoverageResult) }],
      presentationMeta: (_args, value): JsonValue => {
        const v = value as unknown as GetCoverageResult
        if (!v.ok) return { ok: false, ...(v.message !== undefined ? { message: v.message } : {}) }
        return { ok: true, ...(v.stats !== undefined ? { stats: v.stats } : {}) }
      },
    },
    async execute(_args, exec) {
      if (exec.signal.aborted) throw new Error('get_coverage aborted')
      const schema = ctx.get('schema')
      return Promise.resolve(getCoverageResult(schema))
    },
    presentCall(): GenericCallView {
      return {
        card: 'generic',
        title: 'Coverage Statistics',
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as { ok?: boolean; stats?: CoverageStats } | undefined
      if (!meta?.ok || !meta.stats) return { card: 'generic', title: 'Coverage unavailable' }
      const s = meta.stats
      const total = s.table_count + s.event_count + s.metric_count
      return {
        card: 'generic',
        title: `${total} assets · ${s.confirmed_count} confirmed · ${s.draft_count} draft`,
      }
    },
  }))
}
