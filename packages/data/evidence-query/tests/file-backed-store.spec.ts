import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { EvalResultStore, FileBackedEvalResultStore, EvidenceQueryService } from '../src/index.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach((d) =>{  rmSync(d, { recursive: true, force: true }) })
})

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eq-fb-'))
  dirs.push(dir)
  return dir
}

function writeJsonl(dir: string, filename: string, records: object[]): void {
  writeFileSync(join(dir, filename), records.map(r => JSON.stringify(r)).join('\n') + '\n')
}

const runARecords = [
  { runId: 'run-a', timestamp: '2026-08-24T10:00:00.000Z', caseId: 'c1', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
  { runId: 'run-a', timestamp: '2026-08-24T10:00:00.000Z', caseId: 'c2', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
  { runId: 'run-a', timestamp: '2026-08-24T10:00:00.000Z', caseId: 'c3', outcome: 'unjudged', verdict: null, passed: false, passK: 3, latencyMs: 50, attemptsCount: 3, errorsCount: 3 },
]

const runBRecords = [
  { runId: 'run-b', timestamp: '2026-08-25T10:00:00.000Z', caseId: 'c1', outcome: 'wrong', verdict: 'fail', passed: false, passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0 },
  { runId: 'run-b', timestamp: '2026-08-25T10:00:00.000Z', caseId: 'c2', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 200, attemptsCount: 3, errorsCount: 0 },
  { runId: 'run-b', timestamp: '2026-08-25T10:00:00.000Z', caseId: 'c3', outcome: 'correct', verdict: 'pass', passed: true, passK: 3, latencyMs: 80, attemptsCount: 3, errorsCount: 0 },
]

function versionedRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordVersion: 2,
    runId: 'run-v2',
    timestamp: '2026-09-12T00:00:00.000Z',
    caseId: 'c0',
    outcome: 'correct',
    verdict: 'correct',
    passed: true,
    passK: 1,
    latencyMs: 10,
    attemptsCount: 1,
    errorsCount: 0,
    runConfig: {
      provider: 'stub-provider',
      model: 'stub-model',
      pass_k: 1,
      concurrency: 1,
      sql_judge: false,
      verdict_semantics: 'pass^k',
      responder: 'engine',
      scope_id: 'scope-a',
      today: '20260912',
      query_expansion: false,
      with_query: true,
      executor_identity: 'query-provider:test',
      comparator_policy_version: 2,
      column_semantics: 'by-name',
      max_stored_rows: 200,
      query_wait_seconds: 60,
      skip_health_gate: true,
    },
    attempts: [{
      attempt_k: 1,
      execution_outcome: 'pass',
      execution_detail: 'matched',
      execution_artifact: {
        kind: 'completed',
        sql: 'SELECT 1',
        columns: ['value'],
        rows: [{ value: 1 }],
        rawRows: [[1]],
        rowCount: 1,
        rowsStored: 1,
        providerTruncated: false,
        storageTruncated: false,
        instanceId: null,
        failureKind: null,
        failureClass: null,
        error: null,
        durationMs: 1,
        rawDigest: 'raw-digest',
        normalizedDigest: 'normalized-digest',
        columnSemantics: 'by-name',
      },
      generated_sql: 'SELECT 1',
      expected_result: { value: 1 },
    }],
    preflight: {
      content: { status: 'passed' },
      reference_sql: { status: 'absent', detail: 'case declares no reference SQL' },
    },
    caseProvenance: {
      sourcePath: '/cases/c0.yaml',
      schemaVersion: 3,
      scopeId: 'scope-a',
      expected: { result_value: { value: 1 }, match_mode: 'scalar_exact' },
      meta: { tier: 'verified', provenance: 'human-reference' },
      referenceSql: { kind: 'absent' },
    },
    ...overrides,
  }
}

describe('EvalResultStore.loadFromDirectory', () => {
  it('loads JSONL files and maps to EvalResultRecords', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    const result = store.query({})

    expect(result.total).toBe(3)
    expect(result.results[0]!.caseId).toBe('c1')
    expect(result.results[0]!.status).toBe('pass')
    expect(result.results[1]!.status).toBe('fail')
    expect(result.results[2]!.status).toBe('error') // unjudged → error
  })

  it('maps every runner verdict explicitly and retains versioned replay evidence', () => {
    const dir = makeTmpDir()
    const verdicts = ['correct', 'wrong', 'declined', 'unjudged', 'infra_failure', 'case_defect'] as const
    writeJsonl(dir, '2026-09-12T00-00-00-000Z_run-v2.jsonl', verdicts.map((verdict, index) => versionedRecord({
      caseId: `c${index}`,
      outcome: verdict,
      verdict,
      passed: verdict === 'correct',
      attempts: [{
        ...(versionedRecord().attempts as readonly Record<string, unknown>[])[0],
        execution_outcome: verdict === 'case_defect' ? 'case-defect' : 'not-measured',
        execution_detail: verdict,
      }],
      caseProvenance: {
        ...(versionedRecord().caseProvenance as Record<string, unknown>),
        sourcePath: `/cases/c${index}.yaml`,
      },
    })))

    const store = new FileBackedEvalResultStore(dir)
    const records = store.query({}).results

    expect(records.map(record => record.status)).toEqual(['pass', 'fail', 'fail', 'error', 'error', 'error'])
    expect(records[5]!.metadata).toMatchObject({
      recordVersion: 2,
      verdict: 'case_defect',
      runConfig: { executor_identity: 'query-provider:test' },
      attempts: [{ execution_outcome: 'case-defect', execution_artifact: { normalizedDigest: 'normalized-digest' } }],
      preflight: { content: { status: 'passed' }, reference_sql: { status: 'absent' } },
      caseProvenance: { schemaVersion: 3, meta: { provenance: 'human-reference' } },
    })
  })

  it('preserves an unknown match mode on a versioned case-defect record', () => {
    const dir = makeTmpDir()
    const record = versionedRecord({
      outcome: 'case_defect',
      verdict: 'case_defect',
      passed: false,
      attempts: [],
      attemptsCount: 0,
      preflight: { content: { status: 'case-defect', detail: 'unknown match_mode: typo' } },
      caseProvenance: {
        ...(versionedRecord().caseProvenance as Record<string, unknown>),
        expected: { result_value: { value: 1 }, match_mode: 'typo' },
      },
    })
    writeJsonl(dir, 'case-defect.jsonl', [record])

    const [loaded] = new FileBackedEvalResultStore(dir).query({}).results
    expect(loaded?.status).toBe('error')
    expect(loaded?.metadata).toMatchObject({
      verdict: 'case_defect',
      caseProvenance: { expected: { match_mode: 'typo' } },
    })
  })

  it.each([
    ['an unknown verdict', { verdict: 'mystery' }],
    ['a malformed run config', { runConfig: { ...(versionedRecord().runConfig as Record<string, unknown>), max_stored_rows: '200' } }],
    ['a malformed execution artifact', { attempts: [{ attempt_k: 1, execution_outcome: 'pass', execution_artifact: { kind: 'completed' } }] }],
    ['malformed preflight evidence', { preflight: { content: { status: 'passed' }, reference_sql: { status: 'passed' } } }],
  ])('fails loud for %s in a versioned record', (_label, override) => {
    const dir = makeTmpDir()
    writeJsonl(dir, 'invalid.jsonl', [versionedRecord(override)])

    expect(() => new FileBackedEvalResultStore(dir)).toThrow(/invalid record .*invalid\.jsonl/)
  })

  it('uses caseAssetResolver to map caseId → assetId', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const resolver = (caseId: string) => `asset_${caseId}`
    const store = new EvalResultStore()
    store.loadFromDirectory(dir, resolver)
    const result = store.query({})

    expect(result.results[0]!.assetId).toBe('asset_c1')
    expect(result.results[1]!.assetId).toBe('asset_c2')
  })

  it('defaults assetId to caseId when no resolver provided', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    const result = store.query({})

    expect(result.results[0]!.assetId).toBe('c1')
  })

  it('loads multiple JSONL files', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)
    writeJsonl(dir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    const result = store.query({})

    expect(result.total).toBe(6)
  })

  it('returns empty when directory does not exist', () => {
    const store = new EvalResultStore()
    store.loadFromDirectory('/nonexistent/path')
    expect(store.query({}).total).toBe(0)
  })

  it('stores runId in metadata for getByRunId queries', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)
    writeJsonl(dir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)

    const runAResults = store.getByRunId('run-a')
    expect(runAResults).toHaveLength(3)
    expect(runAResults.every(r => (r.metadata as Record<string, unknown>)?.runId === 'run-a')).toBe(true)

    const runBResults = store.getByRunId('run-b')
    expect(runBResults).toHaveLength(3)
  })

  it('getRunIds returns all distinct run IDs', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)
    writeJsonl(dir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)

    const runIds = store.getRunIds()
    expect(runIds.sort()).toEqual(['run-a', 'run-b'])
  })
})

describe('EvidenceQueryService.beforeAfterDelta', () => {
  function seedMinimalLayer(): string {
    const dir = makeTmpDir()
    writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: test\n  scope_id: test\n')
    mkdirSync(join(dir, 'tables'), { recursive: true })
    writeFileSync(join(dir, 'tables', 'dws_order_di.yaml'), yaml.dump({
      table_name: 'dws_order_di', kind: 'dws', description: 'test',
      table_comment: '', domains: ['test'], granularity: '', engine: 'maxcompute',
      columns: [{ name: 'id', type: 'string', comment: '', role: 'dimension' }],
      metrics: {}, partitions: [],
      confirmation: { status: 'confirmed', confirmed_by: '', confirmed_at: '' },
      coverage: null, supersedes: [], disambiguation: null,
      primary_key: [], primary_key_unique: null, duplicate_sample: [],
      label_columns: [], freshness: '', dimension_refs: [],
    }))
    return dir
  }

  function makeServiceWithStore(store: EvalResultStore): EvidenceQueryService {
    const layerDir = seedMinimalLayer()
    const ctx = new Context()
    new SemanticLayerService(ctx, { semanticRoot: layerDir, scopeId: 'test' })
    return new EvidenceQueryService(ctx, store)
  }

  it('detects flips between two runs', () => {
    const resultsDir = makeTmpDir()
    writeJsonl(resultsDir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)
    writeJsonl(resultsDir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(resultsDir)
    const svc = makeServiceWithStore(store)

    const delta = svc.beforeAfterDelta('run-a', 'run-b')
    expect(delta.runIdA).toBe('run-a')
    expect(delta.runIdB).toBe('run-b')
    // c1: pass→fail (regressed), c2: fail→pass (improved), c3: error→pass (improved)
    expect(delta.flipped).toHaveLength(3)
    expect(delta.summary.improved).toBe(2)
    expect(delta.summary.regressed).toBe(1)
    expect(delta.summary.unchanged).toBe(0)
  })

  it('returns empty delta when runs are identical', () => {
    const resultsDir = makeTmpDir()
    writeJsonl(resultsDir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new EvalResultStore()
    store.loadFromDirectory(resultsDir)
    const svc = makeServiceWithStore(store)

    const delta = svc.beforeAfterDelta('run-a', 'run-a')
    expect(delta.flipped).toHaveLength(0)
    expect(delta.summary.unchanged).toBe(3)
  })

  it('returns empty delta when runId does not exist', () => {
    const store = new EvalResultStore()
    const svc = makeServiceWithStore(store)

    const delta = svc.beforeAfterDelta('nonexistent-a', 'nonexistent-b')
    expect(delta.flipped).toHaveLength(0)
    expect(delta.summary.unchanged).toBe(0)
  })
})

describe('FileBackedEvalResultStore', () => {
  it('auto-loads on construction', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new FileBackedEvalResultStore(dir)
    expect(store.query({}).total).toBe(3)
  })

  it('refresh() re-reads directory', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new FileBackedEvalResultStore(dir)
    expect(store.query({}).total).toBe(3)

    // Add a second file
    writeJsonl(dir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)
    store.refresh()
    expect(store.query({}).total).toBe(6)
  })

  it('applies caseAssetResolver', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)

    const store = new FileBackedEvalResultStore(dir, caseId => `table_${caseId}`)
    expect(store.query({}).results[0]!.assetId).toBe('table_c1')
  })

  it('handles empty directory', () => {
    const dir = makeTmpDir()
    const store = new FileBackedEvalResultStore(dir)
    expect(store.query({}).total).toBe(0)
  })
})
