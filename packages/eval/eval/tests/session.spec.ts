import { describe, expect, it } from 'vitest'
import { MultiTurnSession } from '../src/session.ts'
import { makeCase } from './helpers.ts'
import type { EvalCase } from '../src/eval_case.ts'

const multiTurn = (): EvalCase => makeCase({
  case_id: 'm',
  input: { question: 'final?', turns: [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }] },
  expected: { answer: 'a1', delivery_match: 'fuzzy' },
})

const singleTurn = (): EvalCase => makeCase({ case_id: 's', input: { question: 'final?' }, expected: { answer: 'ok', delivery_match: 'fuzzy' } })

const opts = { generatedSql: null, executionResult: null, provider: null, deliveryOpts: undefined }

describe('MultiTurnSession · construction', () => {
  it('accepts a single-turn case (empty script)', () => {
    const s = new MultiTurnSession(singleTurn(), 'sid', 'rid')
    expect(s.state).toBe('pending')
  })
  it('accepts a multi-turn case with a user turn (getters)', () => {
    const s = new MultiTurnSession(multiTurn(), 'sid', 'rid')
    expect(s.state).toBe('pending')
    expect(s.sessionId).toBe('sid')
    expect(s.runId).toBe('rid')
    expect(s.caseId).toBe('m')
  })
  it('rejects a non-empty script with no user turn (constructor guard; bypasses zod, which also rejects this)', () => {
    const bad = { case_id: 'b', input: { question: 'q', turns: [{ role: 'assistant', content: 'a' }] }, expected: { answer: 'a', delivery_match: 'fuzzy' } } as unknown as EvalCase
    expect(() => new MultiTurnSession(bad, 'sid', 'rid')).toThrow(/≥1 user turn/)
  })
})

describe('MultiTurnSession · nextInput', () => {
  it('serves scripted user turns then the terminal question', () => {
    const s = new MultiTurnSession(multiTurn(), 'sid', 'rid')
    expect(s.nextInput()).toBe('u1') // pending → running
    expect(s.state).toBe('running')
    expect(s.nextInput()).toBe('final?') // terminal
  })
  it('throws when called after the session has ended', () => {
    const s = new MultiTurnSession(singleTurn(), 'sid', 'rid')
    s.nextInput()
    return s.submitResponse('ok', opts).then(() => {
      expect(() => s.nextInput()).toThrow(/session has ended/)
    })
  })
})

describe('MultiTurnSession · submitResponse', () => {
  it('continue on a matching non-terminal reply (streak++, nextInput peek)', async () => {
    const s = new MultiTurnSession(multiTurn(), 'sid', 'rid')
    s.nextInput() // u1 → running
    const r = await s.submitResponse('a1', opts)
    expect(r.status).toBe('continue')
    expect(r.nextInput).toBe('final?')
    expect(s.streak).toBe(1)
  })
  it('derailment on a non-matching reply (terminated; verdict from scoreDa mapped to fail)', async () => {
    const s = new MultiTurnSession(multiTurn(), 'sid', 'rid')
    s.nextInput()
    const r = await s.submitResponse('totally off-script reply', opts)
    expect(r.status).toBe('terminated')
    expect(r.verdict).toBe('fail') // delivery fuzzy fails on a mismatch
    expect(s.state).toBe('terminated')
    expect(s.diagnostic?.derailedAtTurn).toBe(1)
  })
  it('terminal turn → completed with the scoreDa verdict', async () => {
    const s = new MultiTurnSession(singleTurn(), 'sid', 'rid')
    s.nextInput()
    const r = await s.submitResponse('the answer is ok', opts)
    expect(r.status).toBe('completed')
    expect(r.verdict).toBe('pass') // delivery fuzzy: 'the answer is ok' contains 'ok'
    expect(s.state).toBe('completed')
  })
  it('throws when called before nextInput (state not running)', async () => {
    const s = new MultiTurnSession(singleTurn(), 'sid', 'rid')
    await expect(s.submitResponse('ok', opts)).rejects.toThrow(/expected 'running'/)
  })
  it('derails when there are more responses than scripted assistant turns (no assistant turn to match)', async () => {
    // 1 user turn + 0 assistant turns: expectedIdx >= assistantTurns.length → matches=false → derail.
    const c = makeCase({ case_id: 'z', input: { question: 'q?', turns: [{ role: 'user', content: 'u1' }] }, expected: { answer: 'a', delivery_match: 'fuzzy' } })
    const s = new MultiTurnSession(c, 'sid', 'rid')
    s.nextInput()
    const r = await s.submitResponse('totally off', opts)
    expect(r.status).toBe('terminated')
    expect(r.verdict).toBe('fail')
  })
  it('derailment maps a passing scoreDa verdict to partial (the === "pass" true-branch)', async () => {
    // Scripted assistant 'a1'; agent replies 'ok' (derails — doesn't match
    // 'a1') but the reply satisfies DELIVERY 'ok' → scoreDa pass → partial.
    const c = makeCase({ case_id: 'p', input: { question: 'q?', turns: [{ role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }] }, expected: { answer: 'ok', delivery_match: 'fuzzy' } })
    const s = new MultiTurnSession(c, 'sid', 'rid')
    s.nextInput()
    const r = await s.submitResponse('ok', opts)
    expect(r.status).toBe('terminated')
    expect(r.verdict).toBe('partial')
  })
})
