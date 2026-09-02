/**
 * GA-GT1 Phase 3b (D5.2) — evidence-query per-scope cascade tests.
 *
 * Covers:
 *  (a) EvalResultRecord scopeId passthrough + query filters by scopeId
 *      (scopeId hit / miss / no-filter returns all).
 *  (b) per-scope resultsDir subdirectory loading (`<dir>/<scopeId>/*.jsonl`
 *      records tagged with the subdirectory scopeId) + flat-layout backward
 *      compatibility + mixed flat+per-scope in the same dir.
 *  (c) EvidenceQueryService read methods scopeId → resolveRoot resolves the
 *      correct scope's root when a multi-scope registry is mounted (active =
 *      the OTHER scope — proves scopeId overrides active, not the reverse);
 *      scopeId undefined → active scope (backward-compatible); registry
 *      unmounted + scopeId provided → cfg-root fallback (no throw).
 *  (d) scopeId provided + registry mounted + scope not found → throws
 *      (fail-loud: refuse silent fallback to prevent cross-scope leak).
 *
 * Mounts a minimal fake scope-registry under the 'scopes' name (the same
 * structural shape `get(id)`/`active()`/`activeId()` the Service probes via
 * `ctx.get('scopes')`), sidestepping the real ScopeRegistryService + its
 * scopes.yaml persistence — same pattern as query-maxcompute's per-scope tests.
 *
 * Run: pnpm vitest run packages/data/evidence-query/tests/per-scope.spec.ts
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { EvidenceQueryService, EvalResultStore, FileBackedEvalResultStore } from '../src/index.ts'
import type { EvalResultRecord } from '../src/types.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true }))
})

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eq-ps-'))
  dirs.push(dir)
  return dir
}

function writeJsonl(dir: string, filename: string, records: object[]): void {
  writeFileSync(join(dir, filename), records.map(r => JSON.stringify(r)).join('\n') + '\n')
}

const caseRecord = (caseId: string, outcome = 'correct') => ({
  runId: 'run-1', timestamp: '2026-08-24T10:00:00.000Z', caseId,
  outcome, verdict: outcome === 'correct' ? 'pass' : 'fail', passed: outcome === 'correct',
  passK: 3, latencyMs: 100, attemptsCount: 3, errorsCount: 0,
})

// ── FakeScopeRegistry (mounts under the 'scopes' name) ───────────────────

/**
 * Minimal scope-registry mounted under the 'scopes' name — the structural
 * shape (`get(id)` / `active()` / `activeId()` returning `{ id, semanticRoot }`)
 * that SemanticLayerService + EvidenceQueryService probe via `ctx.get('scopes')`.
 */
class FakeScopeRegistry extends Service {
  private readonly scopes = new Map<string, { id: string; semanticRoot: string }>()
  private activeIdVal: string | undefined

  constructor(ctx: Context) { super(ctx, 'scopes') }

  register(def: { id: string; semanticRoot: string }): void {
    this.scopes.set(def.id, { id: def.id, semanticRoot: def.semanticRoot })
    if (this.activeIdVal === undefined) this.activeIdVal = def.id
  }
  setActive(id: string): void { this.activeIdVal = id }
  get(id: string): { id: string; semanticRoot: string } | undefined { return this.scopes.get(id) }
  active(): { id: string; semanticRoot: string } | undefined {
    return this.activeIdVal === undefined ? undefined : this.scopes.get(this.activeIdVal)
  }
  activeId(): string | undefined { return this.activeIdVal }
}

// ── Semantic-layer seed helpers ──────────────────────────────────────────

function tableYaml(tableName: string, domain = 'test'): string {
  return yaml.dump({
    table_name: tableName, kind: 'dim', description: `table ${tableName}`,
    table_comment: '', domains: [domain], granularity: '', engine: 'maxcompute',
    columns: [{ name: 'id', type: 'string', comment: '', role: 'dimension' }],
    metrics: {}, partitions: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: ['id'], primary_key_unique: null, duplicate_sample: [],
    label_columns: ['id'], freshness: '', dimension_refs: [],
  })
}

/** Seed a semantic-layer scope dir with the given table names. */
function seedScopeDir(scopeId: string, tableNames: string[]): string {
  const dir = makeTmpDir()
  writeFileSync(join(dir, 'config.yaml'), `project:\n  name: ${scopeId}\n  scope_id: ${scopeId}\n`)
  mkdirSync(join(dir, 'tables'), { recursive: true })
  for (const name of tableNames) {
    writeFileSync(join(dir, 'tables', `${name}.yaml`), tableYaml(name, scopeId))
  }
  return dir
}

/** A context + fake multi-scope registry (scope-A with 2 tables, scope-B with 1 table). */
function setupMultiScope(): { ctx: Context; scopes: FakeScopeRegistry; rootA: string; rootB: string } {
  const ctx = new Context()
  const scopes = new FakeScopeRegistry(ctx)
  const rootA = seedScopeDir('scope-A', ['tbl_a1', 'tbl_a2'])
  const rootB = seedScopeDir('scope-B', ['tbl_b1'])
  scopes.register({ id: 'scope-A', semanticRoot: rootA })
  scopes.register({ id: 'scope-B', semanticRoot: rootB })
  // active = scope-A (first registered) — scopeId must override it to reach scope-B
  return { ctx, scopes, rootA, rootB }
}

/** A context with NO scope-registry mounted (the unmounted-fallback test). */
function setupUnmounted(): { ctx: Context; root: string } {
  const ctx = new Context()
  const root = seedScopeDir('cfg-scope', ['tbl_cfg'])
  return { ctx, root }
}

// ── (a) EvalResultRecord scopeId passthrough + query filters ────────────

describe('GA-GT1 Phase 3b — EvalResultStore scopeId (D5.2)', () => {
  it('passes scopeId through add → query (scopeId hit)', () => {
    const store = new EvalResultStore()
    const recA: EvalResultRecord = { id: 'r1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-A' }
    const recB: EvalResultRecord = { id: 'r2', assetId: 'a2', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-B' }
    const recNoScope: EvalResultRecord = { id: 'r3', assetId: 'a3', caseId: 'c3', status: 'pass', timestamp: '2026-08-24T00:00:00Z' }
    store.add(recA)
    store.add(recB)
    store.add(recNoScope)

    // scopeId hit — only scope-A records
    const hitA = store.query({ scopeId: 'scope-A' })
    expect(hitA.total).toBe(1)
    expect(hitA.results[0]!.scopeId).toBe('scope-A')
    expect(hitA.results[0]!.id).toBe('r1')

    // scopeId miss — no records match
    const miss = store.query({ scopeId: 'nonexistent' })
    expect(miss.total).toBe(0)
  })

  it('no scopeId filter returns all records (including those without scopeId)', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'a1', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-A' })
    store.add({ id: 'r2', assetId: 'a2', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z' })
    store.add({ id: 'r3', assetId: 'a3', caseId: 'c3', status: 'pass', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-B' })

    const all = store.query({})
    expect(all.total).toBe(3)
  })

  it('scopeId filter combines with other filters (assetId + scopeId)', () => {
    const store = new EvalResultStore()
    store.add({ id: 'r1', assetId: 'shared', caseId: 'c1', status: 'pass', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-A' })
    store.add({ id: 'r2', assetId: 'shared', caseId: 'c2', status: 'fail', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-B' })
    store.add({ id: 'r3', assetId: 'other', caseId: 'c3', status: 'pass', timestamp: '2026-08-24T00:00:00Z', scopeId: 'scope-A' })

    // assetId=shared + scopeId=scope-A → only r1
    const result = store.query({ assetId: 'shared', scopeId: 'scope-A' })
    expect(result.total).toBe(1)
    expect(result.results[0]!.id).toBe('r1')
  })
})

// ── (b) per-scope resultsDir subdirectory loading ────────────────────────

describe('GA-GT1 Phase 3b — EvalResultStore.loadFromDirectory per-scope subdirectories (D5.2)', () => {
  it('loads <dir>/<scopeId>/*.jsonl and tags records with the subdirectory scopeId', () => {
    const dir = makeTmpDir()
    mkdirSync(join(dir, 'scope-A'), { recursive: true })
    writeJsonl(join(dir, 'scope-A'), 'run-1.jsonl', [caseRecord('c1'), caseRecord('c2', 'wrong')])

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    const result = store.query({})

    expect(result.total).toBe(2)
    expect(result.results.every(r => r.scopeId === 'scope-A')).toBe(true)
  })

  it('loads flat <dir>/*.jsonl with scopeId=undefined (backward-compatible)', () => {
    const dir = makeTmpDir()
    writeJsonl(dir, 'run-1.jsonl', [caseRecord('c1'), caseRecord('c2', 'wrong'), caseRecord('c3', 'unjudged')])

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    const result = store.query({})

    expect(result.total).toBe(3)
    // Flat-layout records have NO scopeId key (backward-compatible with pre-3b shape)
    expect(result.results.every(r => r.scopeId === undefined)).toBe(true)
  })

  it('loads both flat + per-scope subdirectories together', () => {
    const dir = makeTmpDir()
    // Flat layout (scopeId=undefined)
    writeJsonl(dir, 'flat-run.jsonl', [caseRecord('c1')])
    // Per-scope layout
    mkdirSync(join(dir, 'scope-A'), { recursive: true })
    writeJsonl(join(dir, 'scope-A'), 'scoped-run.jsonl', [caseRecord('c2'), caseRecord('c3', 'wrong')])

    const store = new EvalResultStore()
    store.loadFromDirectory(dir)

    // Total = 1 (flat) + 2 (scope-A) = 3
    expect(store.query({}).total).toBe(3)
    // Filter by scopeId=scope-A → only the 2 scoped records
    expect(store.query({ scopeId: 'scope-A' }).total).toBe(2)
    // The flat record (c1) is NOT returned when filtering by scope-A
    const scopedResults = store.query({ scopeId: 'scope-A' })
    expect(scopedResults.results.find(r => r.caseId === 'c1')).toBeUndefined()
  })

  it('FileBackedEvalResultStore auto-loads per-scope subdirectories on construction', () => {
    const dir = makeTmpDir()
    mkdirSync(join(dir, 'scope-A'), { recursive: true })
    writeJsonl(join(dir, 'scope-A'), 'run-1.jsonl', [caseRecord('c1')])

    const store = new FileBackedEvalResultStore(dir)
    const result = store.query({ scopeId: 'scope-A' })
    expect(result.total).toBe(1)
    expect(result.results[0]!.scopeId).toBe('scope-A')
  })

  it('handles a directory with no .jsonl files (only subdirectories)', () => {
    const dir = makeTmpDir()
    mkdirSync(join(dir, 'scope-A'), { recursive: true })
    // scope-A subdir has no .jsonl files
    const store = new EvalResultStore()
    store.loadFromDirectory(dir)
    expect(store.query({}).total).toBe(0)
  })
})

// ── (c) EvidenceQueryService read methods scopeId → resolveRoot ──────────

describe('GA-GT1 Phase 3b — EvidenceQueryService read methods scopeId (D5.2)', () => {
  // (c1) scopeId overrides active scope for coverageQuery
  it('coverageQuery(scopeId) resolves the named scope root (active = the OTHER scope)', () => {
    const { ctx } = setupMultiScope() // active = scope-A (2 tables)
    new SemanticLayerService(ctx, { semanticRoot: 'unused' })
    const svc = new EvidenceQueryService(ctx)

    // scope-A has 2 tables, scope-B has 1 table
    expect(svc.coverageQuery('scope-A').table_count).toBe(2)
    expect(svc.coverageQuery('scope-B').table_count).toBe(1)
    // scopeId overrides active: active is scope-A, but scope-B returns only 1
  })

  // (c2) scopeId undefined → active scope (backward-compatible)
  it('coverageQuery() (no scopeId) resolves the ACTIVE scope (backward-compatible)', () => {
    const { ctx, scopes } = setupMultiScope() // active = scope-A
    new SemanticLayerService(ctx, { semanticRoot: 'unused' })
    const svc = new EvidenceQueryService(ctx)

    // No scopeId → active (scope-A) → 2 tables
    expect(svc.coverageQuery().table_count).toBe(2)

    // Switch active to scope-B → now 1 table
    scopes.setActive('scope-B')
    expect(svc.coverageQuery().table_count).toBe(1)
  })

  // (c3) assetHealth scopeId — cross-scope isolation (table in scope-A NOT found in scope-B)
  it('assetHealth(assetId, scopeId) finds the asset only in the correct scope (no cross-scope leak)', () => {
    const { ctx } = setupMultiScope() // scope-A: tbl_a1, tbl_a2; scope-B: tbl_b1
    new SemanticLayerService(ctx, { semanticRoot: 'unused' })
    const svc = new EvidenceQueryService(ctx)

    // tbl_a1 is in scope-A, NOT in scope-B
    expect(svc.assetHealth('tbl_a1', 'scope-A')).not.toBeNull()
    expect(svc.assetHealth('tbl_a1', 'scope-B')).toBeNull() // cross-scope: not found

    // tbl_b1 is in scope-B, NOT in scope-A
    expect(svc.assetHealth('tbl_b1', 'scope-B')).not.toBeNull()
    expect(svc.assetHealth('tbl_b1', 'scope-A')).toBeNull() // cross-scope: not found
  })

  // (c4) assetHealth no scopeId → active scope
  it('assetHealth(assetId) (no scopeId) resolves the active scope (backward-compatible)', () => {
    const { ctx, scopes } = setupMultiScope() // active = scope-A
    new SemanticLayerService(ctx, { semanticRoot: 'unused' })
    const svc = new EvidenceQueryService(ctx)

    // active = scope-A → tbl_a1 found, tbl_b1 NOT found
    expect(svc.assetHealth('tbl_a1')).not.toBeNull()
    expect(svc.assetHealth('tbl_b1')).toBeNull()

    // Switch active to scope-B → tbl_b1 found, tbl_a1 NOT found
    scopes.setActive('scope-B')
    expect(svc.assetHealth('tbl_b1')).not.toBeNull()
    expect(svc.assetHealth('tbl_a1')).toBeNull()
  })

  // (c5) registry unmounted + scopeId provided → falls back to cfg root (no throw)
  it('registry unmounted + scopeId provided → falls back to cfg root (test stand-in, no throw)', () => {
    const { ctx, root } = setupUnmounted() // no scope-registry; cfg root has tbl_cfg
    new SemanticLayerService(ctx, { semanticRoot: root, scopeId: 'cfg-scope' })
    const svc = new EvidenceQueryService(ctx)

    // scopeId provided but registry unmounted → resolveRoot falls back to ctx.schema.semanticRoot (cfg root)
    expect(() => svc.coverageQuery('any-scope-id')).not.toThrow()
    expect(svc.coverageQuery('any-scope-id').table_count).toBe(1) // tbl_cfg
    expect(svc.assetHealth('tbl_cfg', 'any-scope-id')).not.toBeNull()
  })
})

// ── (d) scopeId provided + registry mounted + scope not found → throw ────

describe('GA-GT1 Phase 3b — EvidenceQueryService fail-loud (D5.2)', () => {
  it('scopeId not found in mounted registry → throws (no silent fallback to active)', () => {
    const { ctx } = setupMultiScope() // registry mounted with scope-A + scope-B
    new SemanticLayerService(ctx, { semanticRoot: 'unused' })
    const svc = new EvidenceQueryService(ctx)

    // Every scopeId-accepting read must throw, not silently fall back to active
    expect(() => svc.coverageQuery('nope-scope')).toThrow(/not found in registry/)
    expect(() => svc.assetHealth('tbl_a1', 'nope-scope')).toThrow(/not found in registry/)
    expect(() => svc.gapAnalysis('tbl_a1', 'nope-scope')).toThrow(/not found in registry/)
    // reachabilityDelta also accepts scopeId → must throw fail-loud
    expect(() => svc.reachabilityDelta({ sourceId: 'tbl_a1', targetId: 'tbl_a2', type: 'joins' }, 'nope-scope')).toThrow(/not found in registry/)
  })
})
