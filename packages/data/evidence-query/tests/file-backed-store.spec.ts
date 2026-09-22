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

  it('rejects an asset delta when persisted records lack a reliable mapping', () => {
    const resultsDir = makeTmpDir()
    writeJsonl(resultsDir, '2026-08-24T10-00-00-000Z_run-a.jsonl', runARecords)
    writeJsonl(resultsDir, '2026-08-25T10-00-00-000Z_run-b.jsonl', runBRecords)
    const store = new FileBackedEvalResultStore(resultsDir)
    const svc = makeServiceWithStore(store)

    expect(() => svc.beforeAfterDelta('run-a', 'run-b', { assetId: 'c1' }))
      .toThrow('asset filter unavailable')
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

describe('EvalResultStore asset filter mapping source', () => {
  it('applies asset filtering to records added with an explicit asset id', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'orders', caseId: 'case-1', status: 'pass', timestamp: '2026-09-18T00:00:00Z' })
    store.add({ id: 'r2', assetId: 'payments', caseId: 'case-2', status: 'fail', timestamp: '2026-09-18T00:01:00Z' })

    const result = store.query({ assetId: 'orders' })

    expect(result.assetFilterStatus).toBe('applied')
    expect(result.results.map(record => record.assetId)).toEqual(['orders'])
  })

  it('reports an applied asset filter even when later filters produce no records', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'orders', caseId: 'case-1', status: 'pass', timestamp: '2026-09-18T00:00:00Z' })

    const result = store.query({ assetId: 'orders', status: 'fail' })

    expect(result.assetFilterStatus).toBe('applied')
    expect(result.results).toEqual([])
  })

  it('does not treat persisted case ids as reliable asset ids', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-09-18T00-00-00-000Z_run-a.jsonl', runARecords)

    const store = new FileBackedEvalResultStore(dir)
    const result = store.query({ assetId: 'c1' })

    expect(result.assetFilterStatus).toBe('unavailable')
    expect(result.results).toHaveLength(runARecords.length)
    expect(store.hasResultsFor('c1')).toBe(false)
  })

  it('keeps history global when only part of the store has reliable asset ids', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-09-18T00-00-00-000Z_run-a.jsonl', runARecords)
    const store = new EvalResultStore()
    store.add({ id: 'explicit', assetId: 'orders', caseId: 'explicit-case', status: 'pass', timestamp: '2026-09-18T00:00:00Z' })
    store.loadFromDirectory(dir)

    const result = store.query({ assetId: 'orders' })

    expect(result.assetFilterStatus).toBe('unavailable')
    expect(result.results).toHaveLength(runARecords.length + 1)
  })

  it('filters persisted results when a case-to-asset resolver is available', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, '2026-09-18T00-00-00-000Z_run-a.jsonl', runARecords)

    const store = new FileBackedEvalResultStore(dir, caseId => caseId === 'c1' ? 'orders' : 'other')
    const result = store.query({ assetId: 'orders' })

    expect(result.assetFilterStatus).toBe('applied')
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.caseId).toBe('c1')
    expect(store.hasResultsFor('orders')).toBe(true)
  })
})
