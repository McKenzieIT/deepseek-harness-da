/**
 * In-process hybrid retriever — pure-logic unit specs (no Cordis context).
 *
 * Pins the hybrid mechanism (BM25 + vector cosine + RRF, reranker-after-RRF,
 * InferenceError -> BM25-only degradation) that the `InProcRetrieval` Service
 * wraps. FakeHash-quality is intentionally weak (hash-based, not meaning) —
 * these specs prove the seam + hybrid mechanism, NOT retrieval quality (real
 * quality needs the external embedder tier + is evals-driven per D2c).
 *
 * Run: `pnpm vitest run packages/retrieval/retrieval-inproc`
 */
import { test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { tokenize } from '@deepseek-ai/dsh-embedder/src/tokenize.ts'
import { InferenceError, type Reranker } from '@deepseek-ai/dsh-embedder/src/index.ts'
import { HybridRetriever, rrfFuse, cosine, type RetrievalCorpusItem, type EmbedderLike } from '../src/index.ts'

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
const failingEmbedder: EmbedderLike = { embed: async () => { throw new InferenceError('unavailable', 'test down') } }
const firstOnlyReranker: Reranker = { modelId: 'mock-first', rerank: async (_q, texts) => texts.map((_, i) => (i === 0 ? 0.9 : 0.05)) }
const failingReranker: Reranker = { modelId: 'mock-fail', rerank: async () => { throw new InferenceError('unavailable', 'reranker down') } }

const CORPUS: readonly RetrievalCorpusItem[] = [
  { id: 'metric.营收', description: '营收 revenue 总收入 充值金额 daily_revenue', metrics: { revenue: 1 } },
  { id: 'metric.充值金额', description: '充值金额 recharge 总充值 收入 营收 当日充值', metrics: { recharge: 1 } },
  { id: 'metric.DAU', description: 'DAU 日活 活跃用户 daily_active_users 当日登录用户数', metrics: { dau: 1 } },
  { id: 'dim.服务器', description: '服务器 server 区服 渠道 server_id', metrics: {} },
]

test('rrfFuse: fuses, dedupes, 1/(k+rank) scoring, tie-break name asc', () => {
  const fused = rrfFuse([['a', 'b', 'c'], ['b', 'a', 'd']], 60)
  expect(fused.map(f => f.name)).toEqual(['a', 'b', 'c', 'd'])
  expect(fused.find(f => f.name === 'd')?.score).toBeCloseTo(1 / (60 + 3), 6) // d rank 3 (1-indexed) in 2nd ranking only
})

test('cosine: identical -> 1, orthogonal -> 0', () => {
  expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 6)
  expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6)
})

test('retrieve: empty corpus -> []', async () => {
  expect(await new HybridRetriever([], hashEmbedder).retrieve('anything')).toEqual([])
})

test('retrieve: empty query -> []', async () => {
  expect(await new HybridRetriever(CORPUS, hashEmbedder).retrieve('')).toEqual([])
})

test('retrieve: hybrid mode (hash embedder) -> hits mode=hybrid, BM25-strong query top = metric.营收', async () => {
  const hits = await new HybridRetriever(CORPUS, hashEmbedder).retrieve('营收', { topK: 3 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(h => h.mode === 'hybrid')).toBe(true)
  expect(hits[0]?.id).toBe('metric.营收') // '营收' token in id (x3) + description
})

test('retrieve: topK caps the count', async () => {
  const hits = await new HybridRetriever(CORPUS, hashEmbedder).retrieve('营收 充值 DAU 服务器', { topK: 2 })
  expect(hits.length).toBeLessThanOrEqual(2)
})

test('retrieve: InferenceError -> BM25-only degradation (mode=bm25-only, top still metric.营收)', async () => {
  const hits = await new HybridRetriever(CORPUS, failingEmbedder).retrieve('营收', { topK: 3 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(h => h.mode === 'bm25-only')).toBe(true)
  expect(hits[0]?.id).toBe('metric.营收')
})

test('retrieve: embedder swap (hash vs degenerate constant embedder) — both yield hits', async () => {
  const constantEmb: EmbedderLike = {
    embed: async texts => texts.map(() => {
      const v = new Array<number>(DIM).fill(0)
      v[0] = 1
      return v
    }),
  }
  const h1 = await new HybridRetriever(CORPUS, hashEmbedder).retrieve('营收', { topK: 3 })
  const h2 = await new HybridRetriever(CORPUS, constantEmb).retrieve('营收', { topK: 3 })
  expect(h1.length).toBeGreaterThan(0)
  expect(h2.length).toBeGreaterThan(0) // BM25 surfaces candidates even with degenerate vecs
})

test('retrieve: reranker peer after RRF re-scores + noise floor drops weak (1 survivor @0.9)', async () => {
  const hits = await new HybridRetriever(CORPUS, hashEmbedder, { reranker: firstOnlyReranker }).retrieve('营收', { topK: 3 })
  expect(hits).toHaveLength(1) // only the 0.9 candidate survives the 0.1 noise floor
  expect(hits[0]?.score).toBe(0.9) // reranker score, not RRF
})

test('retrieve: reranker InferenceError -> keep RRF order (degradation, mode stays hybrid)', async () => {
  const hits = await new HybridRetriever(CORPUS, hashEmbedder, { reranker: failingReranker }).retrieve('营收', { topK: 3 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(h => h.mode === 'hybrid')).toBe(true)
  expect(hits[0]?.id).toBe('metric.营收')
})

test('retrieve: query-embed InferenceError (corpus embed OK) -> BM25-only degradation', async () => {
  // corpus embed (length > 1) succeeds; query embed (length 1) throws -> degrade
  const flakyQueryEmbedder: EmbedderLike = {
    embed: async (texts) => {
      if (texts.length === 1) throw new InferenceError('timeout', 'query embed down')
      return texts.map(t => hashVec(t, DIM))
    },
  }
  const hits = await new HybridRetriever(CORPUS, flakyQueryEmbedder).retrieve('营收', { topK: 3 })
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(h => h.mode === 'bm25-only')).toBe(true)
  expect(hits[0]?.id).toBe('metric.营收')
})

test('retrieve: transient query-embed InferenceError recovers (2nd call -> hybrid, not permanent BM25-only)', async () => {
  // A single transient query-embed timeout must NOT permanently force BM25-only
  // for later queries: the corpus embed succeeds, so the vector plane is fine
  // and a recovered embedder should yield `hybrid` on the next call. Pins D5-1
  // (the existing always-failing test cannot distinguish per-query degradation
  // from the permanent-vecDown bug).
  let queryCalls = 0
  const transientEmbedder: EmbedderLike = {
    embed: async (texts) => {
      if (texts.length === 1) {
        queryCalls += 1
        if (queryCalls === 1) throw new InferenceError('timeout', 'query embed down once')
      }
      return texts.map(t => hashVec(t, DIM))
    },
  }
  const retriever = new HybridRetriever(CORPUS, transientEmbedder)
  const first = await retriever.retrieve('营收', { topK: 3 })
  expect(first.length).toBeGreaterThan(0)
  expect(first.every(h => h.mode === 'bm25-only')).toBe(true) // degraded for THIS query
  const second = await retriever.retrieve('营收', { topK: 3 })
  expect(second.length).toBeGreaterThan(0)
  expect(second.every(h => h.mode === 'hybrid')).toBe(true) // recovered: vector plane re-attempted
})
