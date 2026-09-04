/**
 * In-process hybrid retriever — pure logic (no Cordis context).
 *
 * Mirrors reverse-bi `rbi-retrieval/semantic/retrieval.HybridRetriever` +
 * the `unified_search` reranker-after-RRF refinement, re-implemented in TS
 * (async — rbi is sync in a short-lived MCP subprocess where blocking on
 * `urllib` is harmless; a long-lived Cordis service must not block the event
 * loop on embedding inference). `InferenceError` from the embedder/reranker
 * degrades to BM25-only (mirrors rbi `degradation.py` + P5 prototype
 * scenario 5).
 *
 * Pure (takes an `EmbedderLike`, not a `Service`) so the hybrid mechanism is
 * unit-testable without a Cordis runtime; the `InProcRetrieval` Service wraps
 * it with `ctx.embedder`.
 *
 * BM25: rbi uses `rank_bm25.BM25Okapi` defaults (k1=1.5, b=0.75); the P5
 * prototype used k1=1.2 — production aligns to rbi's 1.5. The TS default
 * storage is pure-JS in-mem cosine (zero-dependency, P5 decision D4);
 * sqlite-vec / Qdrant are deferred upgrade tiers (seam contract unchanged).
 *
 * @module @deepseek-ai/dsh-retrieval-inproc/src/hybrid
 */
import { InferenceError, type Reranker } from '@deepseek-ai/dsh-embedder/src/index.ts'
import { tokenize } from '@deepseek-ai/dsh-embedder/src/tokenize.ts'
import type { RetrievalHit } from '@deepseek-ai/dsh-retrieval/src/index.ts'

/** RRF damping constant (Cormack et al. 2009); mirrors rbi `constants.RRF_K`. */
export const RRF_K = 60
/** Per-candidate reranker noise floor; mirrors rbi `constants.RERANKER_NOISE_FLOOR`.
 * Assumes the Reranker peer returns non-negative scores ~[0,1] (see the
 * `Reranker.rerank` contract in @deepseek-ai/dsh-embedder) — a peer returning
 * raw logits would see valid candidates dropped below this floor. (erc-6) */
export const RERANKER_NOISE_FLOOR = 0.1
/** Default top-K; mirrors rbi `retrieval.DEFAULT_TOP_K`. */
export const DEFAULT_TOP_K = 10

/**
 * Per-field corpus weights (simplified rbi `_FIELD_WEIGHTS` for the
 * DataSourceDoc shape — `id`≈name×3, `description`×1, metric-name×4). The
 * richer rbi field_name/desc/domain weights arrive when P6b `ctx.schema`
 * supplies a semantic-layer corpus.
 */
export const FIELD_WEIGHTS = { id: 3, description: 1, metric: 4 } as const

/** A corpus item the retriever indexes (DataSourceDoc-shaped). */
export interface RetrievalCorpusItem {
  /** Unique identifier (name) of the data-source document; repeated by the `id` field weight when building the indexed corpus text. */
  readonly id: string
  /**
   * Optional human-readable description of the data source;
   * repeated by the `description` field weight when building the indexed corpus text.
   */
  readonly description?: string
  /**
   * Optional metric definitions keyed by metric name;
   * each metric name is repeated by the `metric` field weight when building the indexed corpus text.
   */
  readonly metrics?: Record<string, unknown>
  /** Opaque extra payload carried through to the hit (e.g. the full doc). */
  readonly payload?: unknown
}

/** Minimal embedder interface the retriever depends on (`ctx.embedder` satisfies it; tests pass a stub). */
export interface EmbedderLike {
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>
}

interface CorpusEntry {
  readonly id: string
  readonly text: string
  readonly payload: RetrievalCorpusItem
}

/**
 * Build the weighted corpus text per item (field weights via token repetition, mirrors rbi).
 * @param items - corpus documents to index (DataSourceDoc-shaped).
 * @returns per-item corpus entries with weighted text and the carried payload.
 */
export function buildCorpus(items: readonly RetrievalCorpusItem[]): readonly CorpusEntry[] {
  return items.map((d) => {
    const parts: string[] = []
    for (let i = 0; i < FIELD_WEIGHTS.id; i++) parts.push(d.id)
    if (d.description) for (let i = 0; i < FIELD_WEIGHTS.description; i++) parts.push(d.description)
    if (d.metrics) for (const m of Object.keys(d.metrics)) for (let i = 0; i < FIELD_WEIGHTS.metric; i++) parts.push(m)
    return { id: d.id, text: parts.join(' '), payload: d }
  })
}

/**
 * Cosine similarity (zero-dep in-mem, mirrors the P5 prototype).
 * @param a - first vector.
 * @param b - second vector.
 * @returns cosine similarity in roughly [-1, 1]; a zero-norm pair yields 0 via the `|| 1` guard.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/**
 * Reciprocal Rank Fusion (rbi `rrf_fuse` mirror). Rank is 1-indexed, k=60,
 * tie-break by name ascending. Pure (ranks-only) so it is unit-testable.
 * @param rankings - each ranking is a list of candidate names, best-first.
 * @param k - RRF damping constant (defaults to `RRF_K` = 60).
 * @returns fused `{ name, score }`, best-first.
 */
export function rrfFuse(rankings: readonly (readonly string[])[], k = RRF_K): readonly { name: string; score: number }[] {
  const scores: Record<string, number> = {}
  for (const ranking of rankings) {
    for (let r = 0; r < ranking.length; r++) {
      const name = ranking[r]
      if (name === undefined) continue
      scores[name] = (scores[name] ?? 0) + 1 / (k + r + 1) // r 0-indexed -> rank = r + 1
    }
  }
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/**
 * BM25Okapi (k1=1.5, b=0.75; idf clamped >= 0 mirroring rbi
 * `_clamp_bm25_scores`). rbi uses rank_bm25 defaults; the P5 prototype's
 * k1=1.2 is corrected to 1.5 here.
 */
export class BM25Okapi {
  private readonly k1 = 1.5
  private readonly b = 0.75
  private readonly docs: readonly string[][]
  private readonly avgdl: number
  private readonly idf: Record<string, number>

  constructor(corpus: readonly CorpusEntry[]) {
    this.docs = corpus.map(d => tokenize(d.text))
    const n = this.docs.length
    const totalLen = this.docs.reduce((s, d) => s + d.length, 0)
    this.avgdl = n ? totalLen / n : 1
    const df: Record<string, number> = {}
    for (const doc of this.docs) {
      const seen = new Set(doc)
      for (const t of seen) df[t] = (df[t] ?? 0) + 1
    }
    this.idf = {}
    for (const [t, d] of Object.entries(df)) {
      this.idf[t] = Math.max(0, Math.log((n - d + 0.5) / (d + 0.5))) // clamp >= 0
    }
  }

  /**
   * BM25 scores per doc (clamped >= 0).
   * @param queryTokens - pre-tokenized query terms.
   * @returns BM25 score per corpus doc, aligned to the constructor's corpus order.
   */
  getScores(queryTokens: readonly string[]): readonly number[] {
    return this.docs.map((doc) => {
      const tf: Record<string, number> = {}
      for (const t of doc) tf[t] = (tf[t] ?? 0) + 1
      const dl = doc.length
      let s = 0
      for (const t of queryTokens) {
        const idf = this.idf[t]
        const tfT = tf[t]
        if (idf == null || tfT == null) continue
        const denom = tfT + this.k1 * (1 - this.b + this.b * (dl / (this.avgdl || 1)))
        s += (idf * (tfT * (this.k1 + 1))) / denom
      }
      return Math.max(0, s)
    })
  }
}

interface Hit {
  readonly idx: number
  score: number
  readonly payload: RetrievalCorpusItem
}

/**
 * Hybrid retriever (rbi `retrieval.HybridRetriever` mirror): BM25 + vector
 * (cosine) fused via RRF, with an optional reranker peer applied AFTER RRF
 * (mirrors rbi `unified_search.py`). `InferenceError` from the embedder
 * degrades to BM25-only; from the reranker, keeps the RRF order.
 */
export class HybridRetriever {
  private readonly corpus: readonly CorpusEntry[]
  private readonly embedder: EmbedderLike
  private readonly reranker: Reranker | undefined
  private readonly bm25: BM25Okapi
  private vecs: readonly (readonly number[])[] | null = null
  private vecDown = false
  /** In-flight corpus-embed promise so concurrent retrieve calls share one
   * embed (no duplicate round-trips, no success/failure race on vecs/vecDown). */
  private vecsPromise: Promise<readonly (readonly number[])[]> | null = null

  constructor(
    corpus: readonly RetrievalCorpusItem[],
    embedder: EmbedderLike,
    opts: { readonly reranker?: Reranker | undefined } = {},
  ) {
    this.corpus = buildCorpus(corpus)
    this.embedder = embedder
    this.reranker = opts.reranker
    this.bm25 = new BM25Okapi(this.corpus)
  }

  /** Embed the corpus once (lazy); `InferenceError` -> vec down (BM25-only).
   * Concurrent callers share a single in-flight embed. */
  private ensureVecs(): Promise<readonly (readonly number[])[]> {
    // Cached terminal state: corpus embed succeeded (vecs) or failed
    // permanently (vecDown). Concurrent callers short-circuit here.
    if (this.vecs !== null || this.vecDown) return Promise.resolve(this.vecs ?? [])
    // Memoize the in-flight embed so a second retrieve entering before the
    // first resolves awaits the SAME promise (no duplicate embed, no race
    // where a failure overwrites a concurrent success on the shared fields).
    if (this.vecsPromise !== null) return this.vecsPromise
    const corpusTexts = this.corpus.map(d => d.text)
    this.vecsPromise = (async () => {
      try {
        const result = await this.embedder.embed(corpusTexts)
        this.vecs = result
        return result
      } catch (e) {
        if (e instanceof InferenceError) {
          // dim_mismatch is a permanent capability/config mismatch (the embedder
          // returns the wrong dimension) — retrying won't help; mark the vector
          // plane down for the session. not_ready (HTTP 503) / timeout /
          // unavailable are transient — leave `vecs` null so the NEXT retrieve
          // retries (BM25-only this call), instead of permanently disabling the
          // vector plane for the session on a brief first-warm embedder blip
          // (embedder-retrieval-creds-1).
          if (e.kind === 'dim_mismatch') {
            this.vecs = []
            this.vecDown = true
          }
          return []
        }
        throw e
      } finally {
        // Clear the in-flight slot once settled. Terminal state (vecs or
        // vecDown) now short-circuits future callers; a thrown non-
        // InferenceError leaves vecs null so the next call retries.
        this.vecsPromise = null
      }
    })()
    return this.vecsPromise
  }

  /**
   * Hybrid retrieve. `mode` in the returned hits reflects the actual path
   * (`hybrid` when the vector plane contributed, `bm25-only` on degradation);
   * the caller's `opts.mode` is a hint, not forced.
   * @param query - natural-language query.
   * @param opts - `topK` cap (+ `mode` hint).
   * @returns RetrievalHit[], best-first.
   */
  async retrieve(
    query: string,
    opts: { readonly topK?: number | undefined; readonly mode?: string | undefined } = {},
  ): Promise<readonly RetrievalHit[]> {
    if (this.corpus.length === 0) return []
    const topK = opts.topK ?? DEFAULT_TOP_K
    const qt = tokenize(query)
    if (qt.length === 0) return []

    const bm25Scores = this.bm25.getScores(qt)
    const bm25Top = bm25Scores
      .map((s, i) => ({ i, s }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topK)
      .map(o => o.i)

    const vecs = await this.ensureVecs()
    let hits: Hit[]
    let mode: string
    if (this.vecDown || vecs.length === 0) {
      // BM25-only degradation (embedder InferenceError -> skip the vector plane)
      mode = 'bm25-only'
      hits = bm25Top.map(i => ({ idx: i, score: bm25Scores[i] ?? 0, payload: this.corpus[i]?.payload as RetrievalCorpusItem }))
    } else {
      try {
        const qv = (await this.embedder.embed([query]))[0] ?? []
        const vecTop = vecs
          .map((v, i) => ({ i, s: cosine(v, qv) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, topK)
          .map(o => o.i)
        const idToIdx = new Map(this.corpus.map((c, i) => [c.id, i]))
        const fused = rrfFuse(
          [bm25Top.map(i => this.corpus[i]?.id ?? ''), vecTop.map(i => this.corpus[i]?.id ?? '')],
          RRF_K,
        )
        mode = 'hybrid'
        hits = fused
          .map(f => ({ idx: idToIdx.get(f.name) ?? -1, score: f.score }))
          .filter(h => h.idx >= 0)
          .slice(0, topK)
          .map(h => ({ idx: h.idx, score: h.score, payload: this.corpus[h.idx]?.payload as RetrievalCorpusItem }))
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e
        // query-embed InferenceError -> degrade to BM25-only for THIS query
        // only (transient). Do NOT set the shared `vecDown` flag here: the
        // corpus embed succeeded, so the vector plane is not actually down,
        // and a single transient query-embed timeout must not permanently
        // force BM25-only for every later query (the embedder may recover).
        // Only the corpus-level ensureVecs catch may set `vecDown` (the
        // corpus is fixed, so its failure is permanent).
        mode = 'bm25-only'
        hits = bm25Top.map(i => ({ idx: i, score: bm25Scores[i] ?? 0, payload: this.corpus[i]?.payload as RetrievalCorpusItem }))
      }
    }

    // Reranker peer applied AFTER RRF (mirrors rbi unified_search.py); noise floor drops weak candidates.
    if (this.reranker !== undefined && hits.length > 0) {
      const texts = hits.map(h => this.corpus[h.idx]?.text ?? '')
      try {
        const rscores = await this.reranker.rerank(query, texts)
        hits = hits
          .map((h, i) => ({ idx: h.idx, score: rscores[i] ?? 0, payload: h.payload }))
          .filter(h => h.score >= RERANKER_NOISE_FLOOR)
          .sort((a, b) => b.score - a.score)
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e
        // reranker down -> keep the RRF/BM25 order (degradation)
      }
    }

    return hits.map(h => ({ id: this.corpus[h.idx]?.id ?? '', score: h.score, payload: h.payload, mode }))
  }
}
