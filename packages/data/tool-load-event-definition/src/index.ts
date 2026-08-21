/**
 * Model-facing `load_event_definition` tool — the UNDERSTANDING/GENERATION-phase
 * schema-grounding entry for event (埋点) definitions. The agent calls it to
 * load a validated event definition (params_fields / metrics / disambiguation /
 * external dimension refs) from the semantic-layer substrate before it writes
 * SQL over an event ODS table.
 *
 * P6b deferred follow-up (load_* 接入): this is the model-facing wrapper over
 * `ctx.schema.loadEventDefinition` (the substrate shipped in P6b, commit
 * 88524504f8). It mirrors `tool-search-data-sources` (P13b commit 0e1a0fdf25)
 * and `tool-load-table-definition` for the `defineTool` + `ctx.tools.register`
 * registration shape, including the projection to a model-facing shape (the
 * substrate `EventDefinition` carries a zod `.loose()` `[x: string]: unknown`
 * index + workflow-state fields that cannot cross the DSL-typed output boundary
 * directly, so — like `SearchHit`/`TableModel` — an `EventModel` projection
 * carries the SQL-grounding fields to the model).
 *
 * The `event_name` parameter is model input (untrusted). P6b code-review #5
 * deferred a definition-name path-traversal guard to "load_* 接入"; this tool
 * validates the name at the boundary (rejects `/`, `\`, `..`, NUL) for
 * intranet-security-first defense-in-depth. The substrate's read path matches
 * by the event `name` field (not by filename), so traversal is not reachable
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
 * @module @deepseek-ai/dsh-tool-load-event-definition
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { EventDefinition } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'

export const name = 'tool-load-event-definition'
export const inject = ['tools']

/** Configuration for the load_event_definition tool (no knobs; the substrate owns the data). */
export interface Config {}

/** Runtime configuration schema for the load_event_definition plugin. */
export const Config: z<Config> = z.object({})

/**
 * Validate a definition name at the model-input boundary (P6b #5 deferred
 * follow-up; intranet-security-first). Rejects path-traversal sequences
 * (`/`, `\`, `..`, NUL) and empty names. The substrate read path matches by
 * the event `name` field rather than by filename, so this is defense-in-depth
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
// Maps (params_fields, metrics) become arrays: the dsh-tools value-schema DSL
// cannot express a schema-valued `additionalProperties`, so a field/metric map
// projects to an array of `{ name, ... }` — type-safe in both directions +
// DSL-compliant.

/** A model-facing event parameter field (the map key becomes `name`). */
export type EventParamField = {
  readonly name: string
  readonly type: string
  readonly description?: string
}
/** A model-facing metric projection (the map key becomes `name`). */
export type EventMetric = {
  readonly name: string
  readonly expression?: string
  readonly description?: string
}
/** A model-facing disambiguation rule projection. */
export type EventDisambiguation = {
  readonly event: string
  readonly trigger?: string
  readonly distinction?: string
}
/** A model-facing external dimension reference projection (join keys preserved). */
export type EventDimensionRef = {
  readonly dim_table: string
  readonly join_keys: { readonly dws_column: string; readonly dim_column: string }[]
  readonly derivation?: string
}
/**
 * The model-facing event projection: the SQL-grounding fields the agent reads,
 * projected from the validated substrate `EventDefinition`. Workflow-state
 * fields (confirmation / coverage) are dropped. Fields are optional to match
 * the output-schema-inferred shape.
 */
export type EventModel = {
  readonly name?: string
  readonly event_filter?: string
  readonly description?: string
  readonly domains?: string[]
  readonly params_fields?: EventParamField[]
  readonly metrics?: EventMetric[]
  readonly disambiguation?: EventDisambiguation[]
  readonly external_refs?: EventDimensionRef[]
}

/**
 * Project a validated substrate `EventDefinition` to the model-facing
 * `EventModel` (drops workflow-state fields; the params_fields + metrics maps
 * become arrays). Exported so the projection is testable without a Cordis context.
 * @param def - the validated substrate event definition to project.
 * @returns the model-facing projection carrying the SQL-grounding fields.
 */
export function projectEvent(def: EventDefinition): EventModel {
  return {
    name: def.name,
    event_filter: def.event_filter,
    description: def.description,
    domains: def.domains,
    params_fields: Object.entries(def.params_fields).map(([name, f]) => ({
      name,
      type: f.type,
      ...(f.description !== '' ? { description: f.description } : {}),
    })),
    metrics: Object.entries(def.metrics).map(([name, v]) => ({
      name,
      ...(v.expression !== '' ? { expression: v.expression } : {}),
      ...(v.description !== '' ? { description: v.description } : {}),
    })),
    disambiguation: def.disambiguation.map(d => ({
      event: d.event,
      ...(d.trigger !== '' ? { trigger: d.trigger } : {}),
      ...(d.distinction !== '' ? { distinction: d.distinction } : {}),
    })),
    external_refs: def.external_refs.map(d => ({
      dim_table: d.dim_table,
      join_keys: d.join_keys.map(k => ({ dws_column: k.dws_column, dim_column: k.dim_column })),
      ...(d.derivation !== '' ? { derivation: d.derivation } : {}),
    })),
  }
}

/** The canonical value returned by `load_event_definition`'s `execute`. */
export interface LoadEventResult {
  /** Whether a validated event definition was found. */
  readonly found: boolean
  /** The projected event definition when `found`, else omitted. */
  readonly event?: EventModel
  /** A short reason when `!found` (invalid name / not mounted / not found). */
  readonly message?: string
}

/**
 * The pure load core — probe the schema seam, load + validate + project the
 * event definition. Exported so the probe + guard + load are testable without
 * a Cordis context. `schema` is `undefined` when no `ctx.schema` provider is
 * mounted (the "callable but unwired" honest state).
 * @param schema - the semantic-layer service (`ctx.get('schema')`), or undefined when unmounted.
 * @param eventName - the model-supplied event name to load.
 * @returns `{ found: true, event }` on a hit, or `{ found: false, message }` otherwise.
 */
export function loadEventDefinitionResult(
  schema: SemanticLayerService | undefined,
  eventName: string,
): LoadEventResult {
  const name = validateDefinitionName(eventName)
  if (name === null) {
    return { found: false, message: `invalid event_name: ${JSON.stringify(eventName)}` }
  }
  if (schema === undefined) {
    return { found: false, message: 'semantic-layer substrate not mounted (ctx.schema unavailable)' }
  }
  const event = schema.loadEventDefinition(name)
  if (event === null) {
    return { found: false, message: `event not found: ${name}` }
  }
  return { found: true, event: projectEvent(event) }
}

/**
 * Format a projected event definition as readable text for the model. Iterates
 * the array projections (no map index access), so it is safe under
 * `noUncheckedIndexedAccess`.
 * @param event - the projected event definition to format.
 * @returns a multi-line text block the model reads in the tool result.
 */
export function formatEventDefinition(event: EventModel): string {
  const lines: string[] = []
  if (event.name !== undefined) lines.push(`event: ${event.name}`)
  if (event.description !== undefined && event.description !== '') lines.push(`description: ${event.description}`)
  if (event.event_filter !== undefined && event.event_filter !== '') lines.push(`event_filter: ${event.event_filter}`)
  if (event.domains !== undefined && event.domains.length > 0) lines.push(`domains: ${event.domains.join(', ')}`)
  if (event.params_fields !== undefined && event.params_fields.length > 0) {
    lines.push('params_fields:')
    for (const f of event.params_fields) {
      lines.push(`  - ${f.name} ${f.type}${f.description !== undefined && f.description !== '' ? ` // ${f.description}` : ''}`)
    }
  }
  if (event.metrics !== undefined && event.metrics.length > 0) {
    lines.push('metrics:')
    for (const m of event.metrics) {
      lines.push(`  - ${m.name}${m.expression !== undefined && m.expression !== '' ? ` = ${m.expression}` : ''}${m.description !== undefined && m.description !== '' ? ` // ${m.description}` : ''}`)
    }
  }
  if (event.disambiguation !== undefined && event.disambiguation.length > 0) {
    lines.push('disambiguation:')
    for (const d of event.disambiguation) {
      lines.push(`  - ${d.event}${d.trigger !== undefined && d.trigger !== '' ? ` (${d.trigger})` : ''}${d.distinction !== undefined && d.distinction !== '' ? `: ${d.distinction}` : ''}`)
    }
  }
  if (event.external_refs !== undefined && event.external_refs.length > 0) {
    lines.push('external_refs:')
    for (const d of event.external_refs) {
      const keys = d.join_keys.map(k => `${k.dws_column}=${k.dim_column}`).join(', ')
      lines.push(`  - ${d.dim_table} [${keys}]${d.derivation !== undefined && d.derivation !== '' ? ` // ${d.derivation}` : ''}`)
    }
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'load_event_definition',
    description:
      'Load a validated event (埋点) definition (params_fields, metrics, '
      + 'disambiguation, external dimension references) from the semantic layer. '
      + 'Call this in the UNDERSTANDING/GENERATION phase to ground SQL in the '
      + 'real event schema before writing or critiquing a query over an event '
      + 'ODS table. Returns the projected event definition when found, or a '
      + 'not-found / not-mounted message.',
    parameters: {
      event_name: {
        type: 'string',
        required: true,
        description: 'The event name (its `name` key in the semantic layer) to load.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          message: { type: 'string' },
          // The `event` value is the typed `EventModel` projection (see
          // projectEvent); the schema declares it as an open object so the
          // substrate's zod `.loose()` index + required workflow fields never
          // cross the DSL-typed boundary. The render casts back to `EventModel`.
          event: { type: 'object', additionalProperties: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.found && value.event !== undefined
          ? formatEventDefinition(value.event as unknown as EventModel)
          : (value.message ?? 'Event not found.'),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('load_event_definition aborted before loading')
      }
      const schema = ctx.get('schema') as SemanticLayerService | undefined
      return loadEventDefinitionResult(schema, args.event_name)
    },
  }))
}
