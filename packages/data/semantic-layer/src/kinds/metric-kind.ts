/**
 * Metric kind plugin — implements DataSourceKindPlugin for metric definitions.
 * G2 Decision: metrics are first-class entities (graph nodes) with computation
 * rules (Level 2 = LLM context, Level 2.5 = executable SQL template).
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/kinds/metric-kind
 */
import { z } from 'zod'
import type { DataSourceKindPlugin, RelationDef, CriticFields, CorpusItem } from '../registry.ts'
import type { EventTerminology } from '../corpus.ts'

// ── MetricDefinition Schema ─────────────────────────────────────────────

const MetricComputationSchema = z.object({
  sql: z.string().default(''),
  metadata: z.object({
    aggregation: z.string().default(''),
    field: z.string().default(''),
    source: z.string().default(''),
    time_grain: z.string().default(''),
  }).loose().default({ aggregation: '', field: '', source: '', time_grain: '' }),
}).loose()

const MetricRelationSchema = z.object({
  type: z.enum(['joins', 'derived_from', 'related_to']),
  target: z.string(),
  on: z.string().optional(),
  description: z.string().default(''),
}).loose()

export const MetricDefinitionSchema = z.object({
  kind: z.literal('metric').default('metric'),
  name: z.string(),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  computation: MetricComputationSchema.default({ sql: '', metadata: { aggregation: '', field: '', source: '', time_grain: '' } }),
  relations: z.array(MetricRelationSchema).default([]),
}).loose()

export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>

// ── MetricKindPlugin ────────────────────────────────────────────────────

export const metricKindPlugin: DataSourceKindPlugin<MetricDefinition> = {
  kind: 'metric',
  schema: MetricDefinitionSchema,
  storageDir: 'metrics',

  getId(raw) {
    return typeof raw.name === 'string' ? raw.name : undefined
  },

  toCorpusItem(def, _terminology?: EventTerminology): CorpusItem | null {
    const parts: string[] = []
    if (def.description) parts.push(def.description)
    if (def.computation.metadata.aggregation) {
      parts.push(def.computation.metadata.aggregation)
    }
    if (def.computation.metadata.field) {
      parts.push(def.computation.metadata.field)
    }
    return {
      id: def.name,
      ...(parts.length > 0 ? { description: parts.join(' ') } : {}),
      payload: def,
    }
  },

  toPromptContext(def): string {
    const lines: string[] = []
    lines.push(`Metric: ${def.name}`)
    if (def.description) lines.push(`Description: ${def.description}`)
    if (def.domains.length > 0) lines.push(`Domains: ${def.domains.join(', ')}`)
    if (def.computation.sql) {
      lines.push('')
      lines.push(`SQL: ${def.computation.sql}`)
    }
    const meta = def.computation.metadata
    if (meta.aggregation || meta.field || meta.source) {
      lines.push('')
      lines.push('Computation:')
      if (meta.aggregation) lines.push(`  Aggregation: ${meta.aggregation}`)
      if (meta.field) lines.push(`  Field: ${meta.field}`)
      if (meta.source) lines.push(`  Source: ${meta.source}`)
      if (meta.time_grain) lines.push(`  Time Grain: ${meta.time_grain}`)
    }
    return lines.join('\n')
  },

  toCriticContext(_def): CriticFields {
    return {}
  },

  relations(def): RelationDef[] {
    return def.relations.map(r => ({
      type: r.type,
      target: r.target,
      ...(r.on ? { on: r.on } : {}),
      ...(r.description ? { description: r.description } : {}),
    }))
  },

  toExecutableRule(def): string | null {
    return def.computation.sql || null
  },
}
