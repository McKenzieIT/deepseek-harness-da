/**
 * Service Definition for the embedder capability seam (`ctx.embedder`) + the
 * Reranker peer protocol + the `InferenceError` typed failure.
 *
 * P5b (retrieval/vectorization production hardening): mirrors reverse-bi
 * `rbi-retrieval/semantic/embedder.py` (read-only source — re-implemented,
 * never copied). rbi defines an `Embedder` + `Reranker` Protocol, a
 * `FakeHashEmbedder`/`FakeReranker` zero-dependency default, an
 * `InfinityEmbedder`/`InfinityReranker` external OpenAI-compatible HTTP
 * tier, `load_embedder`/`load_reranker` factories with a process cache, and
 * an `InferenceError` that feeds BM25-only degradation.
 *
 * TS divergence (deliberate, documented): rbi is **synchronous** because it
 * runs in a short-lived MCP subprocess where blocking on `urllib` is
 * harmless. A long-lived Cordis service must not block the Node event loop on
 * HTTP inference, so `embed`/`rerank` are **async** here. The
 * `FakeHashEmbedder` returns `Promise.resolve(...)` to keep the Protocol
 * uniform (no sync/async fork). The `load_*` factories + process cache are
 * replaced by Cordis plugin mounting (a `Service` is a singleton per
 * provider; `peek_cached_embedder` is unnecessary — the service instance is
 * the cache).
 *
 * The Reranker is a PEER protocol, not a top-level seam (P5 decision D1):
 * it is injected as a refinement layer AFTER RRF by the retrieval provider
 * (mirrors rbi `unified_search.py`), never as `ctx.reranker`.
 *
 * @module @deepseek-ai/dsh-embedder
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { EmbedResult } from './types.ts'

export type { Embedding, EmbedResult } from './types.ts'
export { tokenize } from './tokenize.ts'

/** The typed inference failures that feed the BM25-only degradation path. */
export type InferenceErrorKind = 'unavailable' | 'timeout' | 'not_ready' | 'dim_mismatch'

/**
 * Thrown by an embedder/reranker when inference is unavailable, timed out,
 * the model is not ready, or the returned dimension mismatches the cached
 * one. The retrieval provider catches this and degrades to BM25-only
 * (mirrors rbi `degradation.py` + the P5 prototype scenario 5).
 */
export class InferenceError extends Error {
  /** Stable machine-readable failure kind. */
  readonly kind: InferenceErrorKind
  constructor(kind: InferenceErrorKind, detail = '') {
    super(`${kind}${detail ? `: ${detail}` : ''}`)
    this.name = 'InferenceError'
    this.kind = kind
  }
}

/**
 * Reranker peer protocol — a cross-encoder that re-scores (query, text)
 * pairs AFTER RRF fusion. NOT a top-level seam (P5 D1): a retrieval provider
 * accepts an optional `Reranker` and applies it as a refinement layer with
 * noise/reject floors (mirrors rbi `unified_search.py`). Provider packages
 * (FakeHash/Infinity) export a concrete `Reranker` for callers to wire into
 * the retrieval provider's config.
 */
export interface Reranker {
  /** Provider-defined model id (for logging / config surfaces). */
  readonly modelId: string
  /**
   * Re-score each (query, text) pair. Scores align to the input `texts`
   * order. A thrown {@link InferenceError} makes the retrieval provider skip
   * reranking and keep the RRF order (degradation).
   * @param query - the natural-language query.
   * @param texts - the candidate texts to re-score.
   * @returns one relevance score per text, aligned to `texts`.
   */
  rerank(query: string, texts: readonly string[]): Promise<readonly number[]>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    embedder: EmbedderService
  }
}

/**
 * Abstract embedder service. Providers implement `embed` (async — HTTP
 * inference must not block the event loop). `dim` is informational and MAY be
 * `undefined` until the first embed discovers it (HTTP embedder); consumers
 * infer the working dimension from the embedded vectors' length rather than
 * reading `dim` upfront.
 */
export abstract class EmbedderService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'embedder')
  }
  /** Embedding dimension; `undefined` until discovered by an HTTP provider. */
  abstract get dim(): number | undefined
  /** Provider-defined model id (for logging / config surfaces). */
  abstract get modelId(): string
  /**
   * Embed a batch of texts. The result aligns to the input order. A thrown
   * {@link InferenceError} signals the retrieval provider to degrade to
   * BM25-only.
   * @param texts - the texts to embed.
   * @returns one L2-normalized vector per text, aligned to `texts`.
   */
  abstract embed(texts: readonly string[]): Promise<EmbedResult>
}

export default EmbedderService
