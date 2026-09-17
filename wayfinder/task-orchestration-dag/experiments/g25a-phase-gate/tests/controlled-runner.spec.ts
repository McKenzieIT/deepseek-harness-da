/** Stage 0 tests for the controlled runner's frozen schedule and parity gates. */

import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildSmokePlan,
  buildDecisionPlan,
  executeAttempt,
  parseReferenceResult,
  resolveAttemptEnvironment,
  resolveWorkspaceSpecifier,
  runReferenceProbe,
  runStage1,
  summarizeStage1,
  verifyToolSchedulerIdentity,
  selectSmokeCases,
  validateObservationParity,
  type G25aManifest,
  type AttemptRuntime,
  type ReferenceCommand,
  type SmokeAttemptResult,
} from '../src/controlled-runner.ts'

const MANIFEST = JSON.parse(readFileSync(resolve(import.meta.dirname, '../cases/manifest.json'), 'utf8')) as G25aManifest

describe('controlled runner plan', () => {
  it('builds the locked 252-Attempt decision schedule deterministically', () => {
    const first = buildDecisionPlan(MANIFEST)
    const second = buildDecisionPlan(MANIFEST)
    expect(first).toEqual(second)
    expect(first).toHaveLength(252)
    for (const testCase of MANIFEST.cases) {
      const rows = first.filter(attempt => attempt.caseId === testCase.case_id)
      expect(rows.filter(attempt => attempt.arm === 'state_machine')).toHaveLength(3)
      expect(rows.filter(attempt => attempt.arm === 'policy')).toHaveLength(3)
      expect(rows.filter(attempt => attempt.arm === 'floor')).toHaveLength(1)
      expect(new Set(rows.map(attempt => attempt.taskDigest))).toHaveLength(1)
    }
  })

  it('selects the approved amended smoke mix from verified cases', () => {
    expect(selectSmokeCases(MANIFEST).map(testCase => testCase.case_id)).toEqual([
      'g25a_exec_037',
      'g25a_exec_039',
      'g25a_exec_046',
      'g25a_exec_042',
      'g25a_exec_048',
      'g25a_fail_01',
    ])
  })

  it('builds one deterministically ordered Attempt per arm for every smoke case', () => {
    const first = buildSmokePlan(MANIFEST)
    const second = buildSmokePlan(MANIFEST)
    expect(first).toEqual(second)
    expect(first).toHaveLength(18)
    for (const testCase of selectSmokeCases(MANIFEST)) {
      const rows = first.filter(attempt => attempt.caseId === testCase.case_id)
      expect(rows.map(attempt => attempt.arm).toSorted()).toEqual(['floor', 'policy', 'state_machine'])
      expect(rows.map(attempt => attempt.replicate)).toEqual([0, 0, 0])
      expect(rows.map(attempt => attempt.order)).toEqual(rows.map(attempt => attempt.order).toSorted((a, b) => a - b))
    }
  })

  it('rejects tool-catalogue or Task-working-set drift across arms', () => {
    expect(() => validateObservationParity([
      { arm: 'state_machine', taskDigest: 'same', toolNames: ['a', 'b'] },
      { arm: 'policy', taskDigest: 'same', toolNames: ['a', 'c'] },
      { arm: 'floor', taskDigest: 'same', toolNames: ['a', 'b'] },
    ])).toThrow(/tool catalogue drift/)
    expect(() => validateObservationParity([
      { arm: 'state_machine', taskDigest: 'a', toolNames: ['a'] },
      { arm: 'policy', taskDigest: 'b', toolNames: ['a'] },
      { arm: 'floor', taskDigest: 'a', toolNames: ['a'] },
    ])).toThrow(/Task working set drift/)
  })
})

describe('reference probes', () => {
  it('parses the maxc JSON envelope into a stable scalar receipt', () => {
    const parsed = parseReferenceResult(JSON.stringify({
      status: 'success',
      data: {
        result: {
          schema: [{ name: 'dau' }],
          rows: [{ dau: 4336 }],
        },
      },
    }))
    expect(parsed).toEqual({
      columns: ['dau'],
      rows: [['4336']],
      rowCount: 1,
      scalar: 4336,
      digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    })
  })

  it('uses explicit maxc paths without exposing config contents', async () => {
    const calls: ReferenceCommand[] = []
    const testCase = MANIFEST.cases.find(row => row.case_id === 'g25a_exec_037')!
    const receipt = await runReferenceProbe(testCase, {
      maxcPath: '/opt/maxc/bin/maxc',
      maxcConfigPath: '/home/test/.maxc/config.yaml',
      execute: async (command) => {
        calls.push(command)
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({
            status: 'success',
            data: { result: { schema: [{ name: 'dau' }], rows: [{ dau: 4336 }] } },
          }),
          stderr: '',
        }
      },
    })
    expect(calls).toEqual([{
      file: '/opt/maxc/bin/maxc',
      args: ['--config', '/home/test/.maxc/config.yaml', 'query', 'run', '--wait', '300', '--stdin', '--json'],
      stdin: testCase.grading.reference_sql,
    }])
    expect(receipt).toMatchObject({
      caseId: 'g25a_exec_037',
      matchesExpected: true,
      maxcPath: '/opt/maxc/bin/maxc',
      maxcConfigPath: '/home/test/.maxc/config.yaml',
      result: { scalar: 4336 },
    })
    expect(JSON.stringify(receipt)).not.toContain('credential')
  })

  it('reports a structured maxc failure returned on stdout', async () => {
    const testCase = MANIFEST.cases.find(row => row.case_id === 'g25a_exec_037')!
    await expect(runReferenceProbe(testCase, {
      maxcPath: '/opt/maxc/bin/maxc',
      maxcConfigPath: '/home/test/.maxc/config.yaml',
      execute: async () => ({
        code: 1,
        signal: null,
        stdout: JSON.stringify({ status: 'failure', error: { message: 'Local cache database is unavailable' } }),
        stderr: '',
      }),
    })).rejects.toThrow(/Local cache database is unavailable/)
  })
})

describe('Stage 1 controller', () => {
  it('runs reference probes around the 18 Attempts with at most three in flight', async () => {
    let active = 0
    let maximumActive = 0
    const attempts: string[] = []
    const probes: string[] = []
    const result = await runStage1(MANIFEST, {
      probe: async (testCase, phase) => {
        probes.push(`${phase}:${testCase.case_id}`)
        return {
          caseId: testCase.case_id,
          maxcPath: '/maxc',
          maxcConfigPath: '/config',
          result: { columns: ['value'], rows: [['1']], rowCount: 1, scalar: 1, digest: `digest-${testCase.case_id}` },
          matchesExpected: true,
        }
      },
      attempt: async (planned, testCase): Promise<SmokeAttemptResult> => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await Promise.resolve()
        attempts.push(planned.attemptId)
        active -= 1
        const queryEvidence = testCase.type === 'real_execution'
          ? [{
              callId: 'q1', name: 'query_data', argumentsText: '{}', arguments: {}, callSeq: 1,
              state: 'completed' as const, columns: ['value'], rows: [['1']], rowCount: 1,
            }]
          : []
        return {
          planned,
          testCase,
          observation: {
            finalAnswer: '2026-08-05 的数据不可得，4 次查询均失败。',
            firstUserText: planned.taskWorkingSet,
            toolNames: ['query_data'],
            assistantMessages: ['数据不可得'],
            toolCalls: queryEvidence,
            queryAttempts: queryEvidence,
            clarifications: [],
            modelCalls: 1,
            successfulQueries: queryEvidence.length,
            usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 },
            wallClockMs: 1,
          },
          grade: {
            caseId: testCase.case_id,
            status: 'graded',
            pass: true,
            executionCorrect: testCase.type === 'real_execution',
            answerSupported: true,
            clarificationCorrect: false,
            appropriateDecline: testCase.type === 'persistent_failure',
            recoverySuccess: false,
            severeUnsupported: false,
            budgetExceeded: false,
            reasons: [],
          },
          firstModelRequestContainsTask: true,
          rawLocator: `raw/${planned.attemptId}`,
          observationDigest: `observation-${planned.attemptId}`,
          gradeDigest: `grade-${planned.attemptId}`,
        }
      },
      concurrency: 3,
    })
    expect(attempts).toHaveLength(18)
    expect(maximumActive).toBeLessThanOrEqual(3)
    expect(probes.filter(row => row.startsWith('before:'))).toHaveLength(5)
    expect(probes.filter(row => row.startsWith('after:'))).toHaveLength(5)
    expect(result.passed).toBe(true)
    const summary = summarizeStage1('smoke-run', result, {
      provider: 'aga', model: 'qwen3.7-max', scopeId: '10000251', maxcomputeProject: 'ieu_cdm',
      semanticRoot: '/repo/examples/k11-semantic-layer', presetPath: '/repo/preset.yml', sidecarPath: '/repo/sidecar.mjs',
      maxcPath: '/opt/maxc/bin/maxc', maxcConfigPath: '/home/test/.maxc/config.yaml', environmentVariableNames: ['MAXC_CONFIG'],
    })
    expect(summary.attempts).toHaveLength(18)
    expect(summary.environment).toEqual({
      provider: 'aga',
      model: 'qwen3.7-max',
      scopeId: '10000251',
      maxcomputeProject: 'ieu_cdm',
      semanticRoot: '/repo/examples/k11-semantic-layer',
      maxcPath: '/opt/maxc/bin/maxc',
      maxcConfigPath: '/home/test/.maxc/config.yaml',
      environmentVariableNames: ['MAXC_CONFIG'],
    })
    expect(JSON.stringify(summary)).not.toContain('rows')
    expect(JSON.stringify(summary)).not.toContain('finalAnswer')
  })

  it('fails Stage 1 when a reference result changes after the batch', async () => {
    let probeIndex = 0
    const result = await runStage1(MANIFEST, {
      probe: async (testCase) => {
        probeIndex += 1
        return {
          caseId: testCase.case_id,
          maxcPath: '/maxc',
          maxcConfigPath: '/config',
          result: { columns: ['value'], rows: [['1']], rowCount: 1, scalar: 1, digest: probeIndex > 5 && testCase.case_id === 'g25a_exec_037' ? 'changed' : `digest-${testCase.case_id}` },
          matchesExpected: true,
        }
      },
      attempt: async (planned, testCase) => ({
        planned,
        testCase,
        observation: {
          finalAnswer: 'ok', firstUserText: planned.taskWorkingSet, toolNames: ['query_data'], assistantMessages: ['ok'],
          toolCalls: [], queryAttempts: [], clarifications: [], modelCalls: 1, successfulQueries: 0,
          usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 }, wallClockMs: 1,
        },
        grade: {
          caseId: testCase.case_id, status: 'graded', pass: true, executionCorrect: true, answerSupported: true,
          clarificationCorrect: false, appropriateDecline: false, recoverySuccess: false, severeUnsupported: false,
          budgetExceeded: false, reasons: [],
        },
        firstModelRequestContainsTask: true,
        rawLocator: `raw/${planned.attemptId}`,
        observationDigest: 'observation',
        gradeDigest: 'grade',
      }),
      concurrency: 3,
    })
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('reference result changed for g25a_exec_037')
  })
})

describe('Attempt lifecycle', () => {
  it('writes complete private evidence and waits for runtime disposal', async () => {
    const rawRoot = await mkdtemp(join(tmpdir(), 'g25a-attempt-'))
    const planned = buildSmokePlan(MANIFEST)[0]!
    const testCase = MANIFEST.cases.find(row => row.case_id === planned.caseId)!
    let disposed = false
    const runtime: AttemptRuntime = {
      run: async () => ({
        sessionHeader: { id: planned.attemptId },
        events: [
          { type: 'request/header', seq: 0, time: 0, data: { header: { config: { provider: 'aga', model: 'qwen3.7-max' }, tools: [{ name: 'query_data' }] }, reason: 'initial' } },
          { type: 'user/message', seq: 1, time: 1, data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: planned.taskWorkingSet }] } },
          { type: 'tool/call', seq: 2, time: 2, data: { turn: 1, step: 1, callId: 'q1', name: 'query_data', arguments: JSON.stringify({ sql: 'SELECT 1' }) } },
          { type: 'tool/result', seq: 3, time: 3, data: { turn: 1, step: 1, message: { id: 'r1', role: 'user', source: { kind: 'tool' }, content: [{ type: 'tool-result', toolCallId: 'q1', content: [{ type: 'text', text: 'value\n4336\n(1 row)' }] }] } } },
          { type: 'assistant/message', seq: 4, time: 4, data: { turn: 1, step: 1, message: { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'aga', model: 'qwen3.7-max' }, content: [{ type: 'text', text: '4336' }] }, usage: { inputTokens: 10, outputTokens: 1 }, stream: [] } },
        ] as never[],
        firstModelRequestContainsTask: true,
        budgetExceeded: false,
      }),
      dispose: async () => { disposed = true },
    }
    const result = await executeAttempt(planned, testCase, {
      runId: 'test-run',
      rawRoot,
      environment: {
        provider: 'aga', model: 'qwen3.7-max', scopeId: '10000251', maxcomputeProject: 'ieu_cdm',
        semanticRoot: '/repo/examples/k11-semantic-layer', presetPath: '/repo/preset.yml', sidecarPath: '/repo/sidecar.mjs',
        maxcPath: '/opt/maxc/bin/maxc', maxcConfigPath: '/home/test/.maxc/config.yaml', environmentVariableNames: ['MAXC_CONFIG'],
      },
      createRuntime: async () => runtime,
      now: (() => {
        let value = 100
        return () => value += 10
      })(),
    })
    expect(disposed).toBe(true)
    expect(result).toMatchObject({
      planned,
      rawLocator: `test-run/${planned.attemptId}`,
      firstModelRequestContainsTask: true,
      grade: { status: 'graded', pass: true },
    })
    for (const name of ['config.json', 'session.json', 'environment.json', 'observation.json', 'grade.json']) {
      expect(existsSync(join(rawRoot, result.rawLocator, name))).toBe(true)
    }
    const environment = await readFile(join(rawRoot, result.rawLocator, 'environment.json'), 'utf8')
    expect(environment).toContain('/home/test/.maxc/config.yaml')
    expect(environment).not.toContain('credential')
  })

  it('records an agent infrastructure failure and still disposes to quiescence', async () => {
    const rawRoot = await mkdtemp(join(tmpdir(), 'g25a-attempt-error-'))
    const planned = buildSmokePlan(MANIFEST)[0]!
    const testCase = MANIFEST.cases.find(row => row.case_id === planned.caseId)!
    let disposed = false
    const runtime: AttemptRuntime = {
      run: async () => { throw new Error('agent exploded') },
      dispose: async () => { disposed = true },
    }
    const result = await executeAttempt(planned, testCase, {
      runId: 'test-run', rawRoot,
      environment: {
        provider: 'aga', model: 'qwen3.7-max', scopeId: '10000251', maxcomputeProject: 'ieu_cdm',
        semanticRoot: '/repo/examples/k11-semantic-layer', presetPath: '/repo/preset.yml', sidecarPath: '/repo/sidecar.mjs',
        maxcPath: '/opt/maxc/bin/maxc', maxcConfigPath: '/home/test/.maxc/config.yaml', environmentVariableNames: [],
      },
      createRuntime: async () => runtime,
      now: () => 100,
    })
    expect(disposed).toBe(true)
    expect(result.grade).toMatchObject({ status: 'infra_failure', pass: false })
    expect(result.infrastructureFailure).toMatchObject({ kind: 'agent_failure', message: 'agent exploded' })
    expect(existsSync(join(rawRoot, result.rawLocator, 'failure.json'))).toBe(true)
  })
})

describe('real-run environment', () => {
  it('resolves preset dependencies from the complete pnpm module closure', () => {
    const repoRoot = resolve(import.meta.dirname, '../../../../..')
    const resolved = resolveWorkspaceSpecifier(repoRoot, '@deepseek-ai/cordis-plugin-include')
    expect(existsSync(resolved)).toBe(true)
    expect(resolved).toMatch(/vendor\/include\/lib\/index\.js$/u)
  })

  it('boots the source ToolRuntime with the scheduler symbol used by AgentLoop', async () => {
    await expect(verifyToolSchedulerIdentity()).resolves.toBe(true)
  })

  it('resolves explicit host paths and selects arm and fault compositions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'g25a-environment-'))
    const bin = join(root, 'bin')
    const config = join(root, 'config.yaml')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(bin))
    const maxc = join(bin, 'maxc')
    await writeFile(maxc, '#!/bin/sh\nexit 0\n')
    await chmod(maxc, 0o700)
    await writeFile(config, 'not read by the resolver\n')

    const environment = await resolveAttemptEnvironment({
      repoRoot: resolve(import.meta.dirname, '../../../../..'),
      arm: 'policy',
      faultMode: 'always_fail',
      env: { PATH: bin, MAXC_CONFIG: config, SECRET_VALUE: 'must-not-appear' },
    })
    expect(environment).toMatchObject({
      provider: 'aga',
      model: 'qwen3.7-max',
      scopeId: '10000251',
      maxcomputeProject: 'ieu_cdm',
      maxcPath: await realpath(maxc),
      maxcConfigPath: await realpath(config),
    })
    expect(environment.presetPath).toMatch(/presets\/policy\/agent\.cordis\.yml$/u)
    expect(environment.sidecarPath).toMatch(/fixtures\/fault-sidecar\.mjs$/u)
    expect(environment.environmentVariableNames).toEqual(['MAXC_CONFIG', 'PATH', 'SECRET_VALUE'])
    expect(JSON.stringify(environment)).not.toContain('must-not-appear')
  })

  it('rejects an implicit MaxCompute config before any Attempt starts', async () => {
    await expect(resolveAttemptEnvironment({
      repoRoot: resolve(import.meta.dirname, '../../../../..'),
      arm: 'state_machine',
      faultMode: 'none',
      env: { PATH: process.env.PATH },
    })).rejects.toThrow(/MAXC_CONFIG must name an explicit path/)
  })
})
