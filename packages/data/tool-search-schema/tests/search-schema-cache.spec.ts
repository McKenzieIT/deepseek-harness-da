/**
 * search_schema — D5.1 (Phase 3) cache-invalidation test. tool-search-schema
 * had no prior spec; this adds the minimum required coverage: a corpusVersion
 * bump (a write) invalidates the cached `Bm25Linker` so the next search sees
 * the fresh corpus (non-stale) — the D2f/D5.1 stale-on-write fix, exercised
 * through the public `searchSchema` API (no need to export the internal
 * `getCachedLinker`). Per-scope keying was dormant capacity until GA-GT1 Phase 5b wired
 * `exec.scopeId` through `searchSchema` -> `getCachedLinker` (dormant until 5d
 * — prod callers do not set `AgentOptions.scopeId` yet; 5d eval/CLI config
 * scopeId activates per-scope isolation, made safe by the 5b root-check);
 * the per-scope contract is parity-proven by tool-retrieve's
 * enriched-linker.spec.ts (same code shape).
 *
 * Run: `pnpm vitest run packages/data/tool-search-schema`
 */
import { test, expect } from 'vitest'
import { type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import { searchSchema } from '../src/index.ts'

/** Minimal structural mock satisfying `SchemaCorpusSource` (no static dep on
 *  semantic-layer). `corpus`/`version` are closed-over `let`s so a test can
 *  simulate a mid-session write (mutate corpus + bump version). */
interface MockSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
}

/** GA-GT1 Phase 5b (#19): root-check regression mock — implements
 *  `resolveScopeRoot` (the 5a seam) so the per-scope cache entry's `root`
 *  field is exercised. `rootForA` is a closed-over `let` so a test can
 *  simulate a re-registration onto a different, never-written root
 *  (corpusVersion stays 0===0 — the leak condition the root check closes,
 *  parity with Phase 2 I-1 graphCacheByScope). */
interface RootCheckSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly DataSourceDoc[]
  corpusVersion: (scopeId?: string) => number
  resolveScopeRoot: (scopeId?: string) => string
}

test('SSC1 corpusVersion bump rebuilds the cached linker (non-stale cache, D5.1)', () => {
  let version = 1
  let corpus: DataSourceDoc[] = [
    { id: 'recharge', description: '充值 roleId 角色id 充值金额' },
  ]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => version,
  }
  // first search builds + caches the linker from the v1 corpus
  const r1 = searchSchema(schema, '充值', 5)
  expect(r1.ok).toBe(true)
  expect(r1.hits?.some(h => h.id === 'recharge')).toBe(true)
  // shop.buy is not yet in the corpus
  const preBuy = searchSchema(schema, '购买', 5)
  expect(preBuy.hits?.some(h => h.id === 'shop.buy')).toBe(false)
  // simulate a mid-session event write: corpus changes + version bumps
  corpus = [
    { id: 'recharge', description: '充值 roleId 角色id 充值金额' },
    { id: 'shop.buy', description: '购买' },
  ]
  version = 2
  // the version bump must invalidate the cached linker -> rebuild from v2
  const r2 = searchSchema(schema, '购买', 5)
  expect(r2.hits?.some(h => h.id === 'shop.buy')).toBe(true)
})

// ── GA-GT1 Phase 5b: #19 root-check regression + backward-compat ──────────

test('SSC2 (#19) root-check: re-registering scope with a different root rebuilds the linker (no cross-tenant leak)', () => {
  // I-1 isomorphic (parity with semantic-layer graphCacheByScope + the 3a
  // tool-retrieve/tool-search-data-sources enrichedLinkers root checks): a
  // scope re-registered to a different, never-written root keeps
  // corpusVersion 0===0. WITHOUT the root check, the cache would HIT
  // (version 0===0) and serve the OLD root's linker → cross-tenant leak.
  // The `entry.root === root` check makes the entry MISS → rebuild from the
  // new root's corpus. 5b adds `root` to the `linkerCache` per-scope entry +
  // checks it, mirroring Phase 2 I-1. `searchSchema` threads scopeId through
  // to `getCachedLinker(schema, scopeId)` (the 5b execute-passthrough seam).
  const corpusK11: DataSourceDoc[] = [{ id: 'k11.evt', description: '充值 K11' }]
  const corpusX63: DataSourceDoc[] = [{ id: 'x63.evt', description: '购买 X63' }]
  let rootForA = '/roots/k11'
  const schema: RootCheckSchema = {
    loadRetrievalCorpus: () => (rootForA === '/roots/k11' ? corpusK11 : corpusX63),
    corpusVersion: () => 0, // both roots never written → 0===0 (the leak condition)
    resolveScopeRoot: () => rootForA,
  }
  // Register 'A' → root1; build + cache {linker: l1, version: 0, root: root1}
  const r1 = searchSchema(schema, '充值', 5, 'A')
  expect(r1.ok).toBe(true)
  expect(r1.hits?.some(h => h.id === 'k11.evt')).toBe(true)  // K11 content
  expect(r1.hits?.some(h => h.id === 'x63.evt')).toBe(false) // X63 not present
  // Re-register 'A' → root2 (same id, different tenant content); version still 0.
  rootForA = '/roots/x63'
  // WITHOUT root check: version 0===0 → HIT → serve l1 (K11) → cross-tenant leak.
  // WITH root check: root1≠root2 → MISS → rebuild l2 from root2's corpus (X63).
  const r2 = searchSchema(schema, '购买', 5, 'A')
  expect(r2.ok).toBe(true)
  expect(r2.hits?.some(h => h.id === 'x63.evt')).toBe(true)  // X63 content (rebuilt from root2)
  expect(r2.hits?.some(h => h.id === 'k11.evt')).toBe(false)  // K11-only content gone
})

test('SSC3 (5b backward-compat) no resolveScopeRoot → root=undefined → version-only degradation (现状)', () => {
  // A schema WITHOUT resolveScopeRoot (the 5a seam) degrades via `?.`:
  // root=undefined, the entry stores root: undefined, and the hit check
  // `entry.root === root` becomes `undefined === undefined` → true → version-
  // only behavior (the pre-5b contract, unchanged). MockSchema (no
  // resolveScopeRoot) exercises this degradation so the 5b change is additive.
  // `searchSchema` returns a fresh result object each call (the cache is on
  // the underlying linker), so cache-hit is proven via a corpus-load counter:
  // a HIT loads the corpus ONCE across two identical calls; a MISS would
  // load it twice.
  const corpus: DataSourceDoc[] = [{ id: 'evt.x', description: '充值' }]
  let corpusLoads = 0
  const schema: MockSchema = {
    loadRetrievalCorpus: () => { corpusLoads++; return corpus },
    corpusVersion: () => 1,
  }
  const r1 = searchSchema(schema, '充值', 5)
  expect(r1.ok).toBe(true)
  expect(corpusLoads).toBe(1) // first call builds + caches
  const r2 = searchSchema(schema, '充值', 5) // same scope, same version, root undefined===undefined
  expect(r2.ok).toBe(true)
  expect(corpusLoads).toBe(1) // cache hit: no rebuild, corpus not re-loaded (version-only degradation, 現状 preserved)
  // content identical (same cached linker served both calls)
  expect(r2.hits).toEqual(r1.hits)
})
