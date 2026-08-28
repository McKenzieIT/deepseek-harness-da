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
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import { loadTables, TableDefinitionSchema } from '@deepseek-ai/dsh-semantic-layer'

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

/** A join key column pair (dws column ↔ dimension column). */
type JoinKey = {
  dws_column: string
  dim_column: string
}

/** A dimension_ref as stored on a TableDefinition (raw shape; derivation optional). */
type RawDimRef = {
  dim_table: string
  join_keys: JoinKey[]
  derivation?: string
}

/** A normalized dimension ref (derivation resolved to a string). */
type DimRef = {
  dim_table: string
  join_keys: JoinKey[]
  derivation: string
}

/** One relation snapshot entry: table + its dimension refs. */
type RelationSnapshot = {
  table: string
  refs: DimRef[]
}

/** A diffed relation added between before/after snapshots. */
type AddedRelation = {
  table: string
  dim_table: string
  join_keys: JoinKey[]
  derivation: string
}

/** The canonical value returned by `discover_relations`'s `execute`. */
export type DiscoverRelationsResult = {
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
  /** Before snapshot of relations (for presentationMeta). */
  readonly _before?: RelationSnapshot[]
  /** After snapshot of relations (for presentationMeta). */
  readonly _after?: RelationSnapshot[]
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

/** Capture current dimension_refs snapshot for tables in scope. */
function captureRelationSnapshot(schema: SemanticLayerService, tables?: readonly string[]): RelationSnapshot[] {
  const snapshot: RelationSnapshot[] = []
  const root = schema.semanticRoot
  if (!root) return snapshot
  for (const t of loadTables(root)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    const name = r.data.table_name
    if (tables !== undefined && tables.length > 0 && !tables.includes(name)) continue
    const refs = (r.data as unknown as { dimension_refs?: RawDimRef[] }).dimension_refs ?? []
    snapshot.push({
      table: name,
      refs: refs.map(ref => ({
        dim_table: ref.dim_table,
        join_keys: ref.join_keys.map(k => ({ dws_column: k.dws_column, dim_column: k.dim_column })),
        derivation: ref.derivation ?? '',
      })),
    })
  }
  return snapshot
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

  const before = captureRelationSnapshot(schema, validated.length > 0 ? validated : undefined)

  try {
    const res = await schema.discoverRelations(validated.length > 0 ? { tables: validated } : {})
    const after = captureRelationSnapshot(schema, validated.length > 0 ? validated : undefined)
    return { ok: true, enriched: res.enriched, written: res.written, errors: res.errors, _before: before, _after: after }
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

/** Compute added relations by diffing before and after snapshots. */
function computeAddedRelations(
  before: RelationSnapshot[],
  after: RelationSnapshot[],
): AddedRelation[] {
  const added: AddedRelation[] = []
  const beforeMap = new Map<string, Set<string>>()
  for (const snap of before) {
    const keys = new Set<string>()
    for (const ref of snap.refs) keys.add(`${ref.dim_table}::${JSON.stringify(ref.join_keys)}`)
    beforeMap.set(snap.table, keys)
  }
  for (const snap of after) {
    const priorKeys = beforeMap.get(snap.table) ?? new Set()
    for (const ref of snap.refs) {
      const key = `${ref.dim_table}::${JSON.stringify(ref.join_keys)}`
      if (!priorKeys.has(key)) {
        added.push({ table: snap.table, dim_table: ref.dim_table, join_keys: ref.join_keys, derivation: ref.derivation })
      }
    }
  }
  return added
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
        text: formatDiscoverRelations(value),
      }],
      presentationMeta: (_args, value) => {
        const v = value as DiscoverRelationsResult
        if (!v.ok || !v._before || !v._after) return { ok: false }
        const added = computeAddedRelations(v._before, v._after)
        return {
          ok: true,
          enriched: v.enriched ?? 0,
          written: v.written ?? 0,
          before: v._before,
          after: v._after,
          added,
        }
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('discover_relations aborted before enriching')
      }
      const schema = ctx.get('schema')
      return discoverRelationsResult(schema, args.tables)
    },
    presentCall(args): GenericCallView {
      const tables = args.tables
      const scope = tables !== undefined && tables.length > 0
        ? `${tables.length} table${tables.length > 1 ? 's' : ''}`
        : 'all tables'
      return {
        card: 'generic',
        title: `Discover Relations (${scope})`,
        kind: 'search',
      }
    },
    presentResult(_args, result: ToolResult): GenericResultView | undefined {
      if (result.isError) return undefined
      const meta = result.meta as { ok?: boolean; enriched?: number; added?: unknown[] } | undefined
      if (!meta?.ok) return { card: 'generic', title: 'Relations discovery failed' }
      const addedCount = meta.added?.length ?? 0
      return {
        card: 'generic',
        title: addedCount > 0
          ? `+${addedCount} relation${addedCount > 1 ? 's' : ''} discovered`
          : `${meta.enriched ?? 0} table${(meta.enriched ?? 0) !== 1 ? 's' : ''} enriched (no new relations)`,
      }
    },
  }))
}
