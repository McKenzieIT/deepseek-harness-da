// PROTOTYPE (throwaway) — P6 semantic-layer substrate · zod schemas mirroring RBI pydantic.
// Source of truth for the mirrored shapes: reverse-bi/libs/rbi-core/src/rbi_core/models/semantic.py
// (EventDefinition / TableDefinition + sub-models). Every model is _Loose (extra='allow') =>
// zod .passthrough() so unknown keys round-trip (forward-compat, mirrors RBI A1 round-trip needs).
// canonicalize_type mirrors RBI canonicalize_type (physical -> DB-agnostic logical).

import { z } from 'zod'

// ── Canonical logical type vocabulary (A2) ──────────────────────────────
// reverse-bi normalizes physical type spellings to a small DB-agnostic set so the LLM
// never sees dialect noise (bigint vs int8). Mirrors rbi_core/models/semantic.py:_CANONICAL_TYPE_MAP.
const CANONICAL_TYPE_MAP = {
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

// Mirrors canonicalize_type: complex/parametrized types (array<...>, map<...>, struct<...>,
// decimal(p,s)) preserved verbatim; unknown scalars pass through unchanged.
export function canonicalizeType(raw) {
  if (!raw || typeof raw !== 'string') return raw
  const t = raw.trim()
  if (t.includes('<') || t.includes('(')) return t
  return CANONICAL_TYPE_MAP[t.toLowerCase()] ?? t
}

// pydantic field_validator(mode="before") on type => zod .transform (post-parse canonicalize;
// sufficient for the prototype: input "bigint" -> stored "int", round-trips canonicalized).
const canonType = () => z.string().transform(canonicalizeType)

// ── Sub-models (all _Loose => .passthrough()) ───────────────────────────
export const Confirmation = z.object({
  status: z.string().default('draft'),
  confirmed_by: z.string().default(''),
  confirmed_at: z.string().default(''),
}).passthrough()

export const CoverageDef = z.object({
  scenarios: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  coverage_status: z.string().default('draft'),
}).passthrough()

export const SupersedesDef = z.object({
  source: z.string(),
  when: z.string().default(''),
  advantage: z.string().default(''),
}).passthrough()

export const ParamField = z.object({
  type: canonType(),
  description: z.string().default(''),
}).passthrough()

export const CaliberVariant = z.object({
  id: z.string(),
  description: z.string().default(''),
  default: z.boolean().default(false),
}).passthrough()

// MetricDef: model_validator — at most one default caliber_variant.
export const MetricDef = z.object({
  expression: z.string().default(''),
  description: z.string().default(''),
  caliber_variants: z.array(CaliberVariant).default([]),
}).passthrough().refine(
  m => m.caliber_variants.filter(v => v.default).length <= 1,
  { message: 'a metric may declare at most one default caliber_variant' },
)

export const Disambiguation = z.object({
  event: z.string(),
  trigger: z.string().default(''),
  distinction: z.string().default(''),
}).passthrough()

export const TableTermDefaults = z.object({
  term_defaults: z.record(z.string(), z.string()).default({}),
}).passthrough()

export const DimensionKeyPair = z.object({
  dws_column: z.string(),
  dim_column: z.string(),
}).passthrough()

// DimensionRef: model_validator — join_keys must contain >= 1 pair.
export const DimensionRef = z.object({
  dim_table: z.string(),
  join_keys: z.array(DimensionKeyPair),
  derivation: z.string().default(''),
}).passthrough().refine(
  d => d.join_keys.length > 0,
  { message: 'join_keys must contain at least one key pair' },
)

// ── EventDefinition (埋点) ──────────────────────────────────────────────
export const EventDefinition = z.object({
  name: z.string(),
  event_filter: z.string().default(''),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  params_fields: z.record(z.string(), ParamField).default({}),
  metrics: z.record(z.string(), MetricDef).default({}),
  disambiguation: z.array(Disambiguation).default([]),
  external_refs: z.array(DimensionRef).default([]),
  confirmation: Confirmation.default({ status: 'draft', confirmed_by: '', confirmed_at: '' }),
  coverage: CoverageDef.nullable().default(null),
}).passthrough()

// ── TableDefinition (表) ────────────────────────────────────────────────
export const ColumnDef = z.object({
  name: z.string(),
  type: canonType(),
  comment: z.string().default(''),
  role: z.string().default(''),
}).passthrough()

export const PartitionDef = z.object({
  name: z.string(),
  type: canonType(),
}).passthrough()

// TableDefinition: model_validator _kind_constraints — DIM requires primary_key + label_columns.
export const TableDefinition = z.object({
  table_name: z.string(),
  table_comment: z.string().default(''),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  granularity: z.string().default(''),
  engine: z.string().default('maxcompute'),
  columns: z.array(ColumnDef).default([]),
  metrics: z.record(z.string(), MetricDef).default({}),
  partitions: z.array(PartitionDef).default([]),
  confirmation: Confirmation.default({ status: 'draft', confirmed_by: '', confirmed_at: '' }),
  coverage: CoverageDef.nullable().default(null),
  supersedes: z.array(SupersedesDef).default([]),
  disambiguation: TableTermDefaults.nullable().default(null),
  kind: z.enum(['dws', 'dim']).default('dws'),
  primary_key: z.array(z.string()).default([]),
  primary_key_unique: z.boolean().nullable().default(null),
  duplicate_sample: z.array(z.record(z.string(), z.string())).default([]),
  label_columns: z.array(z.string()).default([]),
  freshness: z.enum(['静态参考', 'T+1', '']).default(''),
  dimension_refs: z.array(DimensionRef).default([]),
}).passthrough().superRefine((t, ctx) => {
  if (t.kind === 'dim') {
    if (!t.primary_key || t.primary_key.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DIM 表 primary_key 不能为空' })
    }
    if (!t.label_columns || t.label_columns.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DIM 表 label_columns 不能为空' })
    }
  }
})

// TableMeta (the schema-dict shape DataSourceConnector returns; not a semantic definition,
// but the input to sync-write). Mirrors rbi-semantic/sync.py:TableMeta + connectors/base.py:TableMeta.
export const ColumnMeta = z.object({
  name: z.string(),
  type: z.string(),
  comment: z.string().optional().nullable(),
})
export const PartitionMeta = z.object({ name: z.string(), type: z.string() })
export const TableMeta = z.object({
  table_name: z.string(),
  columns: z.array(ColumnMeta).default([]),
  partitions: z.array(PartitionMeta).default([]),
  comment: z.string().optional().nullable(),
}).passthrough()
