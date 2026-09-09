import { describe, expect, it } from 'vitest'
import {
  normalizeOutcome,
  gradeExecution,
  resolveComparatorPolicy,
  EXECUTION_OUTCOMES,
  COMPARATOR_POLICY_VERSION,
  type ComparatorPolicyRequest,
  type ExecutionArtifact,
} from '../src/execution_grade.ts'

const policy = resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 100 })

/** A completed provider outcome with array rows plus a column list. */
function completed(rows: unknown[][], columns?: string[], rowCount?: number) {
  return {
    state: 'completed' as const,
    sql: 'SELECT 1',
    ...(columns === undefined ? {} : { columns }),
    rows,
    ...(rowCount === undefined ? {} : { rowCount }),
  }
}

describe('normalizeOutcome', () => {
  it('keys completed rows by column name under by-name semantics', () => {
    const a = normalizeOutcome(completed([[7, 'x']], ['dau', 'label']), { policy, durationMs: 12 })
    expect(a.kind).toBe('completed')
    expect(a.rows).toEqual([{ dau: 7, label: 'x' }])
  })

  it('keys completed rows positionally under positional semantics', () => {
    const positional = resolveComparatorPolicy({ columnSemantics: 'positional', maxStoredRows: 100 })
    const a = normalizeOutcome(completed([[7, 'x']], ['dau', 'label']), { policy: positional, durationMs: 0 })
    expect(a.rows).toEqual([{ col0: 7, col1: 'x' }])
  })

  it('records the wall clock the adapter measured, not the provider claim', () => {
    const a = normalizeOutcome({ ...completed([[1]]), executionMeta: { durationMs: 0 } }, { policy, durationMs: 68_000 })
    expect(a.durationMs).toBe(68_000)
  })

  it('reports a provider rowCount that diverges from the rows it returned', () => {
    const a = normalizeOutcome(completed([[1], [2]], ['n'], 5000), { policy, durationMs: 0 })
    expect(a.rowCount).toBe(5000)
    expect(a.rowsStored).toBe(2)
    expect(a.providerTruncated).toBe(true)
  })

  it('does not claim provider truncation when rowCount matches the rows returned', () => {
    const a = normalizeOutcome(completed([[1], [2]], ['n'], 2), { policy, durationMs: 0 })
    expect(a.providerTruncated).toBe(false)
  })

  it('caps stored rows at the configured limit and says so', () => {
    const capped = resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 2 })
    const a = normalizeOutcome(completed([[1], [2], [3], [4]], ['n']), { policy: capped, durationMs: 0 })
    expect(a.rows).toHaveLength(2)
    expect(a.rowsStored).toBe(2)
    expect(a.storageTruncated).toBe(true)
    expect(a.rowCount).toBe(4)
  })

  it('digests the full result even when storage is capped, so a capped artifact stays comparable', () => {
    const capped = resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 1 })
    const wide = normalizeOutcome(completed([[1], [2], [3]], ['n']), { policy: capped, durationMs: 0 })
    const narrow = normalizeOutcome(completed([[1], [2]], ['n']), { policy: capped, durationMs: 0 })
    expect(wide.rows).toEqual(narrow.rows)
    expect(wide.rawDigest).not.toBe(narrow.rawDigest)
  })

  it('gives raw and normalized digests that differ when only column semantics change', () => {
    const positional = resolveComparatorPolicy({ columnSemantics: 'positional', maxStoredRows: 100 })
    const byName = normalizeOutcome(completed([[7]], ['dau']), { policy, durationMs: 0 })
    const byPos = normalizeOutcome(completed([[7]], ['dau']), { policy: positional, durationMs: 0 })
    expect(byName.rawDigest).toBe(byPos.rawDigest)
    expect(byName.normalizedDigest).not.toBe(byPos.normalizedDigest)
  })

  it('is stable: the same outcome digests identically twice', () => {
    const one = normalizeOutcome(completed([[7]], ['dau']), { policy, durationMs: 1 })
    const two = normalizeOutcome(completed([[7]], ['dau']), { policy, durationMs: 999 })
    expect(one.normalizedDigest).toBe(two.normalizedDigest)
  })

  it('carries a pending instance id so a later attach can resolve it', () => {
    const a = normalizeOutcome({ state: 'pending', sql: 'SELECT 1', instanceId: 'inst-9' }, { policy, durationMs: 5 })
    expect(a.kind).toBe('pending')
    expect(a.instanceId).toBe('inst-9')
    expect(a.rows).toEqual([])
  })

  it('classifies a failed outcome and keeps the provider failureKind', () => {
    const a = normalizeOutcome({ state: 'failed', sql: 'SELECT x', error: 'Semantic analysis exception: syntax error near x', failureKind: 'invalid_sql' }, { policy, durationMs: 3 })
    expect(a.kind).toBe('failed')
    expect(a.failureClass).toBe('syntax_error')
    expect(a.failureKind).toBe('invalid_sql')
  })

  it('records the SQL actually executed', () => {
    const a = normalizeOutcome({ ...completed([[1]]), sql: 'SELECT COUNT(*) FROM t' }, { policy, durationMs: 0 })
    expect(a.sql).toBe('SELECT COUNT(*) FROM t')
  })
})

describe('gradeExecution', () => {
  const scalarExpected = { result_value: { value: 7 }, match_mode: 'scalar_exact' as const }

  /** Normalize a completed single-scalar result. */
  function artifactOf(rows: unknown[][], columns = ['n']): ExecutionArtifact {
    return normalizeOutcome(completed(rows, columns), { policy, durationMs: 0 })
  }

  it('passes when the result matches', () => {
    const v = gradeExecution(artifactOf([[7]]), scalarExpected, policy)
    expect(v.outcome).toBe('pass')
  })

  it('fails when the model answered a different number', () => {
    const v = gradeExecution(artifactOf([[8]]), scalarExpected, policy)
    expect(v.outcome).toBe('fail')
    expect(v.detail).toContain('expected 7')
  })

  it('keeps the comparator detail instead of collapsing it to a boolean', () => {
    const v = gradeExecution(artifactOf([[8]]), scalarExpected, policy)
    expect(v.detail).toBe('expected 7, got 8')
  })

  it('calls a non-terminal pending environment-blocked, not a model failure', () => {
    const pending = normalizeOutcome({ state: 'pending', sql: 'SELECT 1', instanceId: 'i' }, { policy, durationMs: 0 })
    const v = gradeExecution(pending, scalarExpected, policy)
    expect(v.outcome).toBe('environment-blocked')
  })

  it('calls an infrastructure failure environment-blocked', () => {
    const failed = normalizeOutcome({ state: 'failed', sql: 'SELECT 1', error: 'connection reset by peer' }, { policy, durationMs: 0 })
    expect(gradeExecution(failed, scalarExpected, policy).outcome).toBe('environment-blocked')
  })

  it('calls a timeout environment-blocked', () => {
    const failed = normalizeOutcome({ state: 'failed', sql: 'SELECT 1', error: 'ODPS-0010000 query timed out' }, { policy, durationMs: 0 })
    expect(gradeExecution(failed, scalarExpected, policy).outcome).toBe('environment-blocked')
  })

  it('calls the candidate SQL being invalid a model failure, not an environment block', () => {
    const failed = normalizeOutcome({ state: 'failed', sql: 'SELEC 1', error: 'syntax error at SELEC' }, { policy, durationMs: 0 })
    const v = gradeExecution(failed, scalarExpected, policy)
    expect(v.outcome).toBe('fail')
    expect(v.failureClass).toBe('syntax_error')
  })

  it('calls a guard rejection a model failure', () => {
    const failed = normalizeOutcome({ state: 'failed', sql: 'SELECT *', error: 'guard: required predicate ds missing' }, { policy, durationMs: 0 })
    expect(gradeExecution(failed, scalarExpected, policy).outcome).toBe('fail')
  })

  it('calls an unknown match_mode a case defect, not a model failure', () => {
    const v = gradeExecution(artifactOf([[7]]), { result_value: { value: 7 }, match_mode: 'scalar_exactt' }, policy)
    expect(v.outcome).toBe('case-defect')
    expect(v.detail).toContain('scalar_exactt')
  })

  it('calls a missing expected value a case defect', () => {
    const v = gradeExecution(artifactOf([[7]]), { result_value: null, match_mode: 'scalar_exact' }, policy)
    expect(v.outcome).toBe('case-defect')
  })

  it('calls a declared mode with no expected value a case defect', () => {
    const v = gradeExecution(artifactOf([[7]]), { result_value: { value: 1 }, match_mode: null }, policy)
    expect(v.outcome).toBe('case-defect')
  })

  it('stamps the policy version so a verdict says how it was graded', () => {
    const v = gradeExecution(artifactOf([[7]]), scalarExpected, policy)
    expect(v.policyVersion).toBe(COMPARATOR_POLICY_VERSION)
    expect(v.columnSemantics).toBe('by-name')
  })

  it('re-grades a stored artifact to the same verdict, so offline re-grading is stable', () => {
    const stored: ExecutionArtifact = JSON.parse(JSON.stringify(artifactOf([[7]]))) as ExecutionArtifact
    expect(gradeExecution(stored, scalarExpected, policy).outcome).toBe('pass')
  })

  it('re-grades a stored artifact under a different policy without touching the warehouse', () => {
    const stored = artifactOf([[7]], ['dau'])
    const byPos = resolveComparatorPolicy({ columnSemantics: 'positional', maxStoredRows: 100 })
    const v = gradeExecution(stored, { result_value: { dau: 7 }, match_mode: 'multi_scalar_exact' }, byPos)
    expect(v.policyVersion).toBe(COMPARATOR_POLICY_VERSION)
    expect(v.columnSemantics).toBe('positional')
  })

  it('enumerates the five closed outcomes', () => {
    expect([...EXECUTION_OUTCOMES]).toEqual(['pass', 'fail', 'environment-blocked', 'case-defect', 'not-measured'])
  })
})

describe('resolveComparatorPolicy', () => {
  it('rejects an unknown column semantics rather than defaulting silently', () => {
    const fromConfig = { columnSemantics: 'whichever', maxStoredRows: 10 } as unknown as ComparatorPolicyRequest
    expect(() => resolveComparatorPolicy(fromConfig)).toThrow(/columnSemantics/)
  })

  it('rejects a missing column semantics rather than defaulting silently', () => {
    const fromConfig = { maxStoredRows: 10 } as unknown as ComparatorPolicyRequest
    expect(() => resolveComparatorPolicy(fromConfig)).toThrow(/columnSemantics/)
  })

  it('rejects a non-positive row cap', () => {
    expect(() => resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 0 })).toThrow(/maxStoredRows/)
  })

  it('rejects a fractional row cap', () => {
    expect(() => resolveComparatorPolicy({ columnSemantics: 'by-name', maxStoredRows: 1.5 })).toThrow(/maxStoredRows/)
  })
})
