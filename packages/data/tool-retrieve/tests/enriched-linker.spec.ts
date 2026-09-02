/**
 * retrieve tool — D5.1 (Phase 3) enriched-linker cache: per-scope keying +
 * corpusVersion stale-on-write invalidation. Three focused tests:
 *  (a) corpusVersion bump (a write) -> the cached linker rebuilds + sees the
 *      fresh corpus (non-stale) — fixes the D2e stale-on-write bug;
 *  (b) different scopeId -> different linker instance + isolated corpora
 *      (per-scope keying, dormant until Phase 5 passes scopeId through);
 *  (c) same scopeId + unchanged version -> same instance (cache hit).
 *
 * `getEnrichedLinker` is exported (additive) so the cache contract is testable
 * without a Cordis context. GA-GT1 Phase 5b wires `exec.scopeId` through
 * execute to `getEnrichedLinker` (dormant until 5d — prod callers do not set
 * `AgentOptions.scopeId` yet → `exec.scopeId` undefined → `ACTIVE_SENTINEL` →
 * active path, 現状; 5d eval/CLI config scopeId activates per-scope isolation,
 * made safe by the 5b root-check).
 *
 * Run: `pnpm vitest run packages/data/tool-retrieve`
 */
import { test, expect } from 'vitest'
import { type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { getEnrichedLinker, retrieve } from '../src/index.ts'

/**
 * Minimal structural mock satisfying `SchemaCorpusSource` (no static dep on
 * semantic-layer). `corpus`/`version` are closed-over `let`s so a test can
 * simulate a mid-session write (mutate corpus + bump version), mirroring the
 * real `SemanticLayerService.invalidateCaches` flow.
 */
interface MockSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
}

/**
 * GA-GT1 Phase 5b (#19): root-check regression mock — implements
 * `resolveScopeRoot` (the 5a seam) so the per-scope cache entry's `root`
 * field is exercised. `rootForA` is a closed-over `let` so a test can
 * simulate a re-registration onto a different, never-written root
 * (corpusVersion stays 0===0 — the leak condition the root check closes,
 * parity with the Phase 2 I-1 `graphCacheByScope` root guard).
 */
interface RootCheckSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
  resolveScopeRoot: (scopeId?: string) => string
}

test('EL1 corpusVersion bump rebuilds the enriched linker (non-stale cache, active path)', () => {
  // Mirrors what execute does in Phase 3: getEnrichedLinker(schema) with no
  // scopeId -> active-scope sentinel. A corpusVersion mismatch must drop the
  // cached entry and rebuild from the fresh corpus so a mid-session event edit
  // is visible immediately (the D2e-deferred stale-on-write fix).
  let version = 1
  let corpus: DataSourceDoc[] = [
    { id: 'recharge', description: '充值 角色id 充值金额' },
  ]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => version,
  }
  // first call builds + caches the enriched linker from the v1 corpus
  const l1 = getEnrichedLinker(schema)
  expect(retrieve(l1, '充值', 5).some(h => h.id === 'recharge')).toBe(true)
  // shop.buy is not yet in the corpus
  expect(retrieve(l1, '购买', 5).some(h => h.id === 'shop.buy')).toBe(false)
  // simulate a mid-session event write: corpus changes + version bumps
  corpus = [
    { id: 'recharge', description: '充值 角色id 充值金额' },
    { id: 'shop.buy', description: '购买' },
  ]
  version = 2
  // the version bump must invalidate the cached linker -> rebuild from v2
  const l2 = getEnrichedLinker(schema)
  expect(l2).not.toBe(l1) // rebuilt, not the stale cached instance
  // the rebuilt linker sees the new event (non-stale)
  expect(retrieve(l2, '购买', 5).some(h => h.id === 'shop.buy')).toBe(true)
})

test('EL2 different scopeId -> different linker instance + isolated corpora (per-scope keying)', () => {
  // Phase 3 ships per-scope keying as dormant capacity (execute does not yet
  // pass scopeId). This test exercises the dormant path directly to prove two
  // scopes get distinct cached linkers + do not cross-contaminate corpora.
  const corpusA: DataSourceDoc[] = [{ id: 'evt.a', description: '充值' }]
  const corpusB: DataSourceDoc[] = [{ id: 'evt.b', description: '购买' }]
  const schema: MockSchema = {
    loadRetrievalCorpus: (scopeId?: string) => (scopeId === 'tenant-b' ? corpusB : corpusA),
    corpusVersion: () => 1, // same version for both scopes -> keying is the only separator
  }
  const linkerA = getEnrichedLinker(schema, 'tenant-a')
  const linkerB = getEnrichedLinker(schema, 'tenant-b')
  // per-scope isolation: distinct cached entries (separate Bm25Linker instances)
  expect(linkerA).not.toBe(linkerB)
  // each linker sees only its own scope's corpus
  expect(retrieve(linkerA, '充值', 5).some(h => h.id === 'evt.a')).toBe(true)
  expect(retrieve(linkerB, '购买', 5).some(h => h.id === 'evt.b')).toBe(true)
  // cross-check: tenant-a's linker does NOT see tenant-b's evt.b
  expect(retrieve(linkerA, '购买', 5).some(h => h.id === 'evt.b')).toBe(false)
})

test('EL3 same scopeId + unchanged version -> same linker instance (cache hit)', () => {
  // A repeated call with the same scopeId + unchanged corpusVersion must hit
  // the cache (same instance, no rebuild) — the D5.1 cache-hit path.
  const corpus: DataSourceDoc[] = [{ id: 'evt.x', description: '充值' }]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => 1,
  }
  const l1 = getEnrichedLinker(schema, 'tenant-a')
  const l2 = getEnrichedLinker(schema, 'tenant-a') // same scope, same version
  expect(l2).toBe(l1) // cache hit: identical instance, no rebuild
  // the active scope (no scopeId) also hits its own entry across repeats
  const active1 = getEnrichedLinker(schema)
  const active2 = getEnrichedLinker(schema)
  expect(active2).toBe(active1)
  // active entry is distinct from a named scope entry (sentinel vs string key)
  expect(active1).not.toBe(l1)
})

// ── GA-GT1 Phase 5b: #19 root-check regression + backward-compat ──────────

test('EL4 (#19) root-check: re-registering scope with a different root rebuilds the linker (no cross-tenant leak)', () => {
  // I-1 isomorphic (parity with semantic-layer graphCacheByScope): a scope
  // re-registered to a different, never-written root keeps corpusVersion 0===0.
  // WITHOUT the root check, the cache would HIT (version 0===0) and serve the
  // OLD root's linker → cross-tenant leak. The `entry.root === root` check
  // makes the entry MISS → rebuild from the new root's corpus. The root field
  // + check are added in 5b to the `enrichedLinkers` per-scope cache entry,
  // mirroring Phase 2 I-1.
  const corpusK11: DataSourceDoc[] = [{ id: 'k11.evt', description: '充值 K11' }]
  const corpusX63: DataSourceDoc[] = [{ id: 'x63.evt', description: '购买 X63' }]
  let rootForA = '/roots/k11'
  const schema: RootCheckSchema = {
    // corpus tracks the current rootForA (re-registration flips it)
    loadRetrievalCorpus: () => (rootForA === '/roots/k11' ? corpusK11 : corpusX63),
    corpusVersion: () => 0, // both roots never written → 0===0 (the leak condition)
    resolveScopeRoot: () => rootForA,
  }
  // Register 'A' → root1; build + cache {linker: l1, version: 0, root: root1}
  const l1 = getEnrichedLinker(schema, 'A')
  expect(retrieve(l1, '充值', 5).some(h => h.id === 'k11.evt')).toBe(true)  // K11 content
  expect(retrieve(l1, '购买', 5).some(h => h.id === 'x63.evt')).toBe(false) // X63 not present
  // Re-register 'A' → root2 (same id, different tenant content); version still 0.
  rootForA = '/roots/x63'
  // WITHOUT root check: version 0===0 → HIT → serve l1 (K11) → cross-tenant leak.
  // WITH root check: root1≠root2 → MISS → rebuild l2 from root2's corpus (X63).
  const l2 = getEnrichedLinker(schema, 'A')
  expect(l2).not.toBe(l1) // rebuilt, not the stale cached instance
  expect(retrieve(l2, '购买', 5).some(h => h.id === 'x63.evt')).toBe(true)   // X63 content (rebuilt from root2)
  expect(retrieve(l2, '充值', 5).some(h => h.id === 'k11.evt')).toBe(false)  // K11-only content gone
})

test('EL5 (5b backward-compat) no resolveScopeRoot → root=undefined → version-only degradation (现状)', () => {
  // A schema WITHOUT resolveScopeRoot (the 5a seam) degrades via `?.`:
  // root=undefined, the entry stores root: undefined, and the hit check
  // `entry.root === root` becomes `undefined === undefined` → true → version-
  // only behavior (the pre-5b contract, unchanged). This is the dormant/mock
  // path: a real SemanticLayerService exposes resolveScopeRoot → root is a
  // real path → the check activates. MockSchema (no resolveScopeRoot) exercises
  // this degradation so the 5b change is additive + zero-break.
  const corpus: DataSourceDoc[] = [{ id: 'evt.x', description: '充值' }]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => 1,
  }
  const l1 = getEnrichedLinker(schema, 'tenant-a')
  const l2 = getEnrichedLinker(schema, 'tenant-a') // same scope, same version, root undefined===undefined
  expect(l2).toBe(l1) // cache hit: version-only degradation (现状 preserved)
  // active scope (no scopeId) also hits: root undefined, ACTIVE_SENTINEL key
  const a1 = getEnrichedLinker(schema)
  const a2 = getEnrichedLinker(schema)
  expect(a2).toBe(a1)
})
