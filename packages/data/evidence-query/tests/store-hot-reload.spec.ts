import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { EvidenceQueryService, EvalResultStore, FileBackedEvalResultStore } from '../src/index.ts'

/**
 * Mount the semantic-grounding core under the `schema` seam the way the
 * `@deepseek-ai/dsh-semantic-layer` adapter's `apply()` does.
 *
 * The core takes its optional collaborators by setter, so `ctx.provide` alone
 * leaves the scope registry unwired and every scope lookup silently falls back
 * to the config root instead of resolving (or failing loud on) a named scope.
 * `audit` is passed through as-is — `undefined` is correct and keeps Tier-2
 * writes throwing (D5 / ADR-0001); never substitute a no-op recorder.
 */
function provideSchema(ctx: Context, config: ConstructorParameters<typeof SemanticLayerService>[0]): SemanticLayerService {
  const core = new SemanticLayerService(config)
  // Immediate set covers collaborators already present at mount time; the
  // nested `ctx.inject` fibers cover the ones a test provides afterwards, which
  // is how the adapter's `apply()` does it and what the pre-cutover Service got
  // for free by re-probing `ctx.get(...)` on every use.
  core.setScopeRegistry(ctx.get('scopes') as never)
  core.setTier2Recorder(ctx.get('audit'))
  ctx.inject(['scopes'], (scopeCtx: Context) => {
    scopeCtx.effect(() => {
      core.setScopeRegistry(scopeCtx.get('scopes') as never)
      return () => { core.setScopeRegistry(undefined) }
    })
  })
  ctx.inject(['audit'], (auditCtx: Context) => {
    auditCtx.effect(() => {
      core.setTier2Recorder(auditCtx.get('audit'))
      return () => { core.setTier2Recorder(undefined) }
    })
  })
  ctx.provide('schema', core)
  return core
}


const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach((d) =>{  rmSync(d, { recursive: true, force: true }) })
})

function seedLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reload-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: test\n  scope_id: test\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  writeFileSync(join(dir, 'tables', 'dws_order_di.yaml'), yaml.dump({
    table_name: 'dws_order_di', kind: 'dws', description: 'test',
    table_comment: '', domains: ['test'], granularity: '', engine: 'maxcompute',
    columns: [{ name: 'id', type: 'string', comment: '', role: 'dimension' }],
    metrics: {}, partitions: [],
    confirmation: { status: 'confirmed', confirmed_by: 'admin', confirmed_at: '2026-08-01' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: [], primary_key_unique: null, duplicate_sample: [],
    label_columns: [], freshness: '', dimension_refs: [],
  }))
  return dir
}

function makeResultsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'results-'))
  dirs.push(dir)
  return dir
}

describe('EvidenceQueryService config-based store', () => {
  it('constructs FileBackedEvalResultStore from resultsDir config', () => {
    const resultsDir = makeResultsDir()
    writeFileSync(join(resultsDir, 'run1.jsonl'), JSON.stringify({
      runId: 'run-1', timestamp: '2026-08-24T00:00:00Z', caseId: 'c1',
      outcome: 'correct', verdict: 'correct', passed: true, passK: 3,
      latencyMs: 100, attemptsCount: 1, errorsCount: 0,
    }) + '\n')

    const layerDir = seedLayer()
    const ctx = new Context()
    provideSchema(ctx, { semanticRoot: layerDir, scopeId: 'test' })
    const svc = new EvidenceQueryService(ctx, { resultsDir })

    const store = svc.getEvalStore()
    expect(store).toBeInstanceOf(FileBackedEvalResultStore)
    expect(store.getRunIds()).toContain('run-1')
  })

  it('refreshes store on evidence/eval-run-completed event', () => {
    const resultsDir = makeResultsDir()
    const layerDir = seedLayer()
    const ctx = new Context()
    provideSchema(ctx, { semanticRoot: layerDir, scopeId: 'test' })
    const svc = new EvidenceQueryService(ctx, { resultsDir })

    // Initially empty
    expect(svc.getEvalStore().getRunIds()).toHaveLength(0)

    // Simulate eval-runner persisting a JSONL file
    writeFileSync(join(resultsDir, 'run1.jsonl'), JSON.stringify({
      runId: 'run-1', timestamp: '2026-08-24T00:00:00Z', caseId: 'c1',
      outcome: 'correct', verdict: 'correct', passed: true, passK: 3,
      latencyMs: 100, attemptsCount: 1, errorsCount: 0,
    }) + '\n')

    // Emit the event
    ctx.emit('evidence/eval-run-completed')

    // Store should now contain the new run
    expect(svc.getEvalStore().getRunIds()).toContain('run-1')
  })

  it('falls back to empty EvalResultStore when no resultsDir configured', () => {
    const layerDir = seedLayer()
    const ctx = new Context()
    provideSchema(ctx, { semanticRoot: layerDir, scopeId: 'test' })
    const svc = new EvidenceQueryService(ctx, {})

    expect(svc.getEvalStore().getRunIds()).toHaveLength(0)
  })

  it('backward-compatible: still accepts EvalResultStore directly', () => {
    const store = new EvalResultStore()
    store.add({ id: 'e1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z' })

    const layerDir = seedLayer()
    const ctx = new Context()
    provideSchema(ctx, { semanticRoot: layerDir, scopeId: 'test' })
    const svc = new EvidenceQueryService(ctx, store)

    expect(svc.getEvalStore().query({}).total).toBe(1)
  })
})
