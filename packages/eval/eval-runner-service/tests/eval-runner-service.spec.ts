/**
 * EvalRunnerService wiring tests.
 *
 - Unit: the W3→W4 JSONL bridge (RunResult → PersistedCaseRecord), the
   ctx.query adapters (QueryOutcome ↔ QueryResult / engine OdpsExecutor), and
   the Service mechanics (case discovery, delta, last/last-two tracking).
 - Integration: runBatch end-to-end with stubbed ctx.llm/ctx.query seams,
   driving the REAL Nl2sqlEngine, persisting JSONL, tracking runs.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Config as ConfigSchema, EvalRunnerService } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { FileBackedEvalResultStore } from '../../../data/evidence-query/src/index.ts'
import type { RunResult, RunnerVerdict } from '@deepseek-ai/dsh-eval-runner'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Build a minimal RunResult for bridge + tracking tests. */
function makeRun(runId: string, cases: Array<{ case_id: string; verdict: RunnerVerdict }>): RunResult {
  return {
    run_id: runId,
    timestamp: '2026-08-25T12:00:00.000Z',
    cases: cases.map(c => ({
      case_id: c.case_id,
      pass_k_results: [{ attempt_k: 1, execution_match: c.verdict === 'correct', delivery_match: c.verdict === 'correct' }],
      verdict: c.verdict,
      latency_ms: 100,
    })),
    summary: { total: cases.length, correct: 0, wrong: 0, declined: 0, unjudged: 0, infra_failure: 0, case_defect: 0, pass_rate: 0 },
  }
}

/** A stub LLM whose stream yields one text block "SELECT 1 AS total" for any
 *  prompt. Shared by the runBatch integration + D3ii explicit-scopeId specs. */
const REQUIRED_CONFIG: Config = {
  caseDir: 'packages/eval/eval/cases/k11-v2',
  passK: 3,
  concurrency: 2,
  maxInfraRetries: 2,
  provider: 'stub-provider',
  model: 'stub-model',
  today: '20260912',
  columnSemantics: 'by-name',
  maxStoredRows: 200,
}

/** Build a complete service config while letting one test override the relevant field. */
function serviceConfig(overrides: Partial<Config> = {}): Config {
  return Object.assign({}, REQUIRED_CONFIG, overrides)
}

function makeStubLlm() {
  const stream = async function* () {
    yield { type: 'block-start' as const, index: 0, blockType: 'text' as const }
    yield { type: 'text-delta' as const, index: 0, text: 'SELECT 1 AS total' }
    yield { type: 'block-end' as const, index: 0, block: { type: 'text' as const, text: 'SELECT 1 AS total' } }
    yield { type: 'finish' as const, reason: 'stop' as const }
  }
  return { stream }
}

/** Build a stub query provider and optionally capture routed scope ids. */
function makeStubQuery(capturedScopeIds?: string[]) {
  return {
    execute: async (req?: unknown) => {
      if (capturedScopeIds !== undefined && req !== undefined && typeof req === 'object' && 'scopeId' in (req as Record<string, unknown>)) {
        capturedScopeIds.push((req as { scopeId: string }).scopeId)
      }
      return { state: 'completed' as const, columns: ['total'], rows: [[1]], rowCount: 1, sql: '' }
    },
    attach: async () => ({ state: 'completed' as const, columns: ['total'], rows: [[1]], rowCount: 1, sql: '' }),
  }
}

describe('EvalRunnerService — mechanics', () => {
  it('validates required run policy through the Cordis Config schema', () => {
    expect(() => ConfigSchema(Object.assign({}, REQUIRED_CONFIG, { today: undefined }) as unknown as Config)).toThrow(/today/)
    expect(() => ConfigSchema(serviceConfig({ today: '2026-09-12' }))).toThrow(/today/)
    expect(() => ConfigSchema(serviceConfig({ columnSemantics: 'unknown' as never }))).toThrow(/columnSemantics/)
    expect(() => ConfigSchema(serviceConfig({ maxStoredRows: 0 }))).toThrow(/maxStoredRows/)
    expect(ConfigSchema(serviceConfig())).toMatchObject({
      resultsDir: '.tmp/eval-results',
      caseDir: 'packages/eval/eval/cases/k11-v2',
      passK: 3,
      concurrency: 2,
      maxInfraRetries: 2,
      today: '20260912',
      columnSemantics: 'by-name',
      maxStoredRows: 200,
    })
  })

  it('getCaseCount discovers the shipped k11-v2 naming convention', () => {
    const svc = new EvalRunnerService(new Context(), serviceConfig())
    expect(svc.getCaseCount()).toBe(168)
  })

  it('getCaseCount discovers archived K11 cases when caseDir points at that set', () => {
    // Cases were archived to _archived/k11-v1 during the k11→k11-v2 migration;
    // the v1 files still match the Service's `/^k11_\d+\.yaml$/` filter (161 of
    // them; the 162nd entry, coverage-matrix.yaml, is excluded by the regex).
    const svc = new EvalRunnerService(new Context(), serviceConfig({ caseDir: 'packages/eval/eval/cases/_archived/k11-v1' }))
    expect(svc.getCaseCount()).toBe(161)
  })

  it('rejects invalid executor attribution config at construction', () => {
    expect(() => new EvalRunnerService(new Context(), serviceConfig({ executorIdentity: '   ' }))).toThrow(
      /executorIdentity/,
    )
    expect(() => new EvalRunnerService(new Context(), serviceConfig({ queryWaitSeconds: 0 }))).toThrow(
      /queryWaitSeconds/,
    )
  })

  it('getResultsDir returns the configured dir', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ers-'))
    try {
      const svc = new EvalRunnerService(new Context(), serviceConfig({ resultsDir: tmp }))
      expect(svc.getResultsDir()).toBe(tmp)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('computeDelta delegates to compareDelta', () => {
    const svc = new EvalRunnerService(new Context(), serviceConfig())
    const a = makeRun('run-a', [{ case_id: 'c1', verdict: 'wrong' }])
    const b = makeRun('run-b', [{ case_id: 'c1', verdict: 'correct' }])
    const d = svc.computeDelta(a, b)
    expect(d.run_a_id).toBe('run-a')
    expect(d.run_b_id).toBe('run-b')
    expect(d.summary.improved).toBe(1)
    expect(d.flips[0]?.case_id).toBe('c1')
  })

  it('getLastRun tracks across runs (via stubbed runBatch)', async () => {
    // runBatch with no cases throws — so point at a tiny temp fixture. But the
    // real engine needs ctx.llm; that path is integration-tested below. Here
    // we only assert the initial state.
    const svc = new EvalRunnerService(new Context(), serviceConfig())
    expect(svc.getLastRun()).toBeNull()
  })
})

describe('EvalRunnerService — runBatch integration (stubbed seams, real engine)', () => {
  it('runs a provenance-bearing case through service persistence and the file-backed store', async () => {
    const resultsDir = mkdtempSync(join(tmpdir(), 'ers-results-'))
    const ctx = new Context()
    const capturedScopeIds: string[] = []
    // Provide stubbed external seams the Service reads via ctx.get.
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', makeStubQuery(capturedScopeIds))

    // A tiny provenance-bearing case keeps this integration focused on the
    // service → JSONL → FileBackedEvalResultStore path.
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-cases-'))
    try {
      writeFileSync(join(tmpCases, 'k11_001.yaml'), [
        'schema_version: 3',
        'case_id: k11_001',
        'input:',
        '  question: How many?',
        '  scope_id: scope-a',
        '  turns: []',
        'expected:',
        "  sql: SELECT 1 WHERE ds = '{{ds_yesterday}}'",
        '  result_value: { value: 1 }',
        '  match_mode: scalar_exact',
        '  answer: null',
        '  delivery_match: null',
        'dimensions:',
        '  query_intent: metric_lookup',
        'meta:',
        '  anchor_ds: "20260912"',
        '  tier: verified',
        '  provenance: human-reference',
        '',
      ].join('\n'))
      const svc = new EvalRunnerService(ctx, serviceConfig({ caseDir: tmpCases, resultsDir, passK: 1, executorIdentity: 'query-provider:test', queryWaitSeconds: 60, columnSemantics: 'positional', maxStoredRows: 17 }))
      const result = await svc.runBatch({ skipHealthGate: true, scopeId: 'scope-a' })
      expect(result.cases.length).toBe(1)
      expect(result.summary.total).toBe(1)
      expect(svc.getLastRun()).toBe(result)

      // JSONL persisted in the FileBackedEvalResultStore record format
      const jsonlFiles = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f: string) => f.endsWith('.jsonl')) : []
      expect(jsonlFiles.length).toBe(1)
      const lines = readFileSync(join(resultsDir, jsonlFiles[0] as string), 'utf8').trim().split('\n')
      expect(lines.length).toBe(1)
      const rec = JSON.parse(lines[0]!) as Record<string, unknown>
      expect(rec).toHaveProperty('runId')
      expect(rec).toHaveProperty('caseId')
      expect(rec).toHaveProperty('outcome')
      expect(rec).toHaveProperty('passed')
      expect(rec).toMatchObject({
        runConfig: {
          today: '20260912',
          column_semantics: 'positional',
          max_stored_rows: 17,
          query_wait_seconds: 60,
        },
      })
      expect(rec).toHaveProperty('passK')
      expect(rec).toMatchObject({
        recordVersion: 2,
        runConfig: { executor_identity: 'query-provider:test' },
        preflight: {
          content: { status: 'passed' },
          reference_sql: { status: 'passed', stage: 'comparison' },
        },
        attempts: [{
          execution_outcome: 'pass',
          execution_artifact: { kind: 'completed' },
        }],
        caseProvenance: {
          schemaVersion: 3,
          scopeId: 'scope-a',
          expected: { match_mode: 'scalar_exact' },
          meta: { anchor_ds: '20260912', tier: 'verified', provenance: 'human-reference' },
          referenceSql: {
            kind: 'resolved',
            sql: "SELECT 1 WHERE ds = '20260911'",
            substitutions: { ds_yesterday: '20260911' },
          },
        },
      })

      const stored = new FileBackedEvalResultStore(resultsDir).query({}).results[0]!
      expect(stored.metadata).toMatchObject({
        recordVersion: 2,
        runConfig: { executor_identity: 'query-provider:test' },
        attempts: [{ execution_artifact: { kind: 'completed' } }],
        preflight: { content: { status: 'passed' }, reference_sql: { status: 'passed' } },
        caseProvenance: { meta: { provenance: 'human-reference' } },
      })
      expect(JSON.stringify(stored.metadata)).toContain('normalizedDigest')

      // Phase 5d (D3ii): scopeId propagated from runBatch → buildCollaborators
      // → CtxOdpsAdapter/CtxQueryExecutor → ctx.query.execute({scopeId}).
      // Best-effort: the engine may decline without executing SQL (empty
      // corpus → no candidate tables), so capturedScopeIds may be empty;
      // when non-empty, every captured scopeId must equal the explicit scope
      // passed to runBatch (no silent fallback to a different/hardcoded scope).
      expect(capturedScopeIds.every(id => id === 'scope-a')).toBe(true)
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
      rmSync(resultsDir, { recursive: true, force: true })
    }
  }, 60_000)
  it('persists preflight diagnostics when failures stop before candidate attempts', async () => {
    const resultsDir = mkdtempSync(join(tmpdir(), 'ers-preflight-results-'))
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-preflight-cases-'))
    const ctx = new Context()
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', {
      execute: async () => ({
        state: 'failed' as const,
        error: 'warehouse connection reset',
        failureKind: 'transport',
      }),
    })

    try {
      writeFileSync(join(tmpCases, 'k11_001.yaml'), [
        'case_id: k11_001',
        'input: { question: Broken case, scope_id: scope-a, turns: [] }',
        'expected:',
        '  result_value: { value: 1 }',
        '  match_mode: null',
        '  answer: null',
        '  delivery_match: null',
        'dimensions: {}',
        '',
      ].join('\n'))
      writeFileSync(join(tmpCases, 'k11_002.yaml'), [
        'case_id: k11_002',
        'input: { question: Blocked reference, scope_id: scope-a, turns: [] }',
        'expected:',
        '  sql: SELECT 1 AS value',
        '  result_value: { value: 1 }',
        '  match_mode: scalar_exact',
        '  answer: null',
        '  delivery_match: null',
        'dimensions: {}',
        '',
      ].join('\n'))
      const svc = new EvalRunnerService(ctx, serviceConfig({
        caseDir: tmpCases,
        resultsDir,
        passK: 1,
        executorIdentity: 'query-provider:test',
        queryWaitSeconds: 60,
      }))

      const result = await svc.runBatch({ skipHealthGate: true, scopeId: 'scope-a' })
      expect(result.cases).toMatchObject([
        {
          case_id: 'k11_001',
          verdict: 'case_defect',
          pass_k_results: [],
          preflight: { content: { status: 'case-defect' } },
        },
        {
          case_id: 'k11_002',
          verdict: 'infra_failure',
          pass_k_results: [],
          preflight: {
            content: { status: 'passed' },
            reference_sql: {
              status: 'environment-blocked',
              stage: 'execution',
              execution_artifact: { kind: 'failed', failureKind: 'transport' },
            },
          },
        },
      ])

      const file = readdirSync(resultsDir).find(name => name.endsWith('.jsonl'))
      expect(file).toBeDefined()
      const persisted = readFileSync(join(resultsDir, file!), 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
      expect(persisted).toMatchObject([
        {
          caseId: 'k11_001',
          verdict: 'case_defect',
          attemptsCount: 0,
          attempts: [],
          preflight: { content: { status: 'case-defect' } },
        },
        {
          caseId: 'k11_002',
          verdict: 'infra_failure',
          attemptsCount: 0,
          attempts: [],
          preflight: { reference_sql: { status: 'environment-blocked', execution_artifact: { failureKind: 'transport' } } },
        },
      ])

      const stored = new FileBackedEvalResultStore(resultsDir).query({}).results
      expect(stored.map(record => record.metadata)).toMatchObject([
        { preflight: { content: { status: 'case-defect' } }, attempts: [] },
        { preflight: { reference_sql: { status: 'environment-blocked' } }, attempts: [] },
      ])
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
      rmSync(resultsDir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('EvalRunnerService — Phase 5d (D3ii): runBatch explicit scopeId', () => {
  it('runBatch without scopeId throws the D3ii no-default-pointer error (before any case runs)', async () => {
    const ctx = new Context()
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-cases-d3ii-'))
    try {
      const realCases = ['k11_001.yaml'].map(f => `packages/eval/eval/cases/_archived/k11-v1/${f}`)
      for (const p of realCases) {
        copyFileSync(p, join(tmpCases, p.split('/').pop()!))
      }
      const svc = new EvalRunnerService(ctx, serviceConfig({ caseDir: tmpCases, passK: 1 }))
      // No scopeId → D3ii fail-loud (no silent 'k11' fallback).
      await expect(svc.runBatch({ skipHealthGate: true })).rejects.toThrow(
        'eval-runner-service runBatch: explicit scopeId required (D3ii: no default pointer)',
      )
      // No JSONL persisted (threw before runBatch executed)
      expect(svc.getLastRun()).toBeNull()
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
    }
  })

  it('fails loud when a real query provider has no configured executor identity', async () => {
    const ctx = new Context()
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', makeStubQuery())
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-cases-executor-id-'))
    try {
      copyFileSync('packages/eval/eval/cases/_archived/k11-v1/k11_001.yaml', join(tmpCases, 'k11_001.yaml'))
      const svc = new EvalRunnerService(ctx, serviceConfig({
        caseDir: tmpCases,
        passK: 1,
      }))

      await expect(svc.runBatch({ skipHealthGate: true, scopeId: 'k11' })).rejects.toThrow(
        'executorIdentity is required when ctx.query is mounted',
      )
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
    }
  })

  it('fails loud when a real query provider has no configured query wait', async () => {
    const ctx = new Context()
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', makeStubQuery())
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-cases-query-wait-'))
    try {
      copyFileSync('packages/eval/eval/cases/_archived/k11-v1/k11_001.yaml', join(tmpCases, 'k11_001.yaml'))
      const svc = new EvalRunnerService(ctx, serviceConfig({
        caseDir: tmpCases,
        passK: 1,
        executorIdentity: 'query-provider:test',
      }))

      await expect(svc.runBatch({ skipHealthGate: true, scopeId: 'k11' })).rejects.toThrow(
        'queryWaitSeconds is required when ctx.query is mounted',
      )
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
    }
  })

  it('runBatch with explicit scopeId succeeds (no silent fallback, no throw)', async () => {
    const ctx = new Context()
    const capturedScopeIds: string[] = []
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('llm', makeStubLlm())
    ;(ctx as unknown as { provide: (k: string, v: unknown) => void }).provide('query', {
      execute: async (req?: unknown) => {
        if (req !== undefined && typeof req === 'object' && 'scopeId' in (req as Record<string, unknown>)) {
          capturedScopeIds.push((req as { scopeId: string }).scopeId)
        }
        return { state: 'completed' as const, columns: ['total'], rows: [[1]], rowCount: 1, sql: '' }
      },
      attach: async () => ({ state: 'completed' as const, columns: ['total'], rows: [[1]], rowCount: 1, sql: '' }),
    })
    const tmpCases = mkdtempSync(join(tmpdir(), 'ers-cases-d3ii-ok-'))
    const resultsDir = mkdtempSync(join(tmpdir(), 'ers-results-d3ii-ok-'))
    try {
      const realCases = ['k11_001.yaml'].map(f => `packages/eval/eval/cases/_archived/k11-v1/${f}`)
      for (const p of realCases) {
        copyFileSync(p, join(tmpCases, p.split('/').pop()!))
      }
      const svc = new EvalRunnerService(ctx, serviceConfig({ caseDir: tmpCases, resultsDir, passK: 1, executorIdentity: 'query-provider:test', queryWaitSeconds: 60 }))
      const result = await svc.runBatch({ skipHealthGate: true, scopeId: 'k11' })
      expect(result.cases.length).toBe(1)
      expect(svc.getLastRun()).toBe(result)
      // Propagation: any execute calls used the 'k11' scopeId (best-effort —
      // the engine may decline without executing on the empty-corpus stub).
      expect(capturedScopeIds.every(id => id === 'k11')).toBe(true)
    } finally {
      rmSync(tmpCases, { recursive: true, force: true })
      rmSync(resultsDir, { recursive: true, force: true })
    }
  }, 60_000)
})
