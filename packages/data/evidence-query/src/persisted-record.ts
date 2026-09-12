/**
 * Runtime validation for eval-runner-service JSONL records.
 *
 * Version 2 is a closed durable format with complete replay evidence. The
 * unversioned schema preserves the legacy flat record accepted before the
 * service-owned format was introduced.
 * @module @deepseek-ai/dsh-evidence-query/persisted-record
 */

import { z } from 'zod'

const RunnerVerdictSchema = z.enum([
  'correct',
  'declined',
  'wrong',
  'unjudged',
  'infra_failure',
  'case_defect',
])

const LegacyVerdictSchema = z.string().nullable()

const RunConfigSchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  pass_k: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  sql_judge: z.boolean(),
  verdict_semantics: z.literal('pass^k'),
  responder: z.enum(['engine', 'harness']),
  scope_id: z.string().min(1),
  today: z.string().regex(/^\d{8}$/),
  query_expansion: z.boolean(),
  with_query: z.boolean(),
  executor_identity: z.string().min(1).optional(),
  comparator_policy_version: z.number().int().positive(),
  column_semantics: z.enum(['by-name', 'positional']),
  max_stored_rows: z.number().int().positive(),
  query_wait_seconds: z.number().int().positive().optional(),
  skip_health_gate: z.boolean(),
}).superRefine((config, context) => {
  if (config.with_query && config.executor_identity === undefined) {
    context.addIssue({ code: 'custom', path: ['executor_identity'], message: 'required when with_query is true' })
  }
  if (config.with_query && config.query_wait_seconds === undefined) {
    context.addIssue({ code: 'custom', path: ['query_wait_seconds'], message: 'required when with_query is true' })
  }
  if (!config.with_query && config.executor_identity !== undefined) {
    context.addIssue({ code: 'custom', path: ['executor_identity'], message: 'must be absent when with_query is false' })
  }
  if (!config.with_query && config.query_wait_seconds !== undefined) {
    context.addIssue({ code: 'custom', path: ['query_wait_seconds'], message: 'must be absent when with_query is false' })
  }
})

const ExecutionArtifactSchema = z.strictObject({
  kind: z.enum(['completed', 'pending', 'failed']),
  sql: z.string().nullable(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.json())),
  rawRows: z.array(z.json()).optional(),
  rowCount: z.number().int().nonnegative(),
  rowsStored: z.number().int().nonnegative(),
  providerTruncated: z.boolean(),
  storageTruncated: z.boolean(),
  instanceId: z.string().nullable(),
  failureKind: z.string().nullable(),
  failureClass: z.enum(['syntax_error', 'guard_rejected', 'infrastructure', 'timeout', 'patience']).nullable(),
  error: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  rawDigest: z.string().min(1),
  normalizedDigest: z.string().min(1),
  columnSemantics: z.enum(['by-name', 'positional']),
})

const AttemptSchema = z.strictObject({
  attempt_k: z.number().int().positive(),
  execution_outcome: z.enum(['pass', 'fail', 'environment-blocked', 'case-defect', 'not-measured']).optional(),
  execution_detail: z.string().optional(),
  execution_artifact: ExecutionArtifactSchema.optional(),
  delivery_match: z.boolean().optional(),
  sql_judge: z.strictObject({
    score: z.number(),
    rationale: z.string(),
    dimensions: z.record(z.string(), z.union([z.literal(0), z.literal(1)])),
  }).optional(),
  infra_error: z.string().optional(),
  error: z.string().optional(),
  generated_sql: z.string().nullable().optional(),
  expected_result: z.json().optional(),
})

const ReferenceSqlSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('resolved'),
    sql: z.string(),
    anchorDs: z.string().optional(),
    substitutions: z.record(z.string(), z.string()),
  }),
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({
    kind: z.literal('unresolvable'),
    reason: z.enum(['missing-anchor', 'unknown-placeholder', 'malformed-template', 'malformed-anchor']),
    detail: z.string(),
  }),
])

const ContentPreflightSchema = z.union([
  z.strictObject({ status: z.literal('passed') }),
  z.strictObject({ status: z.literal('case-defect'), detail: z.string().min(1) }),
])

const ResolvedReferenceFields = {
  sql: z.string().min(1),
  anchor_ds: z.string().regex(/^\d{8}$/).optional(),
  substitutions: z.record(z.string(), z.string()),
}

const ReferenceSqlPreflightSchema = z.union([
  z.strictObject({ status: z.literal('absent'), detail: z.string().min(1) }),
  z.strictObject({
    status: z.literal('resolved-not-executed'),
    stage: z.literal('resolution'),
    detail: z.string().min(1),
    ...ResolvedReferenceFields,
  }),
  z.strictObject({
    status: z.literal('passed'),
    stage: z.literal('comparison'),
    detail: z.string().min(1),
    execution_artifact: ExecutionArtifactSchema,
    ...ResolvedReferenceFields,
  }),
  z.strictObject({
    status: z.literal('case-defect'),
    stage: z.literal('resolution'),
    detail: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal('case-defect'),
    stage: z.enum(['execution', 'comparison']),
    detail: z.string().min(1),
    execution_artifact: ExecutionArtifactSchema.optional(),
    ...ResolvedReferenceFields,
  }),
  z.strictObject({
    status: z.literal('environment-blocked'),
    stage: z.enum(['execution', 'comparison']),
    detail: z.string().min(1),
    execution_artifact: ExecutionArtifactSchema.optional(),
    ...ResolvedReferenceFields,
  }),
])

const PreflightSchema = z.strictObject({
  content: ContentPreflightSchema,
  reference_sql: ReferenceSqlPreflightSchema.optional(),
}).superRefine((preflight, context) => {
  if (preflight.content.status === 'passed' && preflight.reference_sql === undefined) {
    context.addIssue({ code: 'custom', path: ['reference_sql'], message: 'required when content preflight passes' })
  }
  if (preflight.content.status === 'case-defect' && preflight.reference_sql !== undefined) {
    context.addIssue({ code: 'custom', path: ['reference_sql'], message: 'must be absent when content preflight fails' })
  }
})

const CaseProvenanceSchema = z.strictObject({
  sourcePath: z.string().min(1),
  schemaVersion: z.number().nullable(),
  scopeId: z.string().nullable(),
  expected: z.strictObject({
    result_value: z.record(z.string(), z.json()).nullable(),
    // Invalid grading content is preserved so the recorded case_defect remains auditable.
    match_mode: z.string().nullable(),
    sql: z.string().optional(),
    behavior: z.string().optional(),
  }),
  meta: z.json().nullable(),
  referenceSql: ReferenceSqlSchema,
})

const LegacyRecordSchema = z.strictObject({
  runId: z.string().min(1),
  timestamp: z.string().min(1),
  caseId: z.string().min(1),
  outcome: RunnerVerdictSchema,
  verdict: LegacyVerdictSchema,
  passed: z.boolean(),
  passK: z.number().int().positive(),
  latencyMs: z.number().nonnegative(),
  attemptsCount: z.number().int().nonnegative(),
  errorsCount: z.number().int().nonnegative(),
})

const Version2RecordSchema = z.strictObject({
  recordVersion: z.literal(2),
  runId: z.string().min(1),
  timestamp: z.string().min(1),
  caseId: z.string().min(1),
  outcome: RunnerVerdictSchema,
  verdict: RunnerVerdictSchema,
  passed: z.boolean(),
  passK: z.number().int().positive(),
  latencyMs: z.number().nonnegative(),
  attemptsCount: z.number().int().nonnegative(),
  errorsCount: z.number().int().nonnegative(),
  runConfig: RunConfigSchema,
  attempts: z.array(AttemptSchema),
  preflight: PreflightSchema,
  caseProvenance: CaseProvenanceSchema,
})

/** A validated version-2 or legacy unversioned persistence line. */
export interface PersistedCaseRecord {
  readonly recordVersion?: 2
  readonly runId: string
  readonly timestamp: string
  readonly caseId: string
  readonly outcome: z.infer<typeof RunnerVerdictSchema>
  readonly verdict: z.infer<typeof LegacyVerdictSchema>
  readonly passed: boolean
  readonly passK: number
  readonly latencyMs: number
  readonly attemptsCount: number
  readonly errorsCount: number
  readonly runConfig?: z.infer<typeof RunConfigSchema>
  readonly attempts?: readonly z.infer<typeof AttemptSchema>[]
  readonly preflight?: z.infer<typeof PreflightSchema>
  readonly caseProvenance?: z.infer<typeof CaseProvenanceSchema>
}

/**
 * Parse and validate one JSONL record.
 * @param line - one non-empty JSONL line.
 * @param source - file and line identifier included in failures.
 * @returns the validated durable record.
 */
export function parsePersistedCaseRecord(line: string, source: string): PersistedCaseRecord {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch (error) {
    throw new Error(`evidence-query: invalid record ${source}: malformed JSON`, { cause: error })
  }
  const version = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)['recordVersion']
    : undefined
  const result = version === undefined
    ? LegacyRecordSchema.safeParse(value)
    : Version2RecordSchema.safeParse(value)
  if (!result.success) {
    throw new Error(`evidence-query: invalid record ${source}: ${z.prettifyError(result.error)}`)
  }
  return result.data
}
