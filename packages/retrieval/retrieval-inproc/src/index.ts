/**
 * In-process hybrid retrieval provider (`ctx.retrieval`).
 *
 * P5b: the default retrieval provider — `HybridRetriever` (BM25 + vector cosine
 * + RRF k=60, optional reranker peer after RRF) over `ctx.embedder`, with
 * `InferenceError` → BM25-only degradation (mirrors rbi `degradation.py`).
 * The pure logic lives in `./hybrid.ts` (no Cordis context) so the hybrid
 * mechanism is unit-testable; this Service wraps it with `ctx.embedder` +
 * the plugin lifecycle.
 *
 * `static inject = ['embedder']`: the provider's fiber waits for an embedder
 * provider (`dsh-embedder-fakehash` default / `dsh-embedder-http` external)
 * before constructing the retriever. The corpus (`config.dataSources`) is
 * empty by default — the real corpus arrives with P6b `ctx.schema` (the
 * contract is unchanged; an empty corpus is an honest "callable but unwired"
 * state, mirroring the `search_data_sources` tool's Q1 thin default).
 *
 * No `static Config` (schemastery schema): like `dsh-credentials-keychain`,
 * the config holds injectable instances (a `Reranker` peer) + a corpus that
 * is programmatic in production, so the config passes through raw and the
 * constructor applies defaults.
 *
 * @module @deepseek-ai/dsh-retrieval-inproc
 */
import type { Context } from '@deepseek-ai/cordis'
import { RetrievalService, type RetrievalHit, type RetrievalQuery } from '@deepseek-ai/dsh-retrieval/src/index.ts'
import { type Reranker } from '@deepseek-ai/dsh-embedder/src/index.ts'
import { HybridRetriever, type RetrievalCorpusItem, type EmbedderLike, DEFAULT_TOP_K } from './hybrid.ts'

export * from './hybrid.ts'
export type { RetrievalHit, RetrievalQuery } from '@deepseek-ai/dsh-retrieval/src/index.ts'

/** Configuration for the in-process retrieval provider. */
export interface InProcRetrievalConfig {
  /** Corpus to index (DataSourceDoc-shaped); empty until P6b `ctx.schema` ships. */
  readonly dataSources?: readonly RetrievalCorpusItem[]
  /** Default top-K when a retrieve call omits `topK` (default 10, mirrors rbi). */
  readonly topK?: number
  /** Optional reranker peer (applied after RRF); wired programmatically. */
  readonly reranker?: Reranker
}

/**
 * Minimal structural shape `InProcRetrieval` probes for the D2e enriched corpus
 * (`ctx.schema` when the semantic-layer provider is mounted). Avoids a static
 * dep on `@deepseek-ai/dsh-semantic-layer`: `ctx.get('schema')` returns the
 * `SemanticLayerService` when mounted, `undefined` when not (bundle opt-in).
 * The returned corpus items are `RetrievalCorpusItem`-shaped (the
 * `EventCorpusItem` the real service returns is structurally identical —
 * `{ id, description?, metrics?, payload? }` — see semantic-layer
 * `src/corpus.ts`).
 *
 * Phase 3c (D5.3): both read methods take an optional `scopeId` (Phase 2 added
 * scopeId? to `SemanticLayerService.loadRetrievalCorpus`/`corpusVersion`;
 * undefined falls back to the active scope — current behavior preserved).
 * `corpusVersion` stays optional so a schema without it degrades to build-once
 * (D2e behavior); a schema that exposes it gets stale-on-write protection.
 */
interface SchemaCorpusSource {
  loadRetrievalCorpus(scopeId?: string): readonly RetrievalCorpusItem[]
  /** Phase 3c (D5.3): corpus-version signal for stale-cache invalidation;
   *  optional so a schema without it degrades to build-once (D2e behavior). */
  corpusVersion?(scopeId?: string): number
  /** GA-GT1 Phase 5a: per-scope root-resolution seam for the #19/#22
   *  root-check fix (5b adds `root` to the per-scope cache entry + checks
   *  `entry.root === root` — parity with Phase 2 I-1 + the 3a enrichedLinkers
   *  root guard). Optional so a schema without it degrades via `?.`
   *  (build-once, D2e behavior). */
  resolveScopeRoot?(scopeId?: string): string
}

/**
 * Phase 3c (D5.3): sentinel key for the active scope (scopeId omitted) in the
 * per-scope retriever cache. A `symbol` is impossible to collide with any real
 * string scopeId (`Map` distinguishes by type + reference), so the active-scope
 * entry can never shadow or be shadowed by a named scope.
 */
const ACTIVE_SENTINEL = Symbol('active-scope')

/**
 * D5.3 + GA-GT1 Phase 5b: per-scope + version-keyed cache of
 * `HybridRetriever`s, mirroring the 3a `enrichedLinkers` cache shape
 * (WeakMap<schema, Map<scopeId, {retriever, version, root}>>). The outer
 * `WeakMap` keys by schema instance (GC'd when unmounted); the inner `Map`
 * keys by scopeId (active scope uses `ACTIVE_SENTINEL`). Each entry pairs
 * the retriever with the `corpusVersion(scopeId)` it was built at AND the
 * `resolveScopeRoot(scopeId)` it was built under; a mismatch on EITHER (a
 * write bumped the counter for that scope, OR the scope was re-registered
 * onto a different root) drops the entry and rebuilds from the fresh corpus
 * — fixing the D2e stale-on-write bug, isolating scopes (one scope's
 * rebuild does not evict another's cached retriever), AND closing the #22
 * re-registration cross-tenant leak.
 *
 * Phase 3c shipped the per-scope keying as dormant capacity (no caller
 * passed scopeId); the corpusVersion check was live on the active path.
 *
 * GA-GT1 Phase 5b RESOLVES the carry-forward: the entry now records `root`
 * (resolved via the 5a `resolveScopeRoot` seam) + checks `entry.root === root`
 * on hit, so a scope re-registered onto a different, never-written root
 * (version 0===0) MISSES + rebuilds from the new root's corpus instead of
 * serving the OLD root's retriever — parity with the 3a `enrichedLinkers`
 * root guard + the Phase 2 I-1 `graphCacheByScope` root check. `retrieve`
 * passes `opts?.scopeId` through (5b: dormant until 5d — prod callers do not
 * set AgentOptions.scopeId yet; 5d eval/CLI will).
 */
const scopedRetrievers = new WeakMap<SchemaCorpusSource, Map<string | symbol, { retriever: HybridRetriever; version: number; root: string | undefined }>>()

/**
 * Get (or build+cache) the `HybridRetriever` for a schema instance + scope,
 * rebuilding when the schema's corpus-version signal advances OR the scope's
 * root changes (D5.3 + GA-GT1 Phase 5b cache-invalidation). Mirrors the 3a
 * `getEnrichedLinker` shape. Exported so the cache contract is testable
 * without a Cordis context (the Service's `retrieve` calls this with
 * `this.ctx.embedder` + the config reranker). `scopeId` is optional
 * (undefined → active scope via `ACTIVE_SENTINEL`).
 *
 * GA-GT1 Phase 5b (#22): the root check closes the re-registration
 * cross-tenant leak. `resolveScopeRoot?.(scopeId)` is `undefined` when the
 * schema has no `resolveScopeRoot` (mock / pre-5a schema) → `root=undefined`
 * → `entry.root === root` is `undefined===undefined` → true → degrades to
 * version-only (the pre-5b contract, preserved). A real
 * `SemanticLayerService` exposes `resolveScopeRoot` → `root` is a real path
 * → the check activates, so a scope re-registered onto a different,
 * never-written root (version 0===0) MISSES + rebuilds from the new root's
 * corpus instead of serving the OLD root's retriever (parity with the 3a
 * `enrichedLinkers` root guard + Phase 2 I-1 `graphCacheByScope`).
 *
 * @param schema - the `ctx.schema` source whose `loadRetrievalCorpus(scopeId?)` feeds the corpus.
 * @param embedder - the embedder the `HybridRetriever` uses for the vector plane (`ctx.embedder`).
 * @param reranker - optional reranker peer applied after RRF (config-injected).
 * @param scopeId - optional tenant/scope id; undefined falls back to the active scope.
 * @returns a `HybridRetriever` over the schema's corpus for that scope, rebuilt when stale.
 */
export function getScopedRetriever(
  schema: SchemaCorpusSource,
  embedder: EmbedderLike,
  reranker: Reranker | undefined,
  scopeId?: string,
): HybridRetriever {
  const key = scopeId ?? ACTIVE_SENTINEL
  let byScope = scopedRetrievers.get(schema)
  if (byScope === undefined) {
    byScope = new Map()
    scopedRetrievers.set(schema, byScope)
  }
  const version = schema.corpusVersion?.(scopeId) ?? 0
  // GA-GT1 Phase 5b (#22): resolve the scope's root via the 5a seam + check
  // it on hit. `resolveScopeRoot?.()` is `undefined` when the schema has no
  // resolveScopeRoot (mock / pre-5a schema) → root=undefined → entry.root
  // (undefined) === root (undefined) → degrades to version-only (现状). A
  // real SemanticLayerService exposes resolveScopeRoot → root is a real path
  // → the check activates, closing the re-registration cross-tenant leak
  // (parity with 3a enrichedLinkers + Phase 2 I-1 graphCacheByScope).
  const root = schema.resolveScopeRoot?.(scopeId)
  const entry = byScope.get(key)
  if (entry !== undefined && entry.version === version && entry.root === root) {
    return entry.retriever
  }
  const retriever = new HybridRetriever(
    schema.loadRetrievalCorpus(scopeId),
    embedder,
    { reranker },
  )
  byScope.set(key, { retriever, version, root })
  return retriever
}

/**
 * In-process hybrid retrieval provider. Mounts on `ctx.retrieval`; consumes
 * `ctx.embedder` for the vector plane. Degradates to BM25-only on embedder
 * `InferenceError`.
 */
export class InProcRetrieval extends RetrievalService {
  static inject = ['embedder']

  private readonly retriever: HybridRetriever
  private readonly defaultTopK: number
  private readonly reranker: Reranker | undefined

  constructor(ctx: Context, config: InProcRetrievalConfig = {}) {
    super(ctx)
    this.defaultTopK = config.topK ?? DEFAULT_TOP_K
    this.reranker = config.reranker
    this.retriever = new HybridRetriever(
      config.dataSources ?? [],
      ctx.embedder,
      { reranker: config.reranker },
    )
  }

  retrieve(query: string, opts?: RetrievalQuery): Promise<readonly RetrievalHit[]> {
    const topK = opts?.topK ?? this.defaultTopK
    const mode = opts?.mode
    // D5.3 (Phase 3c): probe ctx.schema for a SchemaCorpusSource. When
    // mounted, build/cache a per-scope HybridRetriever from
    // `loadRetrievalCorpus(scopeId)` with `corpusVersion` invalidation (lazy
    // per-scope re-probe — the construct-time `this.retriever` is no longer
    // the sole path). When not mounted, fall back to the construct-time
    // `this.retriever` (config.dataSources) — preserves the current behavior
    // for tests/no-schema mounts (additive, zero break). The defensive
    // `typeof` probe guards a non-schema object resolving to the 'schema'
    // name (mirrors tool-retrieve). `inject` stays `['embedder']` (NOT
    // `'schema'`) so the provider loads without a schema provider.
    //
    // GA-GT1 Phase 5b: `opts?.scopeId` is threaded through to
    // `getScopedRetriever` (dormant until 5d — prod callers do not set
    // AgentOptions.scopeId yet → opts.scopeId is undefined → ACTIVE_SENTINEL
    // → active path, 現状; 5d eval/CLI config scopeId activates per-scope
    // isolation). The 5b root-check (#22) makes this safe: a scope
    // re-registered onto a different root no longer leaks the OLD root's
    // retriever across tenants.
    const schemaProbe = this.ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
    if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') {
      const schema = schemaProbe as SchemaCorpusSource
      const retriever = getScopedRetriever(schema, this.ctx.embedder, this.reranker, opts?.scopeId)
      return retriever.retrieve(query, { topK, mode })
    }
    return this.retriever.retrieve(query, { topK, mode })
  }
}

export default InProcRetrieval
