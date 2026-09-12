import { describe, expect, it, vi } from 'vitest'
import { runBatch } from '../src/runner.ts'
import { makeTestRunOptions } from './test_config.ts'
import { compareDelta, regressions, improvements } from '../src/delta.ts'
import { runHealthGate } from '../src/health_gate.ts'
import { withInfraRetry, classifyInfraFailure, isInfraError } from '../src/infra_retry.ts'
import { writeRunResult, readRunResult } from '../src/persistence.ts'
import { buildCollaborators } from '../src/collaborators.ts'
import { StubAgentResponder, StubQueryExecutor, StubJudgeExecutor, FailingAgentResponder } from '../src/stubs.ts'
import type { RunResult, RunnerVerdict } from '../src/types.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'

const fixtureDir = import.meta.dirname
const caseA = `${fixtureDir}/fixtures/case-a.yaml`
const caseB = `${fixtureDir}/fixtures/case-b.yaml`
const caseC = `${fixtureDir}/fixtures/case-c.yaml`

function makeStubs() {
  const agent = new StubAgentResponder()
  const executor = new StubQueryExecutor()
  const judge = new StubJudgeExecutor()
  return { agent, executor, judge }
}

function writeCase(name: string, expected: Record<string, unknown>, meta?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eval-runner-case-'))
  const path = join(dir, `${name}.json`)
  writeFileSync(path, JSON.stringify({
    case_id: name,
    input: { question: `question for ${name}` },
    expected,
    ...(meta === undefined ? {} : { meta }),
  }))
  return path
}

describe('runBatch', () => {

  it.each([
    ['unknown match mode', { result_value: { value: 1 }, match_mode: 'scalar_exactt' }, /unknown match_mode/],
    ['mismatched expected fields', { result_value: { value: 1 } }, /without match_mode/],
    ['no declared assertions', {}, /neither EXECUTION nor DELIVERY/],
  ] as const)('loads %s as a per-case defect without calling the agent', async (_name, expected, detail) => {
    const agent = new StubAgentResponder()
    const collaborators = buildCollaborators(agent, null, null)
    const path = writeCase('content-defect', expected)

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'case_defect',
      pass_k_results: [],
      preflight: { content: { status: 'case-defect' } },
    })
    expect(result.cases[0]!.preflight?.content.detail).toMatch(detail)
    expect(agent.calls).toHaveLength(0)
  })

  it('records source and grading provenance in the returned and persisted run', async () => {
    const agent = new StubAgentResponder()
    const collaborators = buildCollaborators(agent, null, null)
    const path = writeCase('provenance', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT {{ds_yesterday}} AS value',
      behavior: 'returns one scalar',
    }, { anchor_ds: '20260912', provenance: 'human-reference' })
    const outputPath = join(mkdtempSync(join(tmpdir(), 'eval-runner-output-')), 'run.json')

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators, { output_path: outputPath }))

    expect(result.cases[0]!.caseProvenance).toEqual({
      sourcePath: path,
      schemaVersion: null,
      scopeId: null,
      expected: {
        result_value: { value: 1 },
        match_mode: 'scalar_exact',
        sql: 'SELECT {{ds_yesterday}} AS value',
        behavior: 'returns one scalar',
      },
      meta: { anchor_ds: '20260912', provenance: 'human-reference' },
      referenceSql: {
        kind: 'resolved',
        sql: 'SELECT 20260911 AS value',
        anchorDs: '20260912',
        substitutions: { ds_yesterday: '20260911' },
      },
    })
    expect(readRunResult(outputPath).cases[0]!.caseProvenance).toEqual(result.cases[0]!.caseProvenance)
  })

  it('keeps running valid cases when another case has defective grading content', async () => {
    const agent = new StubAgentResponder()
    agent.setDefaultReply({ reply: 'The average order value is 50 dollars', generated_sql: null })
    const collaborators = buildCollaborators(agent, null, null)
    const invalid = writeCase('content-defect-in-batch', {
      result_value: { value: 1 },
      match_mode: 'unknown-mode',
    })

    const result = await runBatch([invalid, caseC], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases.map(item => item.verdict)).toEqual(['case_defect', 'correct'])
    expect(agent.calls.map(call => call.question)).toEqual(['What is the average order value?'])
  })

  it.each([
    ['template', 'SELECT {{unknown_anchor}}', undefined, /unknown placeholder/i],
    ['anchor', 'SELECT {{ds_yesterday}}', { anchor_ds: '20260230' }, /not yyyymmdd/i],
  ] as const)('records an unresolvable reference SQL %s as a case defect before calling the agent', async (_name, sql, meta, detail) => {
    const agent = new StubAgentResponder()
    const collaborators = buildCollaborators(agent, null, null)
    const path = writeCase('bad-reference-resolution', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql,
    }, meta)

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'case_defect',
      pass_k_results: [],
      preflight: {
        content: { status: 'passed' },
        reference_sql: {
          status: 'case-defect',
          stage: 'resolution',
        },
      },
    })
    expect(result.cases[0]!.preflight?.reference_sql?.detail).toMatch(detail)
    expect(agent.calls).toHaveLength(0)
  })

  it('records a reference infrastructure failure and does not call the agent', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT 1 AS value', {
      state: 'failed',
      failureKind: 'transport',
      error: 'connection reset by warehouse',
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('reference-infra', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT 1 AS value',
    })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'infra_failure',
      pass_k_results: [],
      preflight: {
        reference_sql: {
          status: 'environment-blocked',
          stage: 'execution',
          sql: 'SELECT 1 AS value',
          execution_artifact: { kind: 'failed', failureKind: 'transport' },
        },
      },
    })
    expect(agent.calls).toHaveLength(0)
  })

  it.each([
    ['syntax failure', 'syntax error near FROM', undefined],
    ['guard failure', 'guard rejected: required predicate missing', undefined],
    ['missing corpus object', 'Table not found: missing_reference_table', 'not_found'],
  ] as const)('records a reference %s as a case defect before calling the agent', async (_name, error, failureKind) => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT invalid', {
      state: 'failed',
      error,
      ...(failureKind === undefined ? {} : { failureKind }),
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('reference-invalid', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT invalid',
    })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'case_defect',
      pass_k_results: [],
      preflight: {
        reference_sql: {
          status: 'case-defect',
          stage: 'execution',
          execution_artifact: { kind: 'failed' },
        },
      },
    })
    expect(agent.calls).toHaveLength(0)
  })

  it('records a reference-result mismatch as a case defect before calling the agent', async () => {
    const agent = new StubAgentResponder()
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT 2 AS value', {
      state: 'completed',
      columns: ['value'],
      rows: [[2]],
      rowCount: 1,
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('reference-mismatch', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT 2 AS value',
    })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'case_defect',
      pass_k_results: [],
      preflight: {
        reference_sql: {
          status: 'case-defect',
          stage: 'comparison',
          execution_artifact: { kind: 'completed' },
        },
      },
    })
    expect(result.cases[0]!.preflight?.reference_sql?.detail).toMatch(/declared expected/i)
    expect(agent.calls).toHaveLength(0)
  })

  it('runs a resolved reference SQL before the candidate and records typed evidence', async () => {
    const agent = new StubAgentResponder()
    agent.setDefaultReply({ reply: '1', generated_sql: 'SELECT candidate' })
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT 1 AS value', {
      state: 'completed',
      columns: ['value'],
      rows: [[1]],
      rowCount: 1,
    })
    executor.setResult('SELECT candidate', {
      state: 'completed',
      columns: ['value'],
      rows: [[1]],
      rowCount: 1,
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('reference-pass', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT 1 AS value',
    })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(executor.calls).toEqual(['SELECT 1 AS value', 'SELECT candidate'])
    expect(agent.calls).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({
      verdict: 'correct',
      preflight: {
        reference_sql: {
          status: 'passed',
          stage: 'comparison',
          sql: 'SELECT 1 AS value',
          substitutions: {},
          execution_artifact: { kind: 'completed' },
        },
      },
    })
  })

  it('only resolves reference SQL when no executor is mounted', async () => {
    const agent = new StubAgentResponder()
    agent.setDefaultReply({ reply: '1', generated_sql: 'SELECT candidate' })
    const collaborators = buildCollaborators(agent, null, null)
    const path = writeCase('reference-static-only', {
      result_value: { value: 1 },
      match_mode: 'scalar_exact',
      sql: 'SELECT {{ds_yesterday}} AS ds',
    }, { anchor_ds: '20260912' })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(agent.calls).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({
      verdict: 'unjudged',
      preflight: {
        reference_sql: {
          status: 'resolved-not-executed',
          sql: 'SELECT 20260911 AS ds',
          anchor_ds: '20260912',
          substitutions: { ds_yesterday: '20260911' },
        },
      },
    })
  })
  it('produces correct verdicts with stub collaborators', async () => {
    const { agent, executor, judge } = makeStubs()

    // Agent returns SQL that the executor will produce matching results for
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    }))

    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]!.case_id).toBe('case-a')
    expect(result.cases[0]!.verdict).toBe('correct')
    expect(result.summary.total).toBe(1)
    expect(result.summary.correct).toBe(1)
    expect(result.summary.pass_rate).toBe(1)
  })

  it('classifies incomplete provider results as infrastructure rather than model error', async () => {
    const agent = new StubAgentResponder()
    agent.setDefaultReply({ reply: 'values', generated_sql: 'SELECT value FROM source' })
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT value FROM source', {
      state: 'completed',
      columns: ['value'],
      rows: [[1]],
      rowCount: 2,
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('candidate-provider-truncated', {
      result_value: { rows: [1, 2] },
      match_mode: 'set_equal',
    })

    const result = await runBatch([path], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases[0]).toMatchObject({
      verdict: 'infra_failure',
      pass_k_results: [{ execution_outcome: 'environment-blocked' }],
    })
    expect(result.cases[0]!.pass_k_results[0]!.execution_detail).toMatch(/incomplete result/i)
  })

  it('grades complete live rows even when persistence stores only a preview', async () => {
    const agent = new StubAgentResponder()
    agent.setDefaultReply({ reply: 'values', generated_sql: 'SELECT value FROM source' })
    const executor = new StubQueryExecutor()
    executor.setResult('SELECT value FROM source', {
      state: 'completed',
      columns: ['value'],
      rows: [[1], [2]],
      rowCount: 2,
    })
    const collaborators = buildCollaborators(agent, executor, null)
    const path = writeCase('candidate-storage-truncated', {
      result_value: { rows: [1, 2] },
      match_mode: 'set_equal',
    })
    const options = makeTestRunOptions(collaborators)
    const result = await runBatch([path], collaborators, {
      ...options,
      config: { ...options.config, max_stored_rows: 1 },
    })

    expect(result.cases[0]).toMatchObject({
      verdict: 'correct',
      pass_k_results: [{
        execution_outcome: 'pass',
        execution_artifact: { rowsStored: 1, storageTruncated: true },
      }],
    })
  })

  it('marks case as wrong when execution does not match', async () => {
    const { agent, executor, judge } = makeStubs()

    agent.setDefaultReply({ reply: 'wrong answer', generated_sql: 'SELECT 999 AS total' })
    executor.setResult('SELECT 999 AS total', { state: 'completed', columns: ['total'], rows: [[999]], rowCount: 1 })
    judge.setScore(0.0, 'no match')

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    }))

    expect(result.cases[0]!.verdict).toBe('wrong')
  })

  it('pass^k: a failing attempt makes the case wrong (all attempts must pass)', async () => {
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

    executor.setResult('SELECT 0 AS total', { state: 'completed', columns: ['total'], rows: [[0]], rowCount: 1 })
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 2,
      skip_health_gate: true,
    }))

    // pass^k (eval-core-1 / re-baseline): ALL attempts must pass — a single
    // failing attempt makes the case 'wrong'. The prior best-of-k ('any pass =
    // correct') semantics was retired (pass_k is the anti-flakiness mechanism
    // requiring every attempt to pass, not best-of-k).
    expect(result.cases[0]!.verdict).toBe('wrong')
    expect(result.cases[0]!.pass_k_results).toHaveLength(2)
  })

  it('does not pass a case when one execution attempt is environment-blocked', async () => {
    const agent = new StubAgentResponder()
    const judge = new StubJudgeExecutor()
    let executions = 0
    const executor = {
      execute: async () => {
        executions++
        if (executions === 1) {
          return { state: 'completed' as const, columns: ['total'], rows: [[1000]], rowCount: 1 }
        }
        return { state: 'pending' as const, instanceId: 'query-2' }
      },
    }
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 2,
      max_infra_retries: 0,
    }))

    expect(result.cases[0]!.pass_k_results.map(a => a.execution_outcome)).toEqual(['pass', 'environment-blocked'])
    expect(result.cases[0]!.verdict).toBe('infra_failure')
    expect(result.summary.pass_rate).toBe(0)
  })

  it('does not pass a case when one required execution attempt is not measured', async () => {
    const agent = new StubAgentResponder()
    const judge = new StubJudgeExecutor()
    const collaborators: {
      agent: StubAgentResponder
      executor: { execute(sql: string): Promise<{ state: 'completed'; columns: string[]; rows: number[][]; rowCount: number }> } | null
      judge: StubJudgeExecutor
    } = {
      agent,
      executor: null,
      judge,
    }
    collaborators.executor = {
      execute: async () => {
        collaborators.executor = null
        return { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 }
      },
    }
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, { pass_k: 2 }))

    expect(result.cases[0]!.pass_k_results.map(a => a.execution_outcome)).toEqual(['pass', 'not-measured'])
    expect(result.cases[0]!.verdict).toBe('unjudged')
    expect(result.summary.pass_rate).toBe(0)
  })

  it('excludes unjudged cases from the pass-rate denominator', async () => {
    const agent = new StubAgentResponder()
    agent.respond = async question => question.includes('average order value')
      ? { reply: 'The average order value is 50 dollars', generated_sql: null }
      : { reply: '1000', generated_sql: 'SELECT 1000 AS total' }
    const collaborators = buildCollaborators(agent, null, null)

    const result = await runBatch([caseC, caseA], collaborators, makeTestRunOptions(collaborators))

    expect(result.cases.map(c => c.verdict)).toEqual(['correct', 'unjudged'])
    expect(result.summary.correct).toBe(1)
    expect(result.summary.unjudged).toBe(1)
    expect(result.summary.pass_rate).toBe(1)
  })

  it.each(['retryable', 'transport', 'throttling', 'timeout'])(
    'retries a returned %s query outcome before grading it',
    async (failureKind) => {
      vi.useFakeTimers()
      try {
        const agent = new StubAgentResponder()
        const judge = new StubJudgeExecutor()
        let executions = 0
        const executor = {
          execute: async () => {
            executions++
            if (executions === 1) {
              return { state: 'failed' as const, failureKind, error: 'syntax error reported in a retryable provider envelope' }
            }
            return { state: 'completed' as const, columns: ['total'], rows: [[1000]], rowCount: 1 }
          },
        }
        agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
        const collaborators = buildCollaborators(agent, executor, judge)

        const pending = runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
          max_infra_retries: 1,
        }))
        await vi.runAllTimersAsync()
        const result = await pending

        expect(executions).toBe(2)
        expect(agent.calls).toHaveLength(1)
        expect(result.cases[0]!.verdict).toBe('correct')
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('labels infra_failure when all attempts fail due to infra', async () => {
    const agent = new FailingAgentResponder(new Error('ECONNREFUSED: agent unreachable'))
    const executor = new StubQueryExecutor()
    const judge = new StubJudgeExecutor()

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 1,
      max_infra_retries: 1,
      skip_health_gate: true,
    }))

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

    const result = await runBatch([caseA], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 2,
      max_infra_retries: 1,
      skip_health_gate: true,
    }))

    const c = result.cases[0]!
    expect(c.verdict).toBe('wrong')
    // Every attempt recorded a non-infra error message, and none set infra_error
    for (const a of c.pass_k_results) {
      expect(a.infra_error).toBeUndefined()
      expect(a.error).toBeDefined()
      expect(a.execution_outcome).toBe('fail')
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

    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    executor.setResult('SELECT 42 AS count', { state: 'completed', columns: ['count'], rows: [[42]], rowCount: 1 })
    judge.setScore(1.0)

    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA, caseB, caseC], collaborators, makeTestRunOptions(collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    }))

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
    summary: { total: cases.length, correct: 0, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, case_defect: 0, pass_rate: 0 },
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
        pass_k_results: [{ attempt_k: 1, execution_outcome: 'pass', delivery_match: true }],
        verdict: 'correct',
        latency_ms: 150,
      }],
      summary: { total: 1, correct: 1, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, case_defect: 0, pass_rate: 1 },
      config: makeTestRunOptions(buildCollaborators(new StubAgentResponder(), null, null)).config,
    }

    writeRunResult(original, outputPath)
    const loaded = readRunResult(outputPath)

    expect(loaded.run_id).toBe('run-1')
    expect(loaded.cases).toHaveLength(1)
    expect(loaded.cases[0]!.verdict).toBe('correct')
    expect(loaded.summary.pass_rate).toBe(1)
  })
})
