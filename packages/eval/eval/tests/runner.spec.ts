import { describe, expect, it } from 'vitest'
import { runBatch, classifyCaseOutcome } from '../src/runner.ts'
import type { MultiTurnCaseResult } from '../src/types.ts'
import { makeCase, makeStubExecute } from './helpers.ts'

const simpleCase = makeCase({
  case_id: 'c1',
  input: { question: 'What is revenue?', scope_id: 's1' },
  expected: { result_value: { value: 100 }, match_mode: 'scalar_exact' },
})

const simpleCase2 = makeCase({
  case_id: 'c2',
  input: { question: 'What is cost?', scope_id: 's1' },
  expected: { result_value: { value: 100 }, match_mode: 'scalar_exact' },
})

function passingResponder() {
  return async (req: { message: string }) => ({
    reply: 'Here is the answer',
    generatedSql: 'SELECT revenue FROM t',
    generatedBehavior: null,
  })
}

function failingResponder() {
  return async () => ({
    reply: 'I cannot answer',
    generatedSql: 'SELECT bad FROM nowhere',
    generatedBehavior: null,
  })
}

function errorResponder() {
  return async () => { throw new Error('agent crashed') }
}

describe('classifyCaseOutcome', () => {
  it('correct when passed=true', () => {
    const r: MultiTurnCaseResult = { caseId: 'c', passK: 3, passed: true, verdict: 'pass', attempts: [], latencyMs: 0, lastSubmission: null }
    expect(classifyCaseOutcome(r)).toBe('correct')
  })
  it('wrong when verdict=fail and not all errors', () => {
    const r: MultiTurnCaseResult = {
      caseId: 'c', passK: 3, passed: false, verdict: 'fail',
      attempts: [{ attempt: 1, verdict: 'fail', state: 'completed', turnsTaken: 1, streak: 0, diagnostic: null, submission: null, error: null, timeout: false, l1: null }],
      latencyMs: 0, lastSubmission: null,
    }
    expect(classifyCaseOutcome(r)).toBe('wrong')
  })
  it('declined when verdict=partial', () => {
    const r: MultiTurnCaseResult = {
      caseId: 'c', passK: 3, passed: false, verdict: 'partial',
      attempts: [{ attempt: 1, verdict: 'partial', state: 'completed', turnsTaken: 1, streak: 0, diagnostic: null, submission: null, error: null, timeout: false, l1: null }],
      latencyMs: 0, lastSubmission: null,
    }
    expect(classifyCaseOutcome(r)).toBe('declined')
  })
  it('unjudged when all attempts errored', () => {
    const r: MultiTurnCaseResult = {
      caseId: 'c', passK: 3, passed: false, verdict: null,
      attempts: [{ attempt: 1, verdict: null, state: 'running', turnsTaken: 1, streak: 0, diagnostic: null, submission: null, error: 'crashed', timeout: false, l1: null }],
      latencyMs: 0, lastSubmission: null,
    }
    expect(classifyCaseOutcome(r)).toBe('unjudged')
  })
})

describe('runBatch', () => {
  it('runs all cases and produces a summary', async () => {
    const execute = makeStubExecute({ rows: [{ revenue: 100 }] })
    const result = await runBatch([simpleCase], {
      runId: 'run1',
      responder: passingResponder(),
      executeSql: execute,
      passK: 1,
    })
    expect(result.runId).toBe('run1')
    expect(result.perCase).toHaveLength(1)
    expect(result.perCase[0].caseId).toBe('c1')
    expect(result.summary.totalCases).toBe(1)
    expect(result.summary.correct).toBe(1)
    expect(result.summary.passRate).toBe(1)
  })

  it('handles multiple cases', async () => {
    const execute = makeStubExecute({ rows: [{ revenue: 100 }] })
    const completed: string[] = []
    const result = await runBatch([simpleCase, simpleCase2], {
      runId: 'run2',
      responder: passingResponder(),
      executeSql: execute,
      passK: 1,
      onCaseComplete: (r) => completed.push(r.caseId),
    })
    expect(result.perCase).toHaveLength(2)
    expect(completed).toEqual(['c1', 'c2'])
    expect(result.summary.totalCases).toBe(2)
  })

  it('classifies erroring cases as unjudged', async () => {
    const result = await runBatch([simpleCase], {
      runId: 'run3',
      responder: errorResponder(),
      passK: 1,
      maxInfraRetries: 0,
    })
    expect(result.perCase[0].outcome).toBe('unjudged')
    expect(result.summary.unjudged).toBe(1)
  })

  it('retries infra failures up to maxInfraRetries', async () => {
    let callCount = 0
    const responder = async () => {
      callCount++
      if (callCount <= 2) throw new Error('infra failure')
      return { reply: 'ok', generatedSql: 'SELECT revenue FROM t', generatedBehavior: null }
    }
    const execute = makeStubExecute({ rows: [{ revenue: 100 }] })
    const result = await runBatch([simpleCase], {
      runId: 'run4',
      responder,
      executeSql: execute,
      passK: 1,
      maxInfraRetries: 2,
    })
    // After 2 retries the 3rd attempt succeeds
    expect(callCount).toBe(3)
    expect(result.perCase[0].outcome).toBe('correct')
  })
})
