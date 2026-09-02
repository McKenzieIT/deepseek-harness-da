/**
 * InProcRetrieval — D5.3 (Phase 3c) per-scope retriever cache: lazy per-scope
 * re-probe + corpusVersion stale-on-write invalidation + config.dataSources
 * fallback. Five focused tests:
 *  (a) schema mounted → getScopedRetriever builds from loadRetrievalCorpus
 *      (active path, no scopeId);
 *  (b) corpusVersion bump → retriever rebuilds with fresh corpus (non-stale);
 *  (c) different scopeId → different retriever + per-scope content isolation;
 *  (d) same scopeId + unchanged version → same instance (cache hit);
 *  (e) schema not mounted → retrieve falls back to config.dataSources retriever.
 *
 * `getScopedRetriever` is exported (additive) so the cache contract is testable
 * without a Cordis context. GA-GT1 Phase 5b adds the #22 root-check (entry
 * `root` field + `entry.root === root` hit guard) and `retrieve` already
 * threads `opts?.scopeId` through (dormant until 5d — prod callers do not set
 * `AgentOptions.scopeId` yet; 5d eval/CLI config scopeId activates per-scope
 * isolation, made safe by the 5b root-check).
 *
 * Run: `pnpm vitest run packages/retrieval/retrieval-inproc`
 */
import { test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { tokenize } from '@deepseek-ai/dsh-embedder/src/tokenize.ts'
import {
  getScopedRetriever,
  InProcRetrieval,
  type RetrievalCorpusItem,
  type EmbedderLike,
} from '../src/index.ts'

const DIM = 64

/** Deterministic hash embedder stub (mirrors FakeHashEmbedder's projection; no egress). */
function hashVec(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0)
  for (const tok of tokenize(text)) {
    const h = Number(createHash('sha256').update(tok).digest().readBigUInt64BE(0) % BigInt(dim))
    v[h] = (v[h] ?? 0) + 1
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  if (n > 0) for (let i = 0; i < dim; i++) v[i] = (v[i] ?? 0) / n
  return v
}

const hashEmbedder: EmbedderLike = { embed: async texts => texts.map(t => hashVec(t, DIM)) }

/**
 * Minimal structural mock satisfying `SchemaCorpusSource` (no static dep on
 * semantic-layer). `corpus`/`version` are closed-over `let`s so a test can
 * simulate a mid-session write (mutate corpus + bump version), mirroring the
 * real `SemanticLayerService.invalidateCaches` flow.
 */
interface MockSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly RetrievalCorpusItem[]
  corpusVersion: (scopeId?: string) => number
}

/** GA-GT1 Phase 5b (#22): root-check regression mock — implements
 *  `resolveScopeRoot` (the 5a seam) so the per-scope cache entry's `root`
 *  field is exercised. `rootForA` is a closed-over `let` so a test can
 *  simulate a re-registration onto a different, never-written root
 *  (corpusVersion stays 0===0 — the leak condition the root check closes,
 *  parity with Phase 2 I-1 graphCacheByScope + the 3a enrichedLinkers root
 *  guard). */
interface RootCheckSchema {
  loadRetrievalCorpus: (scopeId?: string) => readonly RetrievalCorpusItem[]
  corpusVersion: (scopeId?: string) => number
  resolveScopeRoot: (scopeId?: string) => string
}

test('SR1 (a) schema mounted → getScopedRetriever builds from loadRetrievalCorpus (active path, no scopeId)', async () => {
  // Mirrors what retrieve does in Phase 3c: getScopedRetriever(schema, embedder,
  // reranker) with no scopeId → active-scope sentinel. The returned retriever
  // must be built from the schema's loadRetrievalCorpus corpus (not empty).
  const corpus: RetrievalCorpusItem[] = [
    { id: 'metric.营收', description: '营收 revenue 总收入', metrics: { revenue: 1 } },
  ]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => 1,
  }
  const retriever = getScopedRetriever(schema, hashEmbedder, undefined)
  const hits = await retriever.retrieve('营收', { topK: 5 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.id).toBe('metric.营收')
})

test('SR2 (b) corpusVersion bump rebuilds the scoped retriever (non-stale cache, active path)', async () => {
  // A corpusVersion mismatch must drop the cached entry and rebuild from the
  // fresh corpus so a mid-session event edit is visible immediately (the
  // D2e-deferred stale-on-write fix, now live on the active path).
  let version = 1
  let corpus: RetrievalCorpusItem[] = [
    { id: 'metric.营收', description: '营收 revenue', metrics: {} },
  ]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => version,
  }
  // first call builds + caches the retriever from the v1 corpus
  const r1 = getScopedRetriever(schema, hashEmbedder, undefined)
  expect((await r1.retrieve('购买', { topK: 5 })).some(h => h.id === 'shop.buy')).toBe(false)
  // simulate a mid-session event write: corpus changes + version bumps
  corpus = [
    { id: 'metric.营收', description: '营收 revenue', metrics: {} },
    { id: 'shop.buy', description: '购买 buy', metrics: {} },
  ]
  version = 2
  // the version bump must invalidate the cached retriever → rebuild from v2
  const r2 = getScopedRetriever(schema, hashEmbedder, undefined)
  expect(r2).not.toBe(r1) // rebuilt, not the stale cached instance
  // the rebuilt retriever sees the new event (non-stale)
  expect((await r2.retrieve('购买', { topK: 5 })).some(h => h.id === 'shop.buy')).toBe(true)
})

test('SR3 (c) different scopeId → different retriever + per-scope content isolation', async () => {
  // Phase 3c ships per-scope keying as dormant capacity (retrieve does not
  // yet receive scopeId from any caller). This test exercises the dormant
  // path directly to prove two scopes get distinct cached retrievers AND
  // that each retriever sees only its own scope's corpus (no cross-
  // contamination) — parity with 3a EL2. getScopedRetriever already passes
  // scopeId to loadRetrievalCorpus (production code is correct); this pins
  // the per-scope content-isolation contract so a regression there is
  // caught here.
  const corpusA: RetrievalCorpusItem[] = [{ id: 'evt.a', description: '充值', metrics: {} }]
  const corpusB: RetrievalCorpusItem[] = [{ id: 'evt.b', description: '购买', metrics: {} }]
  const schema: MockSchema = {
    loadRetrievalCorpus: (scopeId?: string) => (scopeId === 'tenant-b' ? corpusB : corpusA),
    corpusVersion: () => 1, // same version for both scopes → keying is the only separator
  }
  const rA = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-a')
  const rB = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-b')
  // per-scope isolation: distinct cached entries (separate HybridRetriever instances)
  expect(rA).not.toBe(rB)
  // each retriever sees only its own scope's corpus
  expect((await rA.retrieve('充值', { topK: 5 })).some(h => h.id === 'evt.a')).toBe(true)
  expect((await rB.retrieve('购买', { topK: 5 })).some(h => h.id === 'evt.b')).toBe(true)
  // cross-check: tenant-a's retriever does NOT see tenant-b's evt.b (no cross-contamination)
  expect((await rA.retrieve('购买', { topK: 5 })).some(h => h.id === 'evt.b')).toBe(false)
})

test('SR4 (d) same scopeId + unchanged version → same retriever instance (cache hit)', async () => {
  // A repeated call with the same scopeId + unchanged corpusVersion must hit
  // the cache (same instance, no rebuild) — the D5.3 cache-hit path.
  const corpus: RetrievalCorpusItem[] = [{ id: 'evt.x', description: '充值', metrics: {} }]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => 1,
  }
  const r1 = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-a')
  const r2 = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-a') // same scope, same version
  expect(r2).toBe(r1) // cache hit: identical instance, no rebuild
  // the active scope (no scopeId) also hits its own entry across repeats
  const active1 = getScopedRetriever(schema, hashEmbedder, undefined)
  const active2 = getScopedRetriever(schema, hashEmbedder, undefined)
  expect(active2).toBe(active1)
  // active entry is distinct from a named scope entry (sentinel vs string key)
  expect(active1).not.toBe(r1)
})

test('SR5 (e) schema not mounted → retrieve falls back to config.dataSources retriever', async () => {
  // When ctx.schema is NOT probed (no SchemaCorpusSource mounted), retrieve
  // must use the construct-time retriever (config.dataSources) — the current
  // behavior, preserved as the additive fallback (zero break). Uses a real
  // Cordis Context with an embedder provided but NO schema provided.
  const ctx = new Context()
  ctx.provide('embedder', hashEmbedder as unknown as EmbedderLike)
  const dataSources: readonly RetrievalCorpusItem[] = [
    { id: 'fallback.营收', description: '营收 revenue fallback path', metrics: {} },
  ]
  const retrieval = new InProcRetrieval(ctx, { dataSources })
  const hits = await retrieval.retrieve('营收', { topK: 5 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.id).toBe('fallback.营收') // used the config.dataSources retriever, not a schema path
})

// ── GA-GT1 Phase 5b: #22 root-check regression + backward-compat ──────────

test('SR6 (#22) root-check: re-registering scope with a different root rebuilds the retriever (no cross-tenant leak)', async () => {
  // I-1 isomorphic (parity with semantic-layer graphCacheByScope + the 3a
  // enrichedLinkers root checks): a scope re-registered to a different,
  // never-written root keeps corpusVersion 0===0. WITHOUT the root check,
  // the cache would HIT (version 0===0) and serve the OLD root's retriever →
  // cross-tenant leak. The `entry.root === root` check makes the entry MISS →
  // rebuild from the new root's corpus. 5b adds `root` to the
  // `scopedRetrievers` per-scope cache entry + checks it, mirroring Phase 2 I-1.
  const corpusK11: RetrievalCorpusItem[] = [{ id: 'k11.evt', description: '充值 K11', metrics: {} }]
  const corpusX63: RetrievalCorpusItem[] = [{ id: 'x63.evt', description: '购买 X63', metrics: {} }]
  let rootForA = '/roots/k11'
  const schema: RootCheckSchema = {
    loadRetrievalCorpus: () => (rootForA === '/roots/k11' ? corpusK11 : corpusX63),
    corpusVersion: () => 0, // both roots never written → 0===0 (the leak condition)
    resolveScopeRoot: () => rootForA,
  }
  // Register 'A' → root1; build + cache {retriever: r1, version: 0, root: root1}
  const r1 = getScopedRetriever(schema, hashEmbedder, undefined, 'A')
  expect((await r1.retrieve('充值', { topK: 5 })).some(h => h.id === 'k11.evt')).toBe(true)  // K11 content
  expect((await r1.retrieve('购买', { topK: 5 })).some(h => h.id === 'x63.evt')).toBe(false) // X63 not present
  // Re-register 'A' → root2 (same id, different tenant content); version still 0.
  rootForA = '/roots/x63'
  // WITHOUT root check: version 0===0 → HIT → serve r1 (K11) → cross-tenant leak.
  // WITH root check: root1≠root2 → MISS → rebuild r2 from root2's corpus (X63).
  const r2 = getScopedRetriever(schema, hashEmbedder, undefined, 'A')
  expect(r2).not.toBe(r1) // rebuilt, not the stale cached instance
  expect((await r2.retrieve('购买', { topK: 5 })).some(h => h.id === 'x63.evt')).toBe(true)  // X63 content (rebuilt from root2)
  expect((await r2.retrieve('充值', { topK: 5 })).some(h => h.id === 'k11.evt')).toBe(false)  // K11-only content gone
})

test('SR7 (5b backward-compat) no resolveScopeRoot → root=undefined → version-only degradation (现状)', async () => {
  // A schema WITHOUT resolveScopeRoot (the 5a seam) degrades via `?.`:
  // root=undefined, the entry stores root: undefined, and the hit check
  // `entry.root === root` becomes `undefined === undefined` → true → version-
  // only behavior (the pre-5b contract, unchanged). MockSchema (no
  // resolveScopeRoot) exercises this degradation so the 5b change is additive.
  const corpus: RetrievalCorpusItem[] = [{ id: 'evt.x', description: '充值', metrics: {} }]
  const schema: MockSchema = {
    loadRetrievalCorpus: () => corpus,
    corpusVersion: () => 1,
  }
  const r1 = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-a')
  const r2 = getScopedRetriever(schema, hashEmbedder, undefined, 'tenant-a') // same scope, same version, root undefined===undefined
  expect(r2).toBe(r1) // cache hit: version-only degradation (现状 preserved)
  const a1 = getScopedRetriever(schema, hashEmbedder, undefined)
  const a2 = getScopedRetriever(schema, hashEmbedder, undefined)
  expect(a2).toBe(a1)
})
