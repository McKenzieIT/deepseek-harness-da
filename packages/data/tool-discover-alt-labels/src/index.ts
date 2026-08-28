/**
 * Model-facing `discover_alt_labels` tool — AI-native SKOS alias discovery for
 * semantic layer definitions (CL-1 Phase 3). The management agent calls it to
 * discover alt_labels for tables and/or events (G3 two-round: deterministic
 * extraction from description/columns/domains + optional LLM semantic round).
 *
 * Mirrors `tool-discover-relations`: defineTool + ctx.tools.register, pure
 * logic testable with a schema double, path-traversal guard on model-supplied
 * names, not-mounted honest fallback, and a readable summary render.
 *
 * Delegates to `ctx.schema.discoverAltLabels({tables, events})`.
 *
 * @module @deepseek-ai/dsh-tool-discover-alt-labels
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-discover-alt-labels'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

/**
 * Validate a definition name at the model-input boundary (defense-in-depth).
 * Rejects path traversal, empty, NUL, and overlength names.
 */
export function validateName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

/** The canonical result returned by `discover_alt_labels`'s execute. */
export type DiscoverAltLabelsResult = {
  readonly ok: boolean
  readonly enriched?: number
  readonly written?: number
  readonly errors?: string[]
  readonly message?: string
}

function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const clean = raw
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\/?[\w.\-]+\/[\w.\-]+(?:\/[\w.\-]+)*/g, '<path>')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean
}

/**
 * The pure discover core — probe the schema seam, validate names, delegate
 * to `ctx.schema.discoverAltLabels`. Exported for testing.
 */
export async function discoverAltLabelsResult(
  schema: SemanticLayerService | undefined,
  tables?: readonly string[],
  events?: readonly string[],
): Promise<DiscoverAltLabelsResult> {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  const validatedTables: string[] = []
  for (const raw of tables ?? []) {
    const n = validateName(raw)
    if (n === null) return { ok: false, message: `invalid table name: ${JSON.stringify(raw)}` }
    validatedTables.push(n)
  }
  const validatedEvents: string[] = []
  for (const raw of events ?? []) {
    const n = validateName(raw)
    if (n === null) return { ok: false, message: `invalid event name: ${JSON.stringify(raw)}` }
    validatedEvents.push(n)
  }

  try {
    const res = await schema.discoverAltLabels({
      ...(validatedTables.length > 0 ? { tables: validatedTables } : {}),
      ...(validatedEvents.length > 0 ? { events: validatedEvents } : {}),
    })
    return { ok: true, enriched: res.enriched, written: res.written, errors: res.errors }
  } catch (e) {
    return { ok: false, message: `substrate error: ${sanitizeError(e)}` }
  }
}

/**
 * Format a discover result as readable text for the model.
 */
export function formatDiscoverAltLabels(value: DiscoverAltLabelsResult): string {
  if (!value.ok) {
    return value.message ?? 'discover_alt_labels: no result.'
  }
  const lines: string[] = []
  lines.push(`discover_alt_labels: enriched ${value.enriched ?? 0} definition(s) (written ${value.written ?? 0}).`)
  const errors = value.errors ?? []
  if (errors.length > 0) {
    lines.push(`errors (${errors.length}):`)
    for (const e of errors.slice(0, 20)) lines.push(`  - ${e}`)
    if (errors.length > 20) lines.push(`  ... +${errors.length - 20} more`)
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'discover_alt_labels',
    description:
      'Discover alternative search labels (alt_labels / SKOS aliases) for '
      + 'semantic layer definitions (CL-1 AI-native enrichment: deterministic '
      + 'extraction from description/columns/domains + optional LLM semantic '
      + 'round). Writes discovered labels back into each definition. Call this '
      + 'to improve search recall by adding synonyms, abbreviations, and '
      + 'Chinese/English variants. Optionally limit to `tables` and/or '
      + '`events` sets; omit both to enrich all definitions.',
    parameters: {
      tables: {
        type: 'array',
        description: 'Optional list of table_name values to limit enrichment to.',
        items: { type: 'string' },
      },
      events: {
        type: 'array',
        description: 'Optional list of event name values to limit enrichment to.',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          enriched: { type: 'number' },
          written: { type: 'number' },
          errors: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatDiscoverAltLabels(value),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('discover_alt_labels aborted before enriching')
      }
      const schema = ctx.get('schema')
      return discoverAltLabelsResult(schema, args.tables, args.events)
    },
    presentCall(args): GenericCallView {
      const tCount = args.tables?.length ?? 0
      const eCount = args.events?.length ?? 0
      const scope = tCount + eCount > 0
        ? `${tCount + eCount} definition${tCount + eCount > 1 ? 's' : ''}`
        : 'all definitions'
      return {
        card: 'generic',
        title: `Discover Alt Labels (${scope})`,
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const content = result.content
      if (!Array.isArray(content) || content.length === 0) return undefined
      const text = content[0]?.type === 'text' ? content[0].text : ''
      const enrichMatch = text.match(/enriched (\d+)/)
      const enriched = enrichMatch?.[1] ? parseInt(enrichMatch[1], 10) : 0
      return {
        card: 'generic',
        title: enriched > 0
          ? `+${enriched} definition${enriched > 1 ? 's' : ''} gained new labels`
          : 'No new labels discovered',
      }
    },
  }))
}
