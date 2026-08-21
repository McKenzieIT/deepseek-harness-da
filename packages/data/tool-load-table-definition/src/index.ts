/**
 * Model-facing `load_table_definition` tool — the UNDERSTANDING/GENERATION-phase
 * schema-grounding entry. The agent calls it to load a validated table definition
 * (columns / partitions / primary key / metrics / dimension refs) from the
 * semantic-layer substrate before it writes SQL.
 *
 * P6b deferred follow-up (load_* 接入): this is the model-facing wrapper over
 * `ctx.schema.loadTableDefinition` (the substrate shipped in P6b, commit
 * 88524504f8). It mirrors `tool-search-data-sources` (the first model-facing
 * tool, P13b commit 0e1a0fdf25) for the `defineTool` + `ctx.tools.register`
 * registration shape, including the projection to a model-facing shape (the
 * substrate `TableDefinition` carries a zod `.loose()` `[x: string]: unknown`
 * index + workflow-state fields that cannot cross the DSL-typed output boundary
 * directly, so — like `SearchHit` — a `TableModel` projection carries the
 * SQL-grounding fields to the model).
 *
 * The `table_name` parameter is model input (untrusted). P6b code-review #5
 * deferred a definition-name path-traversal guard to "load_* 接入"; this tool
 * validates the name at the boundary (rejects `/`, `\`, `..`, NUL) for
 * intranet-security-first defense-in-depth. The substrate's read path matches
 * by the `table_name` field (not by filename), so traversal is not reachable
 * today; the guard is defense-in-depth against future substrate changes.
 *
 * The `ctx.schema` seam is probed via `ctx.get('schema')` (returns `undefined`
 * when no provider is mounted) so the tool loads without the substrate mounted
 * — the "callable but unwired" honest state (returns `found:false` with a
 * message, mirroring `tool-search-data-sources`' empty-corpus thin default).
 * The data-agent bundle mounts `@deepseek-ai/dsh-semantic-layer` so the seam is
 * registered; with an empty `semanticRoot` the substrate returns `null`
 * (not-found, no crash) until a real substrate dir is configured.
 *
 * @module @deepseek-ai/dsh-tool-load-table-definition
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TableDefinition } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-load-table-definition'
export const inject = ['tools']

/** Configuration for the load_table_definition tool (no knobs; the substrate owns the data). */
export interface Config {}

/** Runtime configuration schema for the load_table_definition plugin. */
export const Config: z<Config> = z.object({})

/**
 * Validate a definition name at the model-input boundary (P6b #5 deferred
 * follow-up; intranet-security-first). Rejects path-traversal sequences
 * (`/`, `\`, `..`, NUL) and empty names. The substrate read path matches by
 * the `table_name` field rather than by filename, so this is defense-in-depth
 * against future substrate changes — never the sole traversal control.
 * @param raw - the model-supplied name to validate.
 * @returns the trimmed name when valid, or `null` when it must be rejected.
 */
export function validateDefinitionName(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Reject path separators, parent-dir markers, and NUL. A single `.` (current
  // dir) is also rejected; interior dots like `foo.bar` are allowed.
  if (/[/\\\x00]|\.\./.test(trimmed) || trimmed === '.') return null
  return trimmed
}

// ── model-facing projection (mirrors tool-search-data-sources' SearchHit) ──
// Maps (metrics) become arrays: the dsh-tools value-schema DSL cannot express a
// schema-valued `additionalProperties`, so a metric map projects to an array of
// `{ name, ... }` — type-safe in both directions + DSL-compliant.

/** A model-facing table column (projection of the substrate ColumnDef). */
export type TableColumn = {
  readonly name: string
  readonly type: string
  readonly comment?: string
  readonly role?: string
}
/** A model-facing table partition (projection of the substrate PartitionDef). */
export type TablePartition = {
  readonly name: string
  readonly type: string
}
/** A model-facing metric projection (the map key becomes `name`). */
export type TableMetric = {
  readonly name: string
  readonly expression?: string
  readonly description?: string
}
/** A model-facing dimension reference projection (join keys preserved). */
export type TableDimensionRef = {
  readonly dim_table: string
  readonly join_keys: { readonly dws_column: string; readonly dim_column: string }[]
  readonly derivation?: string
}
/**
 * The model-facing table projection: the SQL-grounding fields the agent reads,
 * projected from the validated substrate `TableDefinition`. Workflow-state
 * fields (confirmation / coverage / supersedes / duplicate_sample) are dropped.
 * Fields are optional to match the output-schema-inferred shape.
 */
export type TableModel = {
  readonly table_name?: string
  readonly table_comment?: string
  readonly description?: string
  readonly kind?: string
  readonly granularity?: string
  readonly engine?: string
  readonly freshness?: string
  readonly primary_key?: string[]
  readonly label_columns?: string[]
  readonly columns?: TableColumn[]
  readonly partitions?: TablePartition[]
  readonly metrics?: TableMetric[]
  readonly dimension_refs?: TableDimensionRef[]
}

/**
 * Project a validated substrate `TableDefinition` to the model-facing
 * `TableModel` (drops workflow-state fields; the metrics map becomes an array).
 * Exported so the projection is testable without a Cordis context.
 * @param def - the validated substrate table definition to project.
 * @returns the model-facing projection carrying the SQL-grounding fields.
 */
export function projectTable(def: TableDefinition): TableModel {
  return {
    table_name: def.table_name,
    table_comment: def.table_comment,
    description: def.description,
    kind: def.kind,
    granularity: def.granularity,
    engine: def.engine,
    freshness: def.freshness,
    primary_key: def.primary_key,
    label_columns: def.label_columns,
    columns: def.columns.map(c => ({
      name: c.name,
      type: c.type,
      ...(c.comment !== '' ? { comment: c.comment } : {}),
      ...(c.role !== '' ? { role: c.role } : {}),
    })),
    partitions: def.partitions.map(p => ({ name: p.name, type: p.type })),
    metrics: Object.entries(def.metrics).map(([name, v]) => ({
      name,
      ...(v.expression !== '' ? { expression: v.expression } : {}),
      ...(v.description !== '' ? { description: v.description } : {}),
    })),
    dimension_refs: def.dimension_refs.map(d => ({
      dim_table: d.dim_table,
      join_keys: d.join_keys.map(k => ({ dws_column: k.dws_column, dim_column: k.dim_column })),
      ...(d.derivation !== '' ? { derivation: d.derivation } : {}),
    })),
  }
}

/** The canonical value returned by `load_table_definition`'s `execute`. */
export interface LoadTableResult {
  /** Whether a validated table definition was found. */
  readonly found: boolean
  /** The projected table definition when `found`, else omitted. */
  readonly table?: TableModel
  /** A short reason when `!found` (invalid name / not mounted / not found). */
  readonly message?: string
}

/**
 * The pure load core — probe the schema seam, load + validate + project the
 * table definition. Exported so the probe + guard + load are testable without
 * a Cordis context. `schema` is `undefined` when no `ctx.schema` provider is
 * mounted (the "callable but unwired" honest state).
 * @param schema - the semantic-layer service (`ctx.get('schema')`), or undefined when unmounted.
 * @param tableName - the model-supplied table name to load.
 * @returns `{ found: true, table }` on a hit, or `{ found: false, message }` otherwise.
 */
export function loadTableDefinitionResult(
  schema: SemanticLayerService | undefined,
  tableName: string,
): LoadTableResult {
  const name = validateDefinitionName(tableName)
  if (name === null) {
    return { found: false, message: `invalid table_name: ${JSON.stringify(tableName)}` }
  }
  if (schema === undefined) {
    return { found: false, message: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  const table = schema.loadTableDefinition(name)
  if (table === null) {
    return { found: false, message: `table not found: ${name}` }
  }
  return { found: true, table: projectTable(table) }
}

/**
 * Format a projected table definition as readable text for the model. Iterates
 * the array projections (no map index access), so it is safe under
 * `noUncheckedIndexedAccess`.
 * @param table - the projected table definition to format.
 * @returns a multi-line text block the model reads in the tool result.
 */
export function formatTableDefinition(table: TableModel): string {
  const lines: string[] = []
  if (table.table_name !== undefined) {
    lines.push(`table: ${table.table_name}${table.kind === 'dim' ? ' (dim)' : ''}`)
  }
  if (table.table_comment !== undefined && table.table_comment !== '') lines.push(`comment: ${table.table_comment}`)
  if (table.description !== undefined && table.description !== '') lines.push(`description: ${table.description}`)
  if (table.granularity !== undefined && table.granularity !== '') lines.push(`granularity: ${table.granularity}`)
  if (table.freshness !== undefined && table.freshness !== '') lines.push(`freshness: ${table.freshness}`)
  if (table.primary_key !== undefined && table.primary_key.length > 0) lines.push(`primary_key: ${table.primary_key.join(', ')}`)
  if (table.label_columns !== undefined && table.label_columns.length > 0) lines.push(`label_columns: ${table.label_columns.join(', ')}`)
  if (table.columns !== undefined && table.columns.length > 0) {
    lines.push('columns:')
    for (const c of table.columns) {
      lines.push(`  - ${c.name} ${c.type}${c.role !== undefined ? ` (${c.role})` : ''}${c.comment !== undefined && c.comment !== '' ? ` // ${c.comment}` : ''}`)
    }
  }
  if (table.partitions !== undefined && table.partitions.length > 0) {
    lines.push('partitions:')
    for (const p of table.partitions) {
      lines.push(`  - ${p.name} ${p.type}`)
    }
  }
  if (table.metrics !== undefined && table.metrics.length > 0) {
    lines.push('metrics:')
    for (const m of table.metrics) {
      lines.push(`  - ${m.name}${m.expression !== undefined && m.expression !== '' ? ` = ${m.expression}` : ''}${m.description !== undefined && m.description !== '' ? ` // ${m.description}` : ''}`)
    }
  }
  if (table.dimension_refs !== undefined && table.dimension_refs.length > 0) {
    lines.push('dimension_refs:')
    for (const d of table.dimension_refs) {
      const keys = d.join_keys.map(k => `${k.dws_column}=${k.dim_column}`).join(', ')
      lines.push(`  - ${d.dim_table} [${keys}]${d.derivation !== undefined && d.derivation !== '' ? ` // ${d.derivation}` : ''}`)
    }
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'load_table_definition',
    description:
      'Load a validated table definition (columns, partitions, primary key, '
      + 'metrics, dimension references) from the semantic layer. Call this in '
      + 'the UNDERSTANDING/GENERATION phase to ground SQL in the real schema '
      + 'before writing or critiquing a query. Returns the projected table '
      + 'definition when found, or a not-found / not-mounted message.',
    parameters: {
      table_name: {
        type: 'string',
        required: true,
        description: 'The table name (its `table_name` key in the semantic layer) to load.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          message: { type: 'string' },
          // The `table` value is the typed `TableModel` projection (see
          // projectTable); the schema declares it as an open object so the
          // substrate's zod `.loose()` index + required workflow fields never
          // cross the DSL-typed boundary. The render casts back to `TableModel`.
          table: { type: 'object', additionalProperties: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.found && value.table !== undefined
          ? formatTableDefinition(value.table as unknown as TableModel)
          : (value.message ?? 'Table not found.'),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('load_table_definition aborted before loading')
      }
      const schema = ctx.get('schema') as SemanticLayerService | undefined
      return loadTableDefinitionResult(schema, args.table_name)
    },
  }))
}
