import { describe, expect, it } from 'vitest'
import {
  classifyExecutionFailure,
  ENVIRONMENTAL_FAILURE_CLASSES,
  mapQueryOutcome,
  PATIENCE_ABANDONED_MARKER,
} from '../src/classify_failure.ts'
import type { QueryOutcomeView } from '../src/types.ts'

const oc = (o: Partial<QueryOutcomeView> & { state: QueryOutcomeView['state'] }): QueryOutcomeView => o

describe('classifyExecutionFailure (rbi l1.classify_execution_failure mirror)', () => {
  it('null/undefined/empty → infrastructure (the fewest-consequences default)', () => {
    expect(classifyExecutionFailure(null)).toBe('infrastructure')
    expect(classifyExecutionFailure(undefined)).toBe('infrastructure')
    expect(classifyExecutionFailure('')).toBe('infrastructure')
  })
  it('guard_rejected (guard / required predicate / 缺少分区 / 必需谓词 / select-only)', () => {
    expect(classifyExecutionFailure('guard rejected the query')).toBe('guard_rejected')
    expect(classifyExecutionFailure('a required predicate is missing')).toBe('guard_rejected')
    expect(classifyExecutionFailure('缺少分区列')).toBe('guard_rejected')
    expect(classifyExecutionFailure('必需谓词')).toBe('guard_rejected')
    expect(classifyExecutionFailure('select-only mode')).toBe('guard_rejected')
  })
  it('patience (耐心阈值 / 放弃等待 marker — checked before timeout)', () => {
    expect(classifyExecutionFailure('达到耐心阈值放弃')).toBe('patience')
    expect(classifyExecutionFailure(PATIENCE_ABANDONED_MARKER)).toBe('patience')
  })
  it('timeout (odps-0010000 / timeout / timed out / 超时)', () => {
    expect(classifyExecutionFailure('ODPS-0010000: system error')).toBe('timeout')
    expect(classifyExecutionFailure('request timeout')).toBe('timeout')
    expect(classifyExecutionFailure('timed out waiting')).toBe('timeout')
    expect(classifyExecutionFailure('查询超时')).toBe('timeout')
  })
  it('syntax_error (semantic analysis exception / syntax error / parse / 语法)', () => {
    expect(classifyExecutionFailure('semantic analysis exception: bad col')).toBe('syntax_error')
    expect(classifyExecutionFailure('syntax error near foo')).toBe('syntax_error')
    expect(classifyExecutionFailure('parse failed')).toBe('syntax_error')
    expect(classifyExecutionFailure('语法错误')).toBe('syntax_error')
  })
  it('table-not-found inside a semantic-analysis exception is infrastructure (routing fault, not a syntax defect)', () => {
    expect(classifyExecutionFailure('semantic analysis exception: ODPS-0130131 table not found')).toBe('infrastructure')
    expect(classifyExecutionFailure('semantic analysis exception: cannot be resolved')).toBe('infrastructure')
  })
  it('an unrecognized error defaults to infrastructure', () => {
    expect(classifyExecutionFailure('some unrecognized weirdness')).toBe('infrastructure')
  })
})

describe('ENVIRONMENTAL_FAILURE_CLASSES', () => {
  it('contains exactly the three "warehouse did not answer" classes', () => {
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has('infrastructure')).toBe(true)
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has('timeout')).toBe(true)
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has('patience')).toBe(true)
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has('syntax_error')).toBe(false)
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has('guard_rejected')).toBe(false)
  })
})

describe('mapQueryOutcome (QueryOutcome → ExecutionResult; decision 3)', () => {
  it('completed zips columns onto each rows row', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', columns: ['a', 'b'], rows: [['x', 'y']] }))
    expect(r.success).toBe(true)
    expect(r.rows).toEqual([{ a: 'x', b: 'y' }])
    expect(r.rowCount).toBe(1)
    expect(r.failureClass).toBeNull()
  })
  it('completed without columns uses positional _<i> keys', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', rows: [['x', 'y']] }))
    expect(r.rows).toEqual([{ _0: 'x', _1: 'y' }])
  })
  it('completed with rows undefined yields an empty row set', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', columns: ['a'], rowCount: 0 }))
    expect(r.rows).toEqual([])
    expect(r.rowCount).toBe(0)
  })
  it('completed falls back to rows.length when rowCount is absent', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', columns: ['a'], rows: [['x'], ['y']] }))
    expect(r.rowCount).toBe(2)
  })
  it('failed carries classifyExecutionFailure(error)', () => {
    const r = mapQueryOutcome(oc({ state: 'failed', error: 'ODPS: syntax error near foo' }))
    expect(r.success).toBe(false)
    expect(r.failureClass).toBe('syntax_error')
    expect(r.error).toBe('ODPS: syntax error near foo')
  })
  it('failed without an error string uses a default message (→ infrastructure)', () => {
    const r = mapQueryOutcome(oc({ state: 'failed' }))
    expect(r.success).toBe(false)
    expect(r.failureClass).toBe('infrastructure')
  })
  it('pending → patience refuse (environmental; the turn is unjudged)', () => {
    const r = mapQueryOutcome(oc({ state: 'pending', instanceId: 'inst123' }))
    expect(r.success).toBe(false)
    expect(r.failureClass).toBe('patience')
    expect(r.error).toContain('inst123')
  })
  it('completed honors an explicit rowCount', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', columns: ['a'], rows: [['x']], rowCount: 99 }))
    expect(r.rowCount).toBe(99)
  })
  it('completed with a non-array row yields an empty dict (defensive)', () => {
    const r = mapQueryOutcome(oc({ state: 'completed', columns: ['a'], rows: ['not-an-array' as unknown as unknown[]] }))
    expect(r.rows).toEqual([{}])
  })
  it('pending without an instanceId → error mentions unknown (the ?? "unknown" branch)', () => {
    const r = mapQueryOutcome(oc({ state: 'pending' }))
    expect(r.error).toContain('unknown')
  })
})
