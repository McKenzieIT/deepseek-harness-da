/**
 * P6b semantic-layer substrate — zod schemas mirroring RBI pydantic.
 *
 * Source of truth for the mirrored shapes: reverse-bi/libs/rbi-core/src/rbi_core/models/semantic.py
 * (EventDefinition / TableDefinition + sub-models). Every model is _Loose
 * (extra='allow') => zod `.passthrough()` so unknown keys round-trip
 * (forward-compat, mirrors RBI A1 round-trip needs). `canonicalizeType` mirrors
 * RBI canonicalize_type (physical -> DB-agnostic logical).
 *
 * P6b grilling: zod (NOT schemastery — schemastery has no `.passthrough`, and
 * mirroring pydantic `extra=allow` / `model_validator` / `canonicalize_type`
 * requires zod's `.passthrough` / `.refine` / `.superRefine` / `.transform`).
 * Substrate deps = zod + js-yaml only (P6 D2).
 *
 * Schemas are named `XxxSchema` (the zod schema value) + `Xxx` (the inferred
 * type) so consumers (P13b swap) import the type for `params_fields` /
 * `partitions` access without colliding with the schema value.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/types
 */
import { z } from 'zod'

// ── Canonical logical type vocabulary (A2) ──────────────────────────────
// reverse-bi normalizes physical type spellings to a small DB-agnostic set so
// the LLM never sees dialect noise (bigint vs int8). Mirrors
// rbi_core/models/semantic.py:_CANONICAL_TYPE_MAP.
const CANONICAL_TYPE_MAP: Readonly<Record<string, string>> = {
  int: 'int', integer: 'int', bigint: 'int', tinyint: 'int', smallint: 'int', long: 'int',
  int2: 'int', int4: 'int', int8: 'int', serial: 'int',
  decimal: 'decimal', numeric: 'decimal', number: 'decimal', float: 'decimal', double: 'decimal',
  real: 'decimal', float4: 'decimal', float8: 'decimal',
  string: 'string', text: 'string', varchar: 'string', char: 'string', bpchar: 'string',
  bool: 'bool', boolean: 'bool',
  date: 'datetime', datetime: 'datetime', timestamp: 'datetime', timestamptz: 'datetime',
  json: 'json', jsonb: 'json', object: 'json', map: 'json', struct: 'json',
  array: 'array', list: 'array',
  binary: 'binary', bytea: 'binary', varbinary: 'binary',
}

/** Mirrors canonicalize_type: complex/parametrized types (array<...>, map<...>,
 *  struct<...>, decimal(p,s)) preserved verbatim; unknown scalars pass through. */
export function canonicalizeType(raw: string | undefined | null): string | undefined | null {
  if (!raw || typeof raw !== 'string') return raw
  const t = raw.trim()
  if (t.includes('<') || t.includes('(')) return t
  return CANONICAL_TYPE_MAP[t.toLowerCase()] ?? t
}

// pydantic field_validator(mode="before") on type => zod .transform
// (post-parse canonicalize; input "bigint" -> stored "int", round-trips canonicalized).
const canonType = () => z.string().transform(canonicalizeType)

// ── Sub-models (all _Loose => .passthrough()) ───────────────────────────
export const ConfirmationSchema = z.object({
  status: z.string().default('draft'),
  confirmed_by: z.string().default(''),
  confirmed_at: z.string().default(''),
}).loose()
export type Confirmation = z.infer<typeof ConfirmationSchema>

export const CoverageDefSchema = z.object({
  scenarios: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  coverage_status: z.string().default('draft'),
}).loose()
export type CoverageDef = z.infer<typeof CoverageDefSchema>

export const SupersedesDefSchema = z.object({
  source: z.string(),
  when: z.string().default(''),
  advantage: z.string().default(''),
}).loose()
export type SupersedesDef = z.infer<typeof SupersedesDefSchema>

export const ParamFieldSchema = z.object({
  type: canonType(),
  description: z.string().default(''),
}).loose()
export type ParamField = z.infer<typeof ParamFieldSchema>

export const CaliberVariantSchema = z.object({
  id: z.string(),
  description: z.string().default(''),
  default: z.boolean().default(false),
}).loose()
export type CaliberVariant = z.infer<typeof CaliberVariantSchema>

// MetricDef: model_validator — at most one default caliber_variant.
export const MetricDefSchema = z.object({
  expression: z.string().default(''),
  description: z.string().default(''),
  caliber_variants: z.array(CaliberVariantSchema).default([]),
}).loose().refine(
  m => m.caliber_variants.filter(v => v.default).length <= 1,
  { message: 'a metric may declare at most one default caliber_variant' },
)
export type MetricDef = z.infer<typeof MetricDefSchema>

export const DisambiguationSchema = z.object({
  event: z.string(),
  trigger: z.string().default(''),
  distinction: z.string().default(''),
}).loose()
export type Disambiguation = z.infer<typeof DisambiguationSchema>

export const TableTermDefaultsSchema = z.object({
  term_defaults: z.record(z.string(), z.string()).default({}),
}).loose()
export type TableTermDefaults = z.infer<typeof TableTermDefaultsSchema>

export const DimensionKeyPairSchema = z.object({
  dws_column: z.string(),
  dim_column: z.string(),
}).loose()
export type DimensionKeyPair = z.infer<typeof DimensionKeyPairSchema>

// DimensionRef: model_validator — join_keys must contain >= 1 pair.
export const DimensionRefSchema = z.object({
  dim_table: z.string(),
  join_keys: z.array(DimensionKeyPairSchema),
  derivation: z.string().default(''),
}).loose().refine(
  d => d.join_keys.length > 0,
  { message: 'join_keys must contain at least one key pair' },
)
export type DimensionRef = z.infer<typeof DimensionRefSchema>

// ── EventDefinition (埋点) ──────────────────────────────────────────────
export const EventDefinitionSchema = z.object({
  name: z.string(),
  event_filter: z.string().default(''),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  params_fields: z.record(z.string(), ParamFieldSchema).default({}),
  metrics: z.record(z.string(), MetricDefSchema).default({}),
  disambiguation: z.array(DisambiguationSchema).default([]),
  external_refs: z.array(DimensionRefSchema).default([]),
  confirmation: ConfirmationSchema.default({ status: 'draft', confirmed_by: '', confirmed_at: '' }),
  coverage: CoverageDefSchema.nullable().default(null),
}).loose()
export type EventDefinition = z.infer<typeof EventDefinitionSchema>

// ── TableDefinition (表) ────────────────────────────────────────────────
export const ColumnDefSchema = z.object({
  name: z.string(),
  type: canonType(),
  comment: z.string().default(''),
  role: z.string().default(''),
}).loose()
export type ColumnDef = z.infer<typeof ColumnDefSchema>

export const PartitionDefSchema = z.object({
  name: z.string(),
  type: canonType(),
}).loose()
export type PartitionDef = z.infer<typeof PartitionDefSchema>

// TableDefinition: model_validator _kind_constraints — DIM requires primary_key + label_columns.
export const TableDefinitionSchema = z.object({
  table_name: z.string(),
  table_comment: z.string().default(''),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  granularity: z.string().default(''),
  engine: z.string().default('maxcompute'),
  columns: z.array(ColumnDefSchema).default([]),
  metrics: z.record(z.string(), MetricDefSchema).default({}),
  partitions: z.array(PartitionDefSchema).default([]),
  confirmation: ConfirmationSchema.default({ status: 'draft', confirmed_by: '', confirmed_at: '' }),
  coverage: CoverageDefSchema.nullable().default(null),
  supersedes: z.array(SupersedesDefSchema).default([]),
  disambiguation: TableTermDefaultsSchema.nullable().default(null),
  kind: z.enum(['dws', 'dim']).default('dws'),
  primary_key: z.array(z.string()).default([]),
  primary_key_unique: z.boolean().nullable().default(null),
  duplicate_sample: z.array(z.record(z.string(), z.string())).default([]),
  label_columns: z.array(z.string()).default([]),
  freshness: z.enum(['静态参考', 'T+1', '']).default(''),
  dimension_refs: z.array(DimensionRefSchema).default([]),
}).loose().superRefine((t, ctx) => {
  if (t.kind === 'dim') {
    if (t.primary_key.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'DIM 表 primary_key 不能为空' })
    }
    if (t.label_columns.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'DIM 表 label_columns 不能为空' })
    }
  }
})
export type TableDefinition = z.infer<typeof TableDefinitionSchema>

// ── TableMeta (the schema-dict shape DataSourceConnector returns; not a
//    semantic definition, but the input to sync-write). Mirrors
//    rbi-semantic/sync.py:TableMeta + connectors/base.py:TableMeta. ─────────
export const ColumnMetaSchema = z.object({
  name: z.string(),
  type: z.string(),
  comment: z.string().optional().nullable(),
})
export type ColumnMeta = z.infer<typeof ColumnMetaSchema>

export const PartitionMetaSchema = z.object({ name: z.string(), type: z.string() })
export type PartitionMeta = z.infer<typeof PartitionMetaSchema>

export const TableMetaSchema = z.object({
  table_name: z.string(),
  columns: z.array(ColumnMetaSchema).default([]),
  partitions: z.array(PartitionMetaSchema).default([]),
  comment: z.string().optional().nullable(),
}).loose()
export type TableMeta = z.infer<typeof TableMetaSchema>
