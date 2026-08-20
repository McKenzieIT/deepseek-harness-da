import { describe, expect, it } from 'vitest'
import { parseNumber, routeDelivery, scoreDelivery } from '../src/delivery.ts'
import { AuthenticationAbort } from '../src/judge.ts'
import { makeCase } from './helpers.ts'
import { INSTANT_JUDGE, makeStubJudge } from './helpers.ts'

const exp = (expected: Record<string, unknown>) => makeCase({ case_id: 'x', input: { question: 'q' }, expected }).expected

describe('routeDelivery', () => {
  it('an explicit delivery_match wins over auto-routing', () => {
    expect(routeDelivery(exp({ answer: 42, delivery_match: 'fuzzy' }))).toBe('fuzzy')
  })
  it('a number → scalar_exact', () => {
    expect(routeDelivery(exp({ answer: 42 }))).toBe('scalar_exact')
  })
  it('an array → fuzzy', () => {
    expect(routeDelivery(exp({ answer: ['a', 'b'] }))).toBe('fuzzy')
  })
  it('a long string (>120) → llm_judge', () => {
    expect(routeDelivery(exp({ answer: 'x'.repeat(121) }))).toBe('llm_judge')
  })
  it('a short string → fuzzy', () => {
    expect(routeDelivery(exp({ answer: 'short' }))).toBe('fuzzy')
  })
  it('null answer (EXECUTION-only) → null (no DELIVERY)', () => {
    expect(routeDelivery(exp({ result_value: { value: 1 }, match_mode: 'scalar_exact' }))).toBeNull()
  })
  it('a non-string/number/array answer (e.g. boolean) → fuzzy (catch-all)', () => {
    expect(routeDelivery(exp({ answer: true }))).toBe('fuzzy')
  })
})

describe('scoreDelivery', () => {
  it('no DELIVERY (EXECUTION-only) → pass', async () => {
    const r = await scoreDelivery(exp({ result_value: { value: 1 }, match_mode: 'scalar_exact' }), 'reply', null, 'q')
    expect(r.status).toBe('pass')
    expect(r.mode).toBeNull()
  })

  it('scalar_exact: parses the number out of finalResponse → pass', async () => {
    const r = await scoreDelivery(exp({ answer: 98765, delivery_match: 'scalar_exact' }), '当前总用户数为 98765 人', null, 'q')
    expect(r.status).toBe('pass')
  })
  it('scalar_exact: a wrong number → fail', async () => {
    const r = await scoreDelivery(exp({ answer: 98765, delivery_match: 'scalar_exact' }), 'the answer is 99999', null, 'q')
    expect(r.status).toBe('fail')
  })

  it('fuzzy: a paraphrase containing the expected token → pass', async () => {
    const r = await scoreDelivery(exp({ answer: 'gameA', delivery_match: 'fuzzy' }), 'the game is gamea', null, 'q')
    expect(r.status).toBe('pass')
  })
  it('fuzzy: gameX ≠ gameA (short token-containment hardening) → fail', async () => {
    const r = await scoreDelivery(exp({ answer: 'gameA', delivery_match: 'fuzzy' }), 'gameX', null, 'q')
    expect(r.status).toBe('fail')
  })

  it('llm_judge: score ≥ 0.6 → pass', async () => {
    const { provider } = makeStubJudge([{ score: 0.85, rationale: 'accurate' }])
    const r = await scoreDelivery(exp({ answer: 'x'.repeat(121), delivery_match: 'llm_judge' }), 'a long answer', provider, 'q', { judge: INSTANT_JUDGE })
    expect(r.status).toBe('pass')
    expect(r.judge?.score).toBe(0.85)
  })
  it('llm_judge: score < 0.6 → fail', async () => {
    const { provider } = makeStubJudge([{ score: 0.3, rationale: 'off' }])
    const r = await scoreDelivery(exp({ answer: 'x'.repeat(121), delivery_match: 'llm_judge' }), 'a long answer', provider, 'q', { judge: INSTANT_JUDGE })
    expect(r.status).toBe('fail')
  })
  it('llm_judge with no provider injected → fail', async () => {
    const r = await scoreDelivery(exp({ answer: 'x'.repeat(121), delivery_match: 'llm_judge' }), 'a long answer', null, 'q')
    expect(r.status).toBe('fail')
  })
  it('llm_judge: retryable twice then success → pass (backoff)', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'retryable' }, { throw: 'retryable' }, { score: 0.9 }])
    const r = await scoreDelivery(exp({ answer: 'x'.repeat(121), delivery_match: 'llm_judge' }), 'a long answer', provider, 'q', { judge: INSTANT_JUDGE })
    expect(r.status).toBe('pass')
    expect(calls.length).toBe(3)
  })
  it('llm_judge: auth → AuthenticationAbort (the whole run is over)', async () => {
    const { provider } = makeStubJudge([{ throw: 'auth' }])
    await expect(
      scoreDelivery(exp({ answer: 'x'.repeat(121), delivery_match: 'llm_judge' }), 'a long answer', provider, 'q', { judge: INSTANT_JUDGE }),
    ).rejects.toBeInstanceOf(AuthenticationAbort)
  })
  it('fuzzy: an array answer is joined then matched', async () => {
    const r = await scoreDelivery(exp({ answer: ['gameA'], delivery_match: 'fuzzy' }), 'the game is gamea', null, 'q')
    expect(r.status).toBe('pass')
  })
})

describe('parseNumber', () => {
  it('finds the first number', () => {
    expect(parseNumber('count 42 ok')).toBe(42)
  })
  it('parses a negative decimal', () => {
    expect(parseNumber('-3.14')).toBe(-3.14)
  })
  it('NaN when no number is present', () => {
    expect(Number.isNaN(parseNumber('no digits here'))).toBe(true)
  })
})
