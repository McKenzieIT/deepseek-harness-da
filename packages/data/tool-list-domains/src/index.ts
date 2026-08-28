/**
 * Model-facing `list_domains` tool — enumerate semantic layer domains with
 * asset counts per kind (tables, events, metrics). The management agent uses
 * this to understand the domain structure of the semantic layer.
 *
 * Mirrors the SchemaGateway.listDomains() logic: scans all definitions and
 * aggregates unique domains with counts.
 *
 * @module @deepseek-ai/dsh-tool-list-domains
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  loadTables,
  loadEvents,
  TableDefinitionSchema,
  EventDefinitionSchema,
} from '@deepseek-ai/dsh-semantic-layer'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-list-domains'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface DomainEntry {
  readonly name: string
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
}

export interface ListDomainsResult {
  readonly ok: boolean
  readonly domains?: DomainEntry[]
  readonly message?: string
}

export function listDomainsResult(schema: SemanticLayerService | undefined): ListDomainsResult {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }
  }
  const root = schema.semanticRoot
  if (!root) {
    return { ok: true, domains: [] }
  }

  const counts = new Map<string, { tables: number; events: number; metrics: number }>()
  const ensure = (d: string) => {
    const existing = counts.get(d)
    if (existing !== undefined) return existing
    const fresh = { tables: 0, events: 0, metrics: 0 }
    counts.set(d, fresh)
    return fresh
  }

  for (const t of loadTables(root)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    for (const d of r.data.domains) ensure(d).tables++
    const metricCount = Object.keys(r.data.metrics).length
    if (metricCount > 0) {
      for (const d of r.data.domains) ensure(d).metrics += metricCount
    }
  }
  for (const e of loadEvents(root)) {
    const r = EventDefinitionSchema.safeParse(e.raw)
    if (!r.success) continue
    for (const d of r.data.domains) ensure(d).events++
    const metricCount = Object.keys(r.data.metrics).length
    if (metricCount > 0) {
      for (const d of r.data.domains) ensure(d).metrics += metricCount
    }
  }

  const domains: DomainEntry[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, c]) => ({
      name,
      table_count: c.tables,
      event_count: c.events,
      metric_count: c.metrics,
    }))

  return { ok: true, domains }
}

export function formatListDomains(value: ListDomainsResult): string {
  if (!value.ok) return value.message ?? 'list_domains failed'
  const domains = value.domains ?? []
  if (domains.length === 0) return 'No domains found in the semantic layer.'
  const lines = domains.map(d =>
    `• ${d.name}: ${d.table_count} tables, ${d.event_count} events, ${d.metric_count} metrics`,
  )
  return `${domains.length} domain(s):\n${lines.join('\n')}`
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'list_domains',
    description:
      'List all domains in the semantic layer with asset counts per kind '
      + '(tables, events, metrics). Use this to understand the domain '
      + 'structure and identify areas to focus on.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          domains: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                table_count: { type: 'number', required: true },
                event_count: { type: 'number', required: true },
                metric_count: { type: 'number', required: true },
              },
            },
          },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatListDomains(value as unknown as ListDomainsResult) }],
    },
    execute(_args, exec) {
      if (exec.signal.aborted) throw new Error('list_domains aborted')
      const schema = ctx.get('schema')
      return Promise.resolve(listDomainsResult(schema))
    },
  }))
}
