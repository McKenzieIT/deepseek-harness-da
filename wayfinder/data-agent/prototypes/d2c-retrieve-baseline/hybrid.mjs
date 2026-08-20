/**
 * D2c keep/regress baseline — self-contained reimplementation of the shipped
 * retrieval logic, so the baseline runs with `node` (no pnpm/tsconfig/Cordis
 * runtime entanglement — the env has known host-typecheck gaps from the
 * concurrent host-typecheck-wiring session; a standalone .mjs sidesteps them).
 *
 * Verbatim port of:
 *  - packages/embedder/embedder/src/tokenize.ts          (CJK-aware tokenizer)
 *  - packages/embedder/embedder-fakehash/src/index.ts   (hashVec / FakeHash)
 *  - packages/embedder/embedder/src/index.ts             (InferenceError)
 *  - packages/retrieval/retrieval-inproc/src/hybrid.ts   (BM25Okapi / rrfFuse
 *                                                         / cosine / buildCorpus
 *                                                         / HybridRetriever)
 * The shipped packages' own 33/33 specs verify this logic; this file re-runs
 * the SAME algorithm over a synthetic corpus for measurement only. Any future
 * divergence is caught by the package specs, not here.
 *
 * @param None — pure logic module.
 */
import { createHash } from 'node:crypto'

// --- tokenize (verbatim, embedder/src/tokenize.ts) -------------------------
export function tokenize(text) {
  if (!text) return []
  const tokens = []
  let cjk = ''
  let asc = ''
  const flushCjk = () => {
    if (!cjk) return
    if (cjk.length === 1) tokens.push(cjk)
    else for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2))
    cjk = ''
  }
  const flushAsc = () => {
    if (asc) {
      tokens.push(asc.toLowerCase())
      asc = ''
    }
  }
  for (const ch of text) {
    const cc = ch.codePointAt(0) ?? 0
    const isCjk = cc >= 0x4e00 && cc <= 0x9fff
    const isAlnum = /[a-z0-9]/i.test(ch)
    if (isCjk) {
      flushAsc()
      cjk += ch
    } else if (isAlnum) {
      flushCjk()
      asc += ch
    } else {
      flushCjk()
      flushAsc()
    }
  }
  flushCjk()
  flushAsc()
  return tokens
}

// --- FakeHash (verbatim, embedder-fakehash hashVec) -------------------------
export function hashVec(text, dim = 256) {
  const v = new Array(dim).fill(0)
  for (const tok of tokenize(text)) {
    const h = Number(createHash('sha256').update(tok).digest().readBigUInt64BE(0) % BigInt(dim))
    v[h] = (v[h] ?? 0) + 1
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  if (n > 0) for (let i = 0; i < dim; i++) v[i] = (v[i] ?? 0) / n
  return v
}

// --- InferenceError (verbatim, embedder/src/index.ts) -----------------------
export class InferenceError extends Error {
  constructor(kind, detail = '') {
    super(`${kind}${detail ? `: ${detail}` : ''}`)
    this.name = 'InferenceError'
    this.kind = kind
  }
}

/** FakeHash embedder (always available — the P5b production default tier). */
export const FakeHashEmbedder = {
  dim: 256,
  modelId: 'fake-hash-256',
  async embed(texts) {
    return texts.map((t) => hashVec(t, 256))
  },
}

/** Broken embedder — throws InferenceError so the retriever degrades to BM25-only. */
export const BrokenEmbedder = {
  dim: undefined,
  modelId: 'broken',
  async embed(_texts) {
    throw new InferenceError('unavailable', 'baseline BM25-only run')
  },
}

// --- FakeReranker (query-token-recall fraction, embedder-fakehash) ---------
export function fakeRecall(query, text) {
  const qt = new Set(tokenize(query))
  if (qt.size === 0) return 0
  const tt = new Set(tokenize(text))
  let hit = 0
  for (const t of qt) if (tt.has(t)) hit += 1
  return hit / qt.size
}
export const FakeReranker = {
  modelId: 'fake-recall',
  async rerank(query, texts) {
    return texts.map((t) => fakeRecall(query, t))
  },
}

// --- hybrid.ts logic (verbatim) --------------------------------------------
export const RRF_K = 60
export const RERANKER_NOISE_FLOOR = 0.1
export const DEFAULT_TOP_K = 10
export const FIELD_WEIGHTS = { id: 3, description: 1, metric: 4 }

export function buildCorpus(items) {
  return items.map((d) => {
    const parts = []
    for (let i = 0; i < FIELD_WEIGHTS.id; i++) parts.push(d.id)
    if (d.description) for (let i = 0; i < FIELD_WEIGHTS.description; i++) parts.push(d.description)
    if (d.metrics) for (const m of Object.keys(d.metrics)) for (let i = 0; i < FIELD_WEIGHTS.metric; i++) parts.push(m)
    return { id: d.id, text: parts.join(' '), payload: d }
  })
}

export function cosine(a, b) {
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

export function rrfFuse(rankings, k = RRF_K) {
  const scores = {}
  for (const ranking of rankings) {
    for (let r = 0; r < ranking.length; r++) {
      const name = ranking[r]
      if (name === undefined) continue
      scores[name] = (scores[name] ?? 0) + 1 / (k + r + 1)
    }
  }
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export class BM25Okapi {
  constructor(corpus) {
    this.k1 = 1.5
    this.b = 0.75
    this.docs = corpus.map((d) => tokenize(d.text))
    const n = this.docs.length
    const totalLen = this.docs.reduce((s, d) => s + d.length, 0)
    this.avgdl = n ? totalLen / n : 1
    const df = {}
    for (const doc of this.docs) {
      const seen = new Set(doc)
      for (const t of seen) df[t] = (df[t] ?? 0) + 1
    }
    this.idf = {}
    for (const [t, d] of Object.entries(df)) {
      this.idf[t] = Math.max(0, Math.log((n - d + 0.5) / (d + 0.5)))
    }
  }
  getScores(queryTokens) {
    return this.docs.map((doc) => {
      const tf = {}
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

export class HybridRetriever {
  constructor(corpus, embedder, opts = {}) {
    this.corpus = buildCorpus(corpus)
    this.embedder = embedder
    this.reranker = opts.reranker
    this.bm25 = new BM25Okapi(this.corpus)
    this.vecs = null
    this.vecDown = false
  }
  async ensureVecs() {
    if (this.vecs !== null || this.vecDown) return this.vecs ?? []
    try {
      this.vecs = await this.embedder.embed(this.corpus.map((d) => d.text))
    } catch (e) {
      if (e instanceof InferenceError) {
        this.vecs = []
        this.vecDown = true
      } else {
        throw e
      }
    }
    return this.vecs ?? []
  }
  async retrieve(query, opts = {}) {
    if (this.corpus.length === 0) return []
    const topK = opts.topK ?? DEFAULT_TOP_K
    const qt = tokenize(query)
    if (qt.length === 0) return []
    const bm25Scores = this.bm25.getScores(qt)
    const bm25Top = bm25Scores
      .map((s, i) => ({ i, s }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topK)
      .map((o) => o.i)
    const vecs = await this.ensureVecs()
    let hits
    let mode
    if (this.vecDown || vecs.length === 0) {
      mode = 'bm25-only'
      hits = bm25Top.map((i) => ({ idx: i, score: bm25Scores[i] ?? 0, payload: this.corpus[i]?.payload }))
    } else {
      try {
        const qv = (await this.embedder.embed([query]))[0] ?? []
        const vecTop = vecs
          .map((v, i) => ({ i, s: cosine(v, qv) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, topK)
          .map((o) => o.i)
        const idToIdx = new Map(this.corpus.map((c, i) => [c.id, i]))
        const fused = rrfFuse(
          [bm25Top.map((i) => this.corpus[i]?.id ?? ''), vecTop.map((i) => this.corpus[i]?.id ?? '')],
          RRF_K,
        )
        mode = 'hybrid'
        hits = fused
          .map((f) => ({ idx: idToIdx.get(f.name) ?? -1, score: f.score }))
          .filter((h) => h.idx >= 0)
          .slice(0, topK)
          .map((h) => ({ idx: h.idx, score: h.score, payload: this.corpus[h.idx]?.payload }))
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e
        this.vecDown = true
        mode = 'bm25-only'
        hits = bm25Top.map((i) => ({ idx: i, score: bm25Scores[i] ?? 0, payload: this.corpus[i]?.payload }))
      }
    }
    if (this.reranker && hits.length > 0) {
      const texts = hits.map((h) => this.corpus[h.idx]?.text ?? '')
      try {
        const rscores = await this.reranker.rerank(query, texts)
        hits = hits
          .map((h, i) => ({ idx: h.idx, score: rscores[i] ?? 0, payload: h.payload }))
          .filter((h) => h.score >= RERANKER_NOISE_FLOOR)
          .sort((a, b) => b.score - a.score)
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e
      }
    }
    return hits.map((h) => ({
      id: this.corpus[h.idx]?.id ?? '',
      score: h.score,
      payload: h.payload,
      mode,
    }))
  }
}
