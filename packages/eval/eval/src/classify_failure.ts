/**
 * Environmental failure classification + the `QueryOutcome`→`ExecutionResult`
 * mapping (P11b decision 3). `classifyExecutionFailure` is a 1:1 mirror of
 * `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/l1.py:classify_execution_failure`
 * — pure message-pattern matching, no sqlglot, so da can mirror it verbatim.
 * The default is `infrastructure` (the classification granting the fewest
 * consequences: it does not trigger auto-fix and does not read as a defect in
 * the SQL under test). `syntax_error`/`guard_rejected` are statements about the
 * SQL (the agent's SQL is wrong → score); `infrastructure`/`timeout`/`patience`
 * mean the warehouse did not answer (→ refuse, not score; the turn is
 * resubmittable, the session is not advanced — rbi SPEC §5.2).
 *
 * `mapQueryOutcome` adapts the injected `ctx.query.execute` `QueryOutcome`
 * (3-state done/failed/pending) to the `ExecutionResult` the scorer reads:
 * completed→success+dict rows (zip `columns` onto each `rows` row); failed→
 * !success+error+`classifyExecutionFailure`; pending→`patience` refuse (the
 * warehouse did not answer — the host may `attach`+poll first to resolve
 * pending, but this mapping is robust to an unresolved pending).
 *
 * @module @deepseek-ai/dsh-eval/classify_failure
 */

import type { ExecutionResult, FailureClass, QueryOutcomeView } from './types.ts'

/**
 * Failure classes meaning the warehouse did not answer (rbi SPEC §5.2) — a
 * turn that hit one was not evaluated, so it is refused + resubmittable
 * rather than scored.
 */
export const ENVIRONMENTAL_FAILURE_CLASSES: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'infrastructure',
  'timeout',
  'patience',
])

/** rbi `PATIENCE_ABANDONED_MARKER`: the adapter stamps this when it abandons a query still running in the warehouse (T23). */
export const PATIENCE_ABANDONED_MARKER = '放弃等待仍在运行的查询'

/** rbi `_PATIENCE_MARKERS`: "we stopped waiting" (arrives without the word "timeout", so it must be matched explicitly). */
const PATIENCE_MARKERS: readonly string[] = ['耐心阈值', PATIENCE_ABANDONED_MARKER]

/**
 * Bucket an engine error message per rbi SPEC §5.2's table. Message-pattern
 * matching, inherently approximate; the default is `infrastructure` (the
 * classification that grants the fewest consequences). Order matters: patience
 * is checked before timeout (an abandon message may mention a duration and must
 * not read as "the warehouse timed out"); `table not found` inside a
 * semantic-analysis exception is a routing fault (`infrastructure`), not a
 * syntax defect. Mirrors rbi `classify_execution_failure` exactly.
 * @param error - the engine error string (or null/empty).
 * @returns the failure class.
 */
export function classifyExecutionFailure(error: string | null | undefined): FailureClass {
  if (error === null || error === undefined || error.length === 0) return 'infrastructure'
  const text = error.toLowerCase()
  if (someSubstring(text, ['guard', 'required predicate', '缺少分区', '必需谓词', 'select-only'])) return 'guard_rejected'
  if (someSubstring(text, PATIENCE_MARKERS)) return 'patience'
  if (someSubstring(text, ['odps-0010000', 'timeout', 'timed out', '超时'])) return 'timeout'
  if (someSubstring(text, ['semantic analysis exception', 'syntax error', 'parse', '语法'])) {
    if (someSubstring(text, ['odps-0130131', 'table not found', 'cannot be resolved'])) return 'infrastructure'
    return 'syntax_error'
  }
  return 'infrastructure'
}

function someSubstring(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) if (haystack.includes(n)) return true
  return false
}

/**
 * Map an injected `ctx.query.execute` `QueryOutcome` to the `ExecutionResult`
 * the scorer reads. Completed zips `columns` onto each `rows` row (match_mode
 * handlers read keyed columns; if `columns` is absent, positional `_<i>` keys
 * are used). Failed carries `classifyExecutionFailure(error)`. Pending is a
 * `patience` refusal (environmental — the turn is unjudged, the session is not
 * advanced) so an unresolved pending never gets mis-scored as an agent failure.
 * @param outcome - the `QueryOutcome` from the injected executor.
 * @returns the `ExecutionResult` for the scorer.
 */
export function mapQueryOutcome(outcome: QueryOutcomeView): ExecutionResult {
  if (outcome.state === 'completed') {
    const columns = outcome.columns
    const rawRows = outcome.rows ?? []
    const rows: Record<string, unknown>[] = rawRows.map(row => zipRow(columns, row))
    return {
      success: true,
      rows,
      rowCount: outcome.rowCount ?? rows.length,
      error: null,
      failureClass: null,
    }
  }
  if (outcome.state === 'pending') {
    return {
      success: false,
      rows: [],
      rowCount: 0,
      error: `query pending: instanceId=${outcome.instanceId ?? 'unknown'}`,
      failureClass: 'patience',
    }
  }
  // failed
  const error = outcome.error ?? 'query failed (no error detail)'
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error,
    failureClass: classifyExecutionFailure(error),
  }
}

/** Zip `columns` onto a `rows` row (an array); fall back to positional `_<i>` keys when columns are absent. */
function zipRow(columns: readonly string[] | undefined, row: unknown): Record<string, unknown> {
  if (!Array.isArray(row)) return {}
  const out: Record<string, unknown> = {}
  for (let i = 0; i < row.length; i++) {
    const col = columns?.[i]
    const key = col !== undefined ? col : `_${i}`
    out[key] = row[i]
  }
  return out
}
