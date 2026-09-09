import { describe, expect, it } from 'vitest'
import { EvalCaseSchema, isMultiTurn } from '../src/eval_case.ts'

const base = { case_id: 'x', input: { question: 'q' }, expected: { answer: 42 } }

describe('EvalCaseSchema (da-fresh zod; file-boundary validation)', () => {
  it('parses a valid DELIVERY-only case + fills defaults', () => {
    const c = EvalCaseSchema.parse(base)
    expect(c.case_id).toBe('x')
    expect(c.input.scope_id).toBeNull()
    expect(c.input.turns).toEqual([])
    expect(c.expected.result_value).toBeNull()
    expect(c.expected.match_mode).toBeNull()
    expect(c.expected.answer).toBe(42)
    expect(c.expected.delivery_match).toBeNull()
    expect(c.dimensions).toEqual({})
  })

  it('parses a full EXECUTION+DELIVERY multi-turn case', () => {
    const c = EvalCaseSchema.parse({
      case_id: 'full',
      input: { question: 'q?', scope_id: 's', turns: [{ role: 'user', content: 'u' }] },
      expected: { result_value: { value: 1 }, match_mode: 'scalar_exact', answer: 'a', delivery_match: 'fuzzy' },
      dimensions: { domain: 'rev' },
    })
    expect(c.input.scope_id).toBe('s')
    expect(c.input.turns[0]!.role).toBe('user')
    expect(c.dimensions.domain).toBe('rev')
  })

  it('rejects a missing case_id', () => {
    expect(() => EvalCaseSchema.parse({ input: { question: 'q' }, expected: { answer: 1 } })).toThrow()
  })

  it('rejects a missing question', () => {
    expect(() => EvalCaseSchema.parse({ case_id: 'x', input: {}, expected: { answer: 1 } })).toThrow()
  })

  it('rejects a bad turn role', () => {
    expect(() => EvalCaseSchema.parse({ ...base, input: { question: 'q', turns: [{ role: 'system', content: 'c' }] } })).toThrow()
  })

  it('rejects a non-string turn content', () => {
    expect(() => EvalCaseSchema.parse({ ...base, input: { question: 'q', turns: [{ role: 'user', content: 5 }] } })).toThrow()
  })

  it('rejects a non-empty script with no user turn', () => {
    expect(() => EvalCaseSchema.parse({ ...base, input: { question: 'q', turns: [{ role: 'assistant', content: 'c' }] } })).toThrow()
  })

  it('rejects result_value without match_mode (both-or-neither)', () => {
    expect(() => EvalCaseSchema.parse({ case_id: 'x', input: { question: 'q' }, expected: { result_value: { value: 1 } } })).toThrow()
  })

  it('rejects match_mode without result_value (both-or-neither)', () => {
    expect(() => EvalCaseSchema.parse({ case_id: 'x', input: { question: 'q' }, expected: { match_mode: 'scalar_exact' } })).toThrow()
  })

  it('rejects an unknown match_mode', () => {
    expect(() => EvalCaseSchema.parse({ case_id: 'x', input: { question: 'q' }, expected: { result_value: { value: 1 }, match_mode: 'no_such' } })).toThrow()
  })

  it('rejects an unknown delivery_match', () => {
    expect(() => EvalCaseSchema.parse({ ...base, expected: { answer: 1, delivery_match: 'no_such' } })).toThrow()
  })

  it('rejects a case declaring neither EXECUTION nor DELIVERY', () => {
    expect(() => EvalCaseSchema.parse({ case_id: 'x', input: { question: 'q' }, expected: {} })).toThrow()
  })

  it('rejects an unknown top-level key instead of dropping it', () => {
    expect(() => EvalCaseSchema.parse({ ...base, sql: 'SELECT 1' })).toThrow(/unrecognized key/i)
  })

  it('rejects an unknown expected key instead of dropping it', () => {
    expect(() => EvalCaseSchema.parse({ ...base, expected: { answer: 1, sqll: 'SELECT 1' } })).toThrow(/unrecognized key/i)
  })

  it('rejects an unknown input key instead of dropping it', () => {
    expect(() => EvalCaseSchema.parse({ ...base, input: { question: 'q', qeustion: 'typo' } })).toThrow(/unrecognized key/i)
  })
})

describe('EvalCaseSchema provenance (rbi schema_version 3)', () => {
  const rbi = {
    schema_version: 3,
    case_id: 'r',
    input: { question: 'q' },
    expected: { sql: 'SELECT 1', result_value: { value: 1 }, match_mode: 'scalar_exact', behavior: 'direct_answer' },
    meta: { anchor_ds: '20260806', tier: 'verified', provenance: 'migrated' },
  }

  it('parses an rbi case with reference SQL and snapshot anchor', () => {
    const c = EvalCaseSchema.parse(rbi)
    expect(c.schema_version).toBe(3)
    expect(c.expected.sql).toBe('SELECT 1')
    expect(c.expected.behavior).toBe('direct_answer')
    expect(c.meta?.anchor_ds).toBe('20260806')
    expect(c.meta?.tier).toBe('verified')
    expect(c.meta?.provenance).toBe('migrated')
  })

  it('leaves provenance absent for a k11 case that declares none', () => {
    const c = EvalCaseSchema.parse(base)
    expect(c.schema_version).toBeUndefined()
    expect(c.meta).toBeUndefined()
    expect(c.expected.sql).toBeUndefined()
  })

  it('keeps meta keys the schema does not declare', () => {
    const c = EvalCaseSchema.parse({ ...rbi, meta: { ...rbi.meta, needs_repin: true } })
    expect(c.meta?.needs_repin).toBe(true)
  })

  it('rejects a non-string anchor_ds', () => {
    expect(() => EvalCaseSchema.parse({ ...rbi, meta: { anchor_ds: 20260806 } })).toThrow()
  })

  it('rejects a non-string reference sql', () => {
    expect(() => EvalCaseSchema.parse({ ...rbi, expected: { ...rbi.expected, sql: 42 } })).toThrow()
  })
})

describe('isMultiTurn', () => {
  it('true for a scripted case', () => {
    expect(isMultiTurn(EvalCaseSchema.parse({ ...base, input: { question: 'q', turns: [{ role: 'user', content: 'u' }] } }))).toBe(true)
  })
  it('false for a single-turn case', () => {
    expect(isMultiTurn(EvalCaseSchema.parse(base))).toBe(false)
  })
})
