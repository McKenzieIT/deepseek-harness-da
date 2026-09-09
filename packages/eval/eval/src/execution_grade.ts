/**
 * Execution grading: normalize one provider `QueryOutcome` into a persistable
 * artifact, then grade that artifact against a case's expectation. The two
 * steps are separate pure functions with the artifact between them, so a stored
 * artifact can be re-graded offline under a different comparator policy without
 * returning to the warehouse (R23 needs exactly that, across dozens of policy
 * variants, and needs both a raw and a normalized digest — which exist only
 * because normalization is its own persisted step).
 *
 * An attempt's execution outcome is a five-member closed union. `pass`/`fail`
 * are statements about the model. `environment-blocked` means the warehouse did
 * not answer, so nothing about the model was learned; it covers connectivity,
 * credentials, throttling, timeout, and a non-terminal `pending`. `case-defect`
 * means the corpus is broken — an unknown or misspelled `match_mode`, a missing
 * or self-inconsistent expectation. The last two stay apart because their
 * remedies differ (rerun versus fix the corpus) and their trends read in
 * opposite directions: `environment-blocked` falling means the environment got
 * better, `case-defect` falling can mean bad cases were hidden.
 * `not-measured` records that execution was never attempted, and is an explicit
 * member rather than a missing value because a missing one was previously
 * defaulted to "matched".
 *
 * Published precedent separates infrastructure from wrongness: the distilled
 * test-suite evaluator asserts rather than scoring zero when gold will not
 * execute, and GradeSQL discards execution-error candidates instead of labelling
 * them incorrect. `environment-blocked` itself has no published precedent —
 * those benchmarks execute against local SQLite and have no remote warehouse
 * with pending instances, credentials, or throttling. It is this repository's
 * own choice.
 *
 * Nothing here trusts a provider's self-description: elapsed time is measured by
 * the caller around the call (the maxc sidecar hardcodes `durationMs: 0`), and
 * `providerTruncated` is derived by comparing the provider's own `rowCount`
 * against the rows it actually returned rather than reading its `truncated`
 * flag (hardcoded `false`).
 *
 * @module @deepseek-ai/dsh-eval/execution_grade
 */

import { createHash } from 'node:crypto'
import { classifyExecutionFailure, ENVIRONMENTAL_FAILURE_CLASSES } from './classify_failure.ts'
import { checkResultMatch, MATCH_MODES } from './match_modes.ts'
import type { AssertionResult, FailureClass, QueryOutcomeView } from './types.ts'

/**
 * The closed set of execution outcomes for one attempt. Every consumer switches
 * on all five; there is no missing-value case to default.
 */
export const EXECUTION_OUTCOMES = ['pass', 'fail', 'environment-blocked', 'case-defect', 'not-measured'] as const

/** One attempt's execution outcome. */
export type ExecutionOutcome = typeof EXECUTION_OUTCOMES[number]

/**
 * Bumped whenever grading or normalization changes what a verdict means, so a
 * recorded verdict states how it was produced and two runs graded under
 * different rules are never averaged together.
 */
export const COMPARATOR_POLICY_VERSION = 1

/**
 * How a result row's cells are addressed when comparing against an expectation.
 * `by-name` uses the provider's column names, so an expectation naming a column
 * only matches a candidate that produced that name; `positional` uses `col<i>`,
 * so column names are ignored and order decides. The two disagree on any case
 * whose candidate SQL chose different aliases, which is why the choice is
 * recorded rather than assumed.
 */
export type ColumnSemantics = 'by-name' | 'positional'

/** The accepted {@link ColumnSemantics} values, checked at the config boundary where a host may supply anything. */
const COLUMN_SEMANTICS: readonly string[] = ['by-name', 'positional']

/** A comparator policy as requested by a host, before validation. */
export interface ComparatorPolicyRequest {
  /** Required: there is no safe default, and a silent one would make two runs incomparable. */
  readonly columnSemantics: ColumnSemantics
  /** Maximum rows an artifact stores; the digests still cover the full result. */
  readonly maxStoredRows: number
}

/** A validated comparator policy, carrying the version it was resolved under. */
export interface ComparatorPolicy extends ComparatorPolicyRequest {
  readonly version: number
}

/**
 * Validate a comparator policy request. Explicit rather than a hidden `??`
 * default inside grading, so a run records the policy it actually used.
 * @param request - the requested policy.
 * @returns the validated policy.
 */
export function resolveComparatorPolicy(request: ComparatorPolicyRequest): ComparatorPolicy {
  if (!COLUMN_SEMANTICS.includes(request.columnSemantics)) {
    throw new Error(`comparator policy: columnSemantics must be one of ${COLUMN_SEMANTICS.join(', ')} (got ${JSON.stringify(request.columnSemantics)})`)
  }
  if (!Number.isInteger(request.maxStoredRows) || request.maxStoredRows < 1) {
    throw new Error(`comparator policy: maxStoredRows must be a positive integer (got ${JSON.stringify(request.maxStoredRows)})`)
  }
  return { ...request, version: COMPARATOR_POLICY_VERSION }
}

/**
 * The persisted record of one SQL execution: everything a later re-grade needs
 * and nothing the provider merely claimed.
 */
export interface ExecutionArtifact {
  /** Mirrors the provider's three terminal states. */
  readonly kind: 'completed' | 'pending' | 'failed'
  /** The SQL actually executed, as the provider reported it back. */
  readonly sql: string | null
  /** Column names the provider returned, empty when it returned none. */
  readonly columns: readonly string[]
  /** Rows addressed per the policy's column semantics, capped at `maxStoredRows`. */
  readonly rows: readonly Record<string, unknown>[]
  /** The provider's own row count, which may exceed the rows it returned. */
  readonly rowCount: number
  /** How many rows this artifact stores. */
  readonly rowsStored: number
  /** Whether the provider reported more rows than it returned — a measured signal, not its `truncated` flag. */
  readonly providerTruncated: boolean
  /** Whether the row cap dropped rows from this artifact (the digests still cover them all). */
  readonly storageTruncated: boolean
  /** Instance id of a query left running, so a later attach can resolve it. */
  readonly instanceId: string | null
  /** The provider's typed failure kind, recorded verbatim. */
  readonly failureKind: string | null
  /** Failure class derived from the error text. */
  readonly failureClass: FailureClass | null
  /** The provider's error text. */
  readonly error: string | null
  /** Wall clock the caller measured around the call. */
  readonly durationMs: number
  /** Digest of the provider's result before normalization. */
  readonly rawDigest: string
  /** Digest of the normalized result, including the column semantics applied. */
  readonly normalizedDigest: string
  /** The column semantics this artifact's rows were built with. */
  readonly columnSemantics: ColumnSemantics
}

/** What the caller observed around one `execute` call. */
export interface NormalizeContext {
  /** The policy deciding column semantics and the row cap. */
  readonly policy: ComparatorPolicy
  /** Wall clock measured by the caller, in milliseconds. */
  readonly durationMs: number
}

/**
 * The single executor port evaluation is handed. It yields a capability, not a
 * verdict: `execute` returns the provider's raw `QueryOutcome` and evaluation
 * normalizes it, because letting each host map the outcome itself is what forked
 * the four adapters that previously did this.
 *
 * SQL submission, scope routing, credentials, and backend lifecycle stay with
 * the query capability. `attach` is optional so that treating a non-terminal
 * `pending` as `environment-blocked` remains a policy choice: a host that can
 * resolve a pending instance may offer it, and a future policy can wait for
 * completion instead of giving up, without reshaping this port.
 */
export interface ExecutionPort {
  /**
   * Execute one SQL statement.
   * @param sql - the SQL to run.
   * @param signal - abort signal for the caller's timeout.
   * @returns the provider's raw outcome.
   */
  execute(sql: string, signal?: AbortSignal): Promise<QueryOutcomeView>
  /**
   * Resolve a query left running.
   * @param instanceId - the instance id from a `pending` outcome.
   * @returns the provider's raw outcome.
   */
  attach?(instanceId: string): Promise<QueryOutcomeView>
}

/**
 * Execute one SQL statement through the port and normalize the result, timing
 * the call here because the provider reports `durationMs: 0`.
 * @param port - the injected executor port.
 * @param sql - the SQL to run.
 * @param policy - the policy deciding column semantics and the row cap.
 * @param signal - abort signal for the caller's timeout.
 * @returns the artifact to persist and grade.
 */
export async function executeAndNormalize(
  port: ExecutionPort,
  sql: string,
  policy: ComparatorPolicy,
  signal?: AbortSignal,
): Promise<ExecutionArtifact> {
  const startedAt = Date.now()
  const outcome = await port.execute(sql, signal)
  return normalizeOutcome(outcome, { policy, durationMs: Date.now() - startedAt })
}

/**
 * Normalize a provider `QueryOutcome` into a persistable artifact.
 * @param outcome - the provider's raw outcome.
 * @param ctx - the policy plus the caller's measured elapsed time.
 * @returns the artifact to persist and grade.
 */
export function normalizeOutcome(outcome: QueryOutcomeView, ctx: NormalizeContext): ExecutionArtifact {
  const { policy, durationMs } = ctx
  const sql = outcome.sql ?? null
  const rawDigest = digest({
    state: outcome.state,
    columns: outcome.columns ?? null,
    rows: outcome.rows ?? null,
    rowCount: outcome.rowCount ?? null,
    error: outcome.error ?? null,
  })
  const base = {
    sql,
    instanceId: outcome.instanceId ?? outcome.executionMeta?.instanceId ?? null,
    failureKind: outcome.failureKind ?? null,
    durationMs,
    rawDigest,
    columnSemantics: policy.columnSemantics,
  }

  if (outcome.state === 'completed') {
    const columns = outcome.columns ?? []
    const allRows = (outcome.rows ?? []).map(row => addressRow(columns, row, policy.columnSemantics))
    const rows = allRows.slice(0, policy.maxStoredRows)
    const rowCount = outcome.rowCount ?? allRows.length
    return {
      ...base,
      kind: 'completed',
      columns,
      rows,
      rowCount,
      rowsStored: rows.length,
      providerTruncated: rowCount > allRows.length,
      storageTruncated: rows.length < allRows.length,
      failureClass: null,
      error: null,
      normalizedDigest: digest({ semantics: policy.columnSemantics, rows: allRows }),
    }
  }

  const error = outcome.state === 'pending'
    ? `query pending: instanceId=${base.instanceId ?? 'unknown'}`
    : outcome.error ?? 'query failed (no error detail)'
  return {
    ...base,
    kind: outcome.state,
    columns: [],
    rows: [],
    rowCount: 0,
    rowsStored: 0,
    providerTruncated: false,
    storageTruncated: false,
    failureClass: outcome.state === 'pending' ? 'patience' : classifyExecutionFailure(error),
    error,
    normalizedDigest: digest({ semantics: policy.columnSemantics, state: outcome.state, error }),
  }
}

/** The expectation an artifact is graded against — the EXECUTION half of a case's `expected`. */
export interface ExecutionExpectation {
  readonly result_value: Record<string, unknown> | null
  readonly match_mode: string | null
}

/** One graded execution outcome, with the reason and the rules it was graded under. */
export interface ExecutionVerdict {
  readonly outcome: ExecutionOutcome
  /** Why, in the comparator's own words when a comparison ran. */
  readonly detail: string
  /** Set when the warehouse or the SQL failed. */
  readonly failureClass: FailureClass | null
  /** The policy version this verdict was produced under. */
  readonly policyVersion: number
  /** The column semantics this verdict was produced under. */
  readonly columnSemantics: ColumnSemantics
}

/**
 * Grade a stored artifact against a case's EXECUTION expectation. Pure, so the
 * same artifact and policy always give the same verdict, and a stored artifact
 * can be re-graded offline.
 * @param artifact - the normalized execution artifact.
 * @param expected - the case's EXECUTION expectation.
 * @param policy - the comparator policy to grade under.
 * @returns the verdict, carrying the rules that produced it.
 */
export function gradeExecution(artifact: ExecutionArtifact, expected: ExecutionExpectation, policy: ComparatorPolicy): ExecutionVerdict {
  const stamp = { policyVersion: policy.version, columnSemantics: policy.columnSemantics }

  const defect = expectationDefect(expected)
  if (defect !== null) return { outcome: 'case-defect', detail: defect, failureClass: null, ...stamp }

  if (artifact.kind !== 'completed') {
    const failureClass = artifact.failureClass
    // A warehouse that did not answer says nothing about the model; a candidate
    // whose own SQL is invalid or guard-rejected is a model failure.
    const blocked = failureClass === null || ENVIRONMENTAL_FAILURE_CLASSES.has(failureClass)
    return {
      outcome: blocked ? 'environment-blocked' : 'fail',
      detail: artifact.error ?? 'execution did not complete',
      failureClass,
      ...stamp,
    }
  }

  // `expectationDefect` already rejected a null `result_value` or `match_mode`,
  // so both are present here.
  const expectedValue = expected.result_value as Record<string, unknown>
  const result: AssertionResult = checkResultMatch(expectedValue, artifact.rows, expected.match_mode as string)
  return { outcome: result.status === 'pass' ? 'pass' : 'fail', detail: result.detail, failureClass: null, ...stamp }
}

/**
 * Whether an expectation is unusable, making the case rather than the model at
 * fault. A misspelled `match_mode` used to read as the model answering wrongly.
 * @param expected - the case's EXECUTION expectation.
 * @returns the defect description, or `null` when the expectation is usable.
 */
function expectationDefect(expected: ExecutionExpectation): string | null {
  const { result_value: value, match_mode: mode } = expected
  if (mode === null && value === null) return 'case declares no EXECUTION expectation (no result_value, no match_mode)'
  if (mode === null) return 'case declares result_value without match_mode'
  if (value === null) return `case declares match_mode ${mode} without result_value`
  if (!(MATCH_MODES as readonly string[]).includes(mode)) {
    return `unknown match_mode: ${mode} (supported: ${MATCH_MODES.join(', ')})`
  }
  return null
}

/**
 * Address one result row's cells per the column semantics. A row already keyed
 * by the provider is passed through under `by-name` and re-keyed positionally
 * under `positional`.
 * @param columns - the provider's column names.
 * @param row - one provider row, an array of cells or an already-keyed record.
 * @param semantics - how cells are addressed.
 * @returns the addressed row.
 */
function addressRow(columns: readonly string[], row: unknown, semantics: ColumnSemantics): Record<string, unknown> {
  const cells = Array.isArray(row) ? (row as unknown[]) : Object.values(row as Record<string, unknown>)
  if (semantics === 'positional') {
    return Object.fromEntries(cells.map((cell, i) => [`col${i}`, cell]))
  }
  if (!Array.isArray(row)) return row as Record<string, unknown>
  return Object.fromEntries(cells.map((cell, i) => [columns[i] ?? `col${i}`, cell]))
}

/** Digest a value stably: a short sha256 over its JSON, used to compare full results an artifact may not store. */
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
}
