import { describe, expect, it } from 'vitest'
import { aggregateVerdict, scoreDa } from '../src/scoring.ts'
import { makeCase } from './helpers.ts'
import type { ExecutionResult } from '../src/types.ts'

const ok = (rows: Record<string, unknown>[]): ExecutionResult => ({
  success: true,
  rows,
  rowCount: rows.length,
  error: null,
  failureClass: null,
})
const failed = (error: string, failureClass: ExecutionResult['failureClass']): ExecutionResult => ({ success: false, rows: [], rowCount: 0, error, failureClass })

const caseExec = () => makeCase({ case_id: 'x', input: { question: 'q' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact' } })

describe('scoreDa · EXECUTION-only', () => {
  it('pass when sql_executable + result_non_empty + result_match all pass', async () => {
    const r = await scoreDa(caseExec(), { generatedSql: 'sql', executionResult: ok([{ game: 'gameA' }]), finalResponse: 'reply', provider: null, deliveryOpts: undefined })
    expect(r.verdict).toBe('pass')
    expect(r.assertions.sql_executable!.status).toBe('pass')
    expect(r.assertions.result_non_empty!.status).toBe('pass')
    expect(r.assertions.result_match!.status).toBe('pass')
  })
  it('fail + sql_executable carries failureClass when the query failed (syntax_error = agent SQL wrong)', async () => {
    const r = await scoreDa(caseExec(), { generatedSql: 'sql', executionResult: failed('syntax error', 'syntax_error'), finalResponse: 'reply', provider: null, deliveryOpts: undefined })
    expect(r.verdict).toBe('fail')
    expect(r.assertions.sql_executable!.status).toBe('fail')
    expect(r.assertions.sql_executable!.failureClass).toBe('syntax_error')
  })
  it('result_non_empty fails on an empty result set', async () => {
    const r = await scoreDa(caseExec(), { generatedSql: 'sql', executionResult: ok([]), finalResponse: 'reply', provider: null, deliveryOpts: undefined })
    expect(r.assertions.result_non_empty!.status).toBe('fail')
    expect(r.verdict).toBe('fail')
  })
  it('uses the NO_EXECUTION sentinel when executionResult is null (DELIVERY-only path)', async () => {
    const r = await scoreDa(makeCase({ case_id: 'd', input: { question: 'q' }, expected: { answer: 'gameA', delivery_match: 'fuzzy' } }), { generatedSql: null, executionResult: null, finalResponse: 'the game is gamea', provider: null, deliveryOpts: undefined })
    expect(r.executionResult.success).toBe(false)
    expect(r.executionResult.error).toBeNull()
  })
})

describe('scoreDa · DELIVERY-only', () => {
  it('pass on a scalar_exact DELIVERY', async () => {
    const c = makeCase({ case_id: 'd', input: { question: 'q' }, expected: { answer: 98765, delivery_match: 'scalar_exact' } })
    const r = await scoreDa(c, { generatedSql: null, executionResult: null, finalResponse: 'count is 98765', provider: null, deliveryOpts: undefined })
    expect(r.verdict).toBe('pass')
    expect(r.assertions.delivery!.status).toBe('pass')
  })
})

describe('scoreDa · EXECUTION + DELIVERY', () => {
  it('pass when both layers pass', async () => {
    const c = makeCase({ case_id: 'b', input: { question: 'q' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const r = await scoreDa(c, { generatedSql: 'sql', executionResult: ok([{ game: 'gameA' }]), finalResponse: 'the game is gamea', provider: null, deliveryOpts: undefined })
    expect(r.verdict).toBe('pass')
    expect(Object.keys(r.assertions).sort()).toEqual(['delivery', 'result_match', 'result_non_empty', 'sql_executable'])
  })
  it('fail when DELIVERY is wrong but EXECUTION is right ("取数对但交付错" separate failure mode)', async () => {
    const c = makeCase({ case_id: 'b', input: { question: 'q' }, expected: { result_value: { value: 'gameA' }, match_mode: 'scalar_exact', answer: 'gameA', delivery_match: 'fuzzy' } })
    const r = await scoreDa(c, { generatedSql: 'sql', executionResult: ok([{ game: 'gameA' }]), finalResponse: '数据不足无法判断', provider: null, deliveryOpts: undefined })
    expect(r.assertions.result_match!.status).toBe('pass')
    expect(r.assertions.delivery!.status).toBe('fail')
    expect(r.verdict).toBe('fail')
  })
})

describe('aggregateVerdict', () => {
  it('pass when every declared assertion passes', () => {
    expect(aggregateVerdict({ a: { status: 'pass', detail: '' } })).toBe('pass')
  })
  it('fail when any assertion fails', () => {
    expect(aggregateVerdict({ a: { status: 'pass', detail: '' }, b: { status: 'fail', detail: '' } })).toBe('fail')
  })
  it('fail when no assertions are declared', () => {
    expect(aggregateVerdict({})).toBe('fail')
  })
})
