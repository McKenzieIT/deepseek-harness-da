/**
 * Model-facing `discover_relations` tool (B4) — the AI-native enrichment entry
 * for the data agent. The agent calls it to discover DWS→DIM dimension join
 * relations over the semantic layer (G3 two-round discovery), optionally
 * limited to a `tables` set. Mirrors `tool-load-table-definition` for the
 * `defineTool` + `ctx.tools.register` shape: pure logic testable with a schema
 * double, a path-traversal guard on the model-supplied `tables`, the
 * not-mounted honest fallback, and a readable summary render.
 *
 * Delegates to `ctx.schema.discoverRelations({tables})` (B3), which runs the
 * substrate `enrichAllDwsTables` (deterministic PK-name round + optional LLM
 * semantic round via an injected `llmCall`).
 *
 * @module @deepseek-ai/dsh-tool-discover-relations
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-discover-relations'
export const inject = ['tools']

/** Configuration for the discover_relations tool (no knobs; the substrate owns the data). */
export interface Config {}
/** Runtime configuration schema for the discover_relations plugin. */
export const Config: z<Config> = z.object({})

/**
 * Validate a table name at the model-input boundary (intranet-security-first
 * defense-in-depth; mirrors `tool-load-table-definition`). Rejects path
 * traversal (`/`, `\`, `..`, NUL), empty names, and names over 200 chars.
 * The substrate matches by the `table_name` field, so this is defense-in-depth.
 * @param raw - the model-supplied name to validate.
 * @returns the trimmed name when valid, or `null` when it must be rejected.
 */
export function validateTableName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  if (trimmed.length > 200) return null
  return trimmed
}

/** The canonical value returned by `discover_relations`'s `execute`. */
export interface DiscoverRelationsResult {
  /** Whether enrichment ran (false when not mounted / invalid input / substrate error). */
  readonly ok: boolean
  /** DWS tables that gained >=1 dimension_ref (when ok). */
  readonly enriched?: number
  /** DWS tables updated (when ok). */
  readonly written?: number
  /** Per-table error messages (when ok). */
  readonly errors?: string[]
  /** A short reason when `!ok` (not mounted / invalid name / substrate error). */
  readonly message?: string
}

/**
 * Sanitize a substrate error for the model message: collapse to one line,
 * strip control chars, redact paths, bound length. Never leak a raw stack.
 * @param e - the thrown substrate error.
 * @returns a bounded single-line sanitized message.
 */
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
 * The pure discover core — probe the schema seam, validate `tables`, delegate
 * to `ctx.schema.discoverRelations`. Exported so the probe + guard + delegate
 * are testable without a Cordis context. `schema` is `undefined` when no
 * `ctx.schema` provider is mounted (the "callable but unwired" honest state).
 * @param schema - the semantic-layer service (`ctx.get('schema')`), or undefined when unmounted.
 * @param tables - optional model-supplied table-name filter.
 * @returns `{ ok: true, enriched, written, errors }` on success, or `{ ok: false, message }`.
 */
export async function discoverRelationsResult(
  schema: SemanticLayerService | undefined,
  tables?: readonly string[],
): Promise<DiscoverRelationsResult> {
  if (schema === undefined) {
    return { ok: false, message: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  const validated: string[] = []
  for (const raw of tables ?? []) {
    const n = validateTableName(raw)
    if (n === null) {
      return { ok: false, message: `invalid table name: ${JSON.stringify(raw)}` }
    }
    validated.push(n)
  }
  try {
    const res = await schema.discoverRelations(validated.length > 0 ? { tables: validated } : {})
    return { ok: true, enriched: res.enriched, written: res.written, errors: res.errors }
  } catch (e) {
    return { ok: false, message: `substrate error: ${sanitizeError(e)}` }
  }
}

/**
 * Format a discover result as readable text for the model.
 * @param value - the canonical result.
 * @returns a multi-line text block the model reads in the tool result.
 */
export function formatDiscoverRelations(value: DiscoverRelationsResult): string {
  if (!value.ok) {
    return value.message ?? 'discover_relations: no result.'
  }
  const lines: string[] = []
  lines.push(`discover_relations: enriched ${value.enriched ?? 0} DWS table(s) (written ${value.written ?? 0}).`)
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
    name: 'discover_relations',
    description:
      'Discover DWS→DIM dimension join relations over the semantic layer '
      + '(G3 AI-native enrichment: deterministic primary-key-name round + an '
      + 'optional LLM semantic round). Writes the discovered dimension_refs '
      + 'back into each DWS table. Call this in the ENRICHMENT phase to seed '
      + 'or refresh a scope\'s relation graph. Optionally limit to a `tables` '
      + 'set; omit it to enrich all DWS tables in the active scope.',
    parameters: {
      tables: {
        type: 'array',
        description: 'Optional list of table_name values to limit enrichment to. Omit to enrich all DWS tables in the active scope.',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
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
        text: formatDiscoverRelations(value),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('discover_relations aborted before enriching')
      }
      const schema = ctx.get('schema')
      return discoverRelationsResult(schema, args.tables)
    },
  }))
}
