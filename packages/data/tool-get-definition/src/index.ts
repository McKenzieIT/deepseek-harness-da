/**
 * Model-facing `get_definition` tool — load a unified data asset definition
 * (table, event, or metric) by name from the semantic layer. The management
 * agent uses this to inspect asset details after search_schema finds them.
 *
 * Tries table → event → metric in order; returns the full definition object
 * including fields, relations, domains, and confirmation status.
 *
 * @module @deepseek-ai/dsh-tool-get-definition
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-get-definition'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export function validateAssetName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

export interface GetDefinitionResult {
  readonly found: boolean
  readonly kind?: string
  readonly definition?: unknown
  readonly message?: string
}

export function getDefinitionResult(
  schema: SemanticLayerService | undefined,
  name: string,
): GetDefinitionResult {
  if (schema === undefined) {
    return { found: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }
  }
  const validated = validateAssetName(name)
  if (validated === null) {
    return { found: false, message: `invalid asset name: ${JSON.stringify(name)}` }
  }
  const table = schema.loadTableDefinition(validated)
  if (table !== null) return { found: true, kind: 'table', definition: table }
  const event = schema.loadEventDefinition(validated)
  if (event !== null) return { found: true, kind: 'event', definition: event }
  const metric = schema.loadMetricDefinition(validated)
  if (metric !== null) return { found: true, kind: 'metric', definition: metric }
  return { found: false, message: `no table, event, or metric named "${validated}" found` }
}

export function formatGetDefinition(value: GetDefinitionResult): string {
  if (!value.found) return value.message ?? 'not found'
  return `[${value.kind}] ${JSON.stringify(value.definition, null, 2)}`
}

/** Project the definition into a replay-safe meta shape for the presenter. */
function projectDefinitionMeta(value: GetDefinitionResult): unknown {
  if (!value.found) return { found: false, message: value.message }
  const def = value.definition as Record<string, unknown> | undefined
  return {
    found: true,
    kind: value.kind,
    name: def?.table_name ?? def?.event_name ?? def?.metric_name ?? def?.name,
    domains: def?.domains,
    description: def?.description,
    columns: Array.isArray(def?.columns) ? (def.columns as unknown[]).length : undefined,
    metrics: def?.metrics !== undefined ? Object.keys(def.metrics as object).length : undefined,
    relations: def?.dimension_refs ?? def?.relations,
    confirmation: (def?.confirmation as Record<string, unknown> | undefined)?.status,
    definition: value.definition,
  }
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'get_definition',
    description:
      'Load the full definition of a data asset (table, event, or metric) by '
      + 'name. Returns the complete definition including fields, relations, '
      + 'domains, metrics, and confirmation status. Use after search_schema '
      + 'identifies an asset to inspect.',
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'The asset name (table_name, event name, or metric name) to look up.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          found: { type: 'boolean', required: true },
          kind: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGetDefinition(value as unknown as GetDefinitionResult) }],
      presentationMeta: (_args, value) => projectDefinitionMeta(value as unknown as GetDefinitionResult),
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('get_definition aborted')
      const schema = ctx.get('schema') as SemanticLayerService | undefined
      return getDefinitionResult(schema, args.name) as any
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Definition: ${args.name}`,
        kind: 'read',
      }
    },
    presentResult(args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as { found?: boolean; kind?: string; name?: string } | undefined
      if (!meta?.found) return { card: 'generic', title: `Not found: ${args.name}` }
      return {
        card: 'generic',
        title: `${meta.kind ?? 'asset'}: ${meta.name ?? args.name}`,
      }
    },
  }))
}
