/**
 * Service Definition for the retrieval capability seam (`ctx.retrieval`).
 *
 * P5b (retrieval/vectorization production hardening): the production seam P5
 * locked — `retrieve(query, { topK, mode }) → RetrievalHit[]`, where the hit
 * shape `{ id, score, payload, mode }` matches the P13b local `RetrievalLinker`
 * contract (`packages/data/nl2sql-engine/src/bm25-linking.ts`) so the
 * `search_data_sources` tool can swap its local `Bm25Linker` for the real
 * provider additively (contract unchanged). The TS port is **async** (rbi is
 * sync in a short-lived subprocess; a long-lived Cordis service must not block
 * the event loop on embedding inference), so `retrieve` returns a Promise —
 * the only deliberate divergence from the P13b sync `RetrievalLinker`, which
 * stays as the eval-path fallback (P13b untouched, 9/9 spec green).
 *
 * `payload` is opaque (`unknown`): the provider decides what to put (a
 * data-source doc for schema-linking); P13b's `DataSourceDoc` is structurally
 * assignable, so its hits satisfy this seam without the seam depending on the
 * nl2sql-engine package (retrieval is foundational; nl2sql consumes it, not
 * vice versa).
 *
 * @module @deepseek-ai/dsh-retrieval
 */
import { Context, Service } from '@deepseek-ai/cordis'

/** One retrieval result, aligned to the P13b `RetrievalHit` shape. */
export interface RetrievalHit {
  /** Candidate id (a data-source name for schema-linking). */
  readonly id: string
  /** Fused/relevance score (RRF, or reranker score when a reranker is applied). */
  readonly score: number
  /** Opaque provider payload (a data-source doc); `undefined` when the provider emits none. */
  readonly payload: unknown
  /** Retrieval mode that produced this hit (e.g. `hybrid`, `bm25-only`, `bm25`). */
  readonly mode: string
}

/** Query options for {@link RetrievalService.retrieve}. */
export interface RetrievalQuery {
  /** Maximum hits to return. */
  readonly topK?: number
  /** Retrieval mode hint (provider-defined; e.g. `hybrid`, `bm25-only`). */
  readonly mode?: string
  /**
   * Optional tenant/scope id (D5.3 Phase 3c): when the retrieval provider
   * probes `ctx.schema` (a `SchemaCorpusSource`), it resolves this scope's
   * corpus via `loadRetrievalCorpus(scopeId)`; `undefined` falls back to the
   * active scope. Additive + optional: callers that omit it get the current
   * (active-scope) behavior; providers that ignore it are unaffected.
   */
  readonly scopeId?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    retrieval: RetrievalService
  }
}

/**
 * Abstract retrieval service. Providers implement `retrieve` (async). The
 * default provider (`dsh-retrieval-inproc`) runs hybrid BM25 + vector + RRF
 * in-process with a pluggable embedder (`ctx.embedder`); the contract is
 * unchanged across backends (sqlite-vec / Qdrant are deferred upgrade tiers).
 */
export abstract class RetrievalService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'retrieval')
  }

  /**
   * Retrieve candidates for a natural-language query.
   * @param query - the natural-language query.
   * @param opts - `topK` cap + `mode` hint.
   * @returns ranked hits (best-first).
   */
  abstract retrieve(query: string, opts?: RetrievalQuery): Promise<readonly RetrievalHit[]>
}

export default RetrievalService
