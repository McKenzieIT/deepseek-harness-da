import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/runner.ts'
import { compareDelta, regressions, improvements } from '../src/delta.ts'
import { runHealthGate } from '../src/health_gate.ts'
import { withInfraRetry, classifyInfraFailure, isInfraError } from '../src/infra_retry.ts'
import { writeRunResult, readRunResult } from '../src/persistence.ts'
import { buildCollaborators } from '../src/collaborators.ts'
import { StubAgentResponder, StubQueryExecutor, StubJudgeExecutor, FailingAgentResponder } from '../src/stubs.ts'
import type { RunResult, RunnerVerdict } from '../src/types.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

const fixtureDir = import.meta.dirname!
const caseA = `${fixtureDir}/fixtures/case-a.yaml`
const caseB = `${fixtureDir}/fixtures/case-b.yaml`
const caseC = `${fixtureDir}/fixtures/case-c.yaml`

function makeStubs() {
  const agent = new StubAgentResponder()
  const executor = new StubQueryExecutor()
  const judge = new StubJudgeExecutor()
  return { agent, executor, judge }
}

describe('runBatch', () => {
  it('produces correct verdicts with stub collaborators', async () => {
    const { agent, executor, judge } = makeStubs()

    // Agent returns SQL that the executor will produce matching results for
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]!.case_id).toBe('case-a')
    expect(result.cases[0]!.verdict).toBe('correct')
    expect(result.summary.total).toBe(1)
    expect(result.summary.correct).toBe(1)
    expect(result.summary.pass_rate).toBe(1)
  })

  it('marks case as wrong when execution does not match', async () => {
    const { agent, executor, judge } = makeStubs()

    agent.setDefaultReply({ reply: 'wrong answer', generated_sql: 'SELECT 999 AS total' })
    executor.setResult('SELECT 999 AS total', { success: true, rows: [{ total: 999 }], row_count: 1, error: null })
    judge.setScore(0.0, 'no match')

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    expect(result.cases[0]!.verdict).toBe('wrong')
  })

  it('pass_k best-of-k: any passing attempt produces correct', async () => {
    const { agent, executor, judge } = makeStubs()
    let callCount = 0

    // First attempt fails, second succeeds
    agent.respond = async (_question, _opts) => {
      callCount++
      if (callCount === 1) {
        // First attempt: wrong SQL
        return { reply: 'bad', generated_sql: 'SELECT 0 AS total' }
      }
      // Second attempt: correct
      return { reply: '1000', generated_sql: 'SELECT 1000 AS total' }
    }

    executor.setResult('SELECT 0 AS total', { success: true, rows: [{ total: 0 }], row_count: 1, error: null })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 2,
      skip_health_gate: true,
    })

    // Best-of-k: at least one attempt passed
    expect(result.cases[0]!.verdict).toBe('correct')
    expect(result.cases[0]!.pass_k_results).toHaveLength(2)
  })

  it('labels infra_failure when all attempts fail due to infra', async () => {
    const agent = new FailingAgentResponder(new Error('ECONNREFUSED: agent unreachable'))
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      max_infra_retries: 1,
      skip_health_gate: true,
    })

    expect(result.cases[0]!.verdict).toBe('infra_failure')
    expect(result.cases[0]!.pass_k_results[0]!.infra_error).toBeDefined()
  })

  it('labels wrong (not infra_failure) when all attempts throw a non-infra error', async () => {
    // A non-infra error: no connectivity/timeout/rate-limit/transient keywords,
    // so classifyInfraFailure returns null and withInfraRetry rethrows it.
    // The runner must route this to 'wrong' (the error is recorded on the
    // attempt via `error`, NOT `infra_error`), never 'infra_failure'.
    const agent = new FailingAgentResponder(new Error('TypeError: cannot read property of undefined'))
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 2,
      max_infra_retries: 1,
      skip_health_gate: true,
    })

    const c = result.cases[0]!
    expect(c.verdict).toBe('wrong')
    // Every attempt recorded a non-infra error message, and none set infra_error
    for (const a of c.pass_k_results) {
      expect(a.infra_error).toBeUndefined()
      expect(a.error).toBeDefined()
      expect(a.execution_match).toBe(false)
    }
    // The run-level summary must NOT count this as infra_failure
    expect(result.summary.infra_failure).toBe(0)
    expect(result.summary.wrong).toBe(1)
  })

  it('runs multiple cases and computes summary', async () => {
    const { agent, executor, judge } = makeStubs()

    agent.respond = async (question, _opts) => {
      if (question.includes('total revenue')) {
        return { reply: '1000', generated_sql: 'SELECT 1000 AS total' }
      }
      if (question.includes('users are active')) {
        return { reply: '42', generated_sql: 'SELECT 42 AS count' }
      }
      return { reply: 'The average order value is 50 dollars', generated_sql: null }
    }

    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    executor.setResult('SELECT 42 AS count', { success: true, rows: [{ count: 42 }], row_count: 1, error: null })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA, caseB, caseC], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    expect(result.summary.total).toBe(3)
    expect(result.summary.correct).toBe(3)
    expect(result.summary.pass_rate).toBe(1)
  })
})

describe('infra retry', () => {
  it('classifies connectivity errors', () => {
    expect(classifyInfraFailure(new Error('ECONNREFUSED'))).toBe('connectivity')
    expect(classifyInfraFailure(new Error('connection reset'))).toBe('connectivity')
    expect(classifyInfraFailure(new Error('DNS lookup failed'))).toBe('connectivity')
  })

  it('classifies timeout errors', () => {
    expect(classifyInfraFailure(new Error('request timed out'))).toBe('timeout')
    expect(classifyInfraFailure(new Error('ETIMEDOUT'))).toBe('timeout')
  })

  it('classifies rate limit errors', () => {
    expect(classifyInfraFailure(new Error('429 Too Many Requests'))).toBe('rate_limit')
    expect(classifyInfraFailure(new Error('rate_limit exceeded'))).toBe('rate_limit')
  })

  it('classifies transient server errors', () => {
    expect(classifyInfraFailure(new Error('503 Service Unavailable'))).toBe('transient')
    expect(classifyInfraFailure(new Error('502 Bad Gateway'))).toBe('transient')
  })

  it('returns null for non-infra errors', () => {
    expect(classifyInfraFailure(new Error('invalid SQL syntax'))).toBeNull()
    expect(classifyInfraFailure(new Error('column not found'))).toBeNull()
  })

  it('retries on infra failure and succeeds', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      if (attempts < 3) throw new Error('ECONNREFUSED: try again')
      return 'success'
    }

    const { result, retries } = await withInfraRetry(fn, 3, async () => {})
    expect(result).toBe('success')
    expect(retries).toHaveLength(2)
    expect(attempts).toBe(3)
  })

  it('exhausts retries and throws InfraError', async () => {
    const fn = async () => { throw new Error('ECONNREFUSED: always fails') }

    try {
      await withInfraRetry(fn, 2, async () => {})
      expect.fail('should have thrown')
    } catch (err) {
      expect(isInfraError(err)).toBe(true)
      if (isInfraError(err)) {
        expect(err.infraRetries).toHaveLength(3)
      }
    }
  })

  it('does not retry non-infra errors', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      throw new Error('invalid SQL: missing FROM clause')
    }

    try {
      await withInfraRetry(fn, 3, async () => {})
      expect.fail('should have thrown')
    } catch (err) {
      expect(attempts).toBe(1)
      expect(isInfraError(err)).toBe(false)
    }
  })
})

describe('delta comparison', () => {
  const makeRun = (runId: string, cases: Array<{ case_id: string; verdict: RunnerVerdict }>): RunResult => ({
    run_id: runId,
    timestamp: new Date().toISOString(),
    cases: cases.map(c => ({
      case_id: c.case_id,
      pass_k_results: [],
      verdict: c.verdict,
      latency_ms: 100,
    })),
    summary: { total: cases.length, correct: 0, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 0 },
  })

  it('detects improved cases', () => {
    const runA = makeRun('run-a', [
      { case_id: 'c1', verdict: 'wrong' },
      { case_id: 'c2', verdict: 'correct' },
    ])
    const runB = makeRun('run-b', [
      { case_id: 'c1', verdict: 'correct' },
      { case_id: 'c2', verdict: 'correct' },
    ])

    const delta = compareDelta(runA, runB)
    expect(delta.flips).toHaveLength(1)
    expect(delta.flips[0]!.case_id).toBe('c1')
    expect(delta.flips[0]!.old_verdict).toBe('wrong')
    expect(delta.flips[0]!.new_verdict).toBe('correct')
    expect(delta.summary.improved).toBe(1)
    expect(delta.summary.regressed).toBe(0)
    expect(delta.summary.unchanged).toBe(1)
  })

  it('detects regressed cases', () => {
    const runA = makeRun('run-a', [
      { case_id: 'c1', verdict: 'correct' },
      { case_id: 'c2', verdict: 'correct' },
    ])
    const runB = makeRun('run-b', [
      { case_id: 'c1', verdict: 'correct' },
      { case_id: 'c2', verdict: 'wrong' },
    ])

    const delta = compareDelta(runA, runB)
    expect(delta.summary.regressed).toBe(1)
    expect(delta.summary.improved).toBe(0)
  })

  it('reports no flips when runs are identical', () => {
    const runA = makeRun('run-a', [
      { case_id: 'c1', verdict: 'correct' },
    ])
    const runB = makeRun('run-b', [
      { case_id: 'c1', verdict: 'correct' },
    ])

    const delta = compareDelta(runA, runB)
    expect(delta.flips).toHaveLength(0)
    expect(delta.summary.unchanged).toBe(1)
  })

  it('filters regressions and improvements', () => {
    const runA = makeRun('run-a', [
      { case_id: 'c1', verdict: 'wrong' },
      { case_id: 'c2', verdict: 'correct' },
      { case_id: 'c3', verdict: 'correct' },
    ])
    const runB = makeRun('run-b', [
      { case_id: 'c1', verdict: 'correct' },
      { case_id: 'c2', verdict: 'wrong' },
      { case_id: 'c3', verdict: 'correct' },
    ])

    const delta = compareDelta(runA, runB)
    expect(regressions(delta)).toHaveLength(1)
    expect(improvements(delta)).toHaveLength(1)
  })
})

describe('health gate', () => {
  it('passes when all collaborators are healthy', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()

    const result = await runHealthGate({ agent, executor, judge })
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(3)
    expect(result.checks.every(c => c.healthy)).toBe(true)
  })

  it('fails when agent is unreachable', async () => {
    const agent = new FailingAgentResponder()
    const result = await runHealthGate({ agent })
    expect(result.passed).toBe(false)
    expect(result.checks[0]!.healthy).toBe(false)
  })

  it('passes with no collaborators', async () => {
    const result = await runHealthGate({})
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(0)
  })
})

describe('persistence', () => {
  it('writes and reads a run result', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'eval-runner-test-'))
    const outputPath = join(tempDir, 'run-1.json')

    const original: RunResult = {
      run_id: 'run-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      cases: [{
        case_id: 'c1',
        pass_k_results: [{ attempt_k: 1, execution_match: true, delivery_match: true }],
        verdict: 'correct',
        latency_ms: 150,
      }],
      summary: { total: 1, correct: 1, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, pass_rate: 1 },
    }

    writeRunResult(original, outputPath)
    const loaded = readRunResult(outputPath)

    expect(loaded.run_id).toBe('run-1')
    expect(loaded.cases).toHaveLength(1)
    expect(loaded.cases[0]!.verdict).toBe('correct')
    expect(loaded.summary.pass_rate).toBe(1)
  })
})
