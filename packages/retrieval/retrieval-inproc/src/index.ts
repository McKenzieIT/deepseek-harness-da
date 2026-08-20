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
import { HybridRetriever, type RetrievalCorpusItem, DEFAULT_TOP_K } from './hybrid.ts'

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
 * In-process hybrid retrieval provider. Mounts on `ctx.retrieval`; consumes
 * `ctx.embedder` for the vector plane. Degradates to BM25-only on embedder
 * `InferenceError`.
 */
export class InProcRetrieval extends RetrievalService {
  static inject = ['embedder']

  private readonly retriever: HybridRetriever
  private readonly defaultTopK: number

  constructor(ctx: Context, config: InProcRetrievalConfig = {}) {
    super(ctx)
    this.defaultTopK = config.topK ?? DEFAULT_TOP_K
    this.retriever = new HybridRetriever(
      config.dataSources ?? [],
      ctx.embedder,
      { reranker: config.reranker },
    )
  }

  retrieve(query: string, opts?: RetrievalQuery): Promise<readonly RetrievalHit[]> {
    return this.retriever.retrieve(query, { topK: opts?.topK ?? this.defaultTopK, mode: opts?.mode })
  }
}

export default InProcRetrieval
