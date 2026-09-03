/**
 * InfinityEmbedder / InfinityReranker — pure-helper unit specs (injectable
 * fetch, no live port). Pins the OpenAI-compatible wire + the full
 * `InferenceError` kind mapping that feeds the retrieval provider's
 * BM25-only degradation.
 *
 * Run: `pnpm vitest run packages/embedder/embedder-http`
 */
import { test, expect } from 'vitest'
import { InferenceError } from '@deepseek-ai/dsh-embedder/src/index.ts'
import { infinityEmbed, infinityRerank, type FetchLike } from '../src/index.ts'

/** Build a mock fetch whose `/v1/embeddings` returns one fixed vec per input text. */
function embeddingsFetch(vec: number[]): FetchLike {
  return ((_url: string, init?: { readonly body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { input: string[] }
    const data = body.input.map((_, i) => ({ embedding: vec, index: i }))
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) })
  })
}

test('infinityEmbed: success, result aligned to input order', async () => {
  const vecs = await infinityEmbed(['a', 'b'], { url: 'http://x', model: 'm', fetch: embeddingsFetch([0.1, 0.2]) })
  expect(vecs).toHaveLength(2)
  expect(vecs[0]).toEqual([0.1, 0.2])
})

test('infinityEmbed: re-sorts rows by index (wire may return unordered)', async () => {
  const fetch = ((_url: string, init?: { readonly body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { input: string[] }
    const n = body.input.length
    const data = body.input.map((_, i) => ({ embedding: [n - 1 - i], index: n - 1 - i })) // reversed order, embedding == index
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) })
  }) as FetchLike
  const vecs = await infinityEmbed(['a', 'b', 'c'], { url: 'http://x', model: 'm', fetch })
  expect(vecs).toEqual([[0], [1], [2]])
})

test('infinityEmbed: HTTP 503 -> InferenceError(not_ready)', async () => {
  const fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as FetchLike
  await expect(infinityEmbed(['a'], { url: 'http://x', model: 'm', fetch })).rejects.toBeInstanceOf(InferenceError)
  await expect(infinityEmbed(['a'], { url: 'http://x', model: 'm', fetch })).rejects.toMatchObject({ kind: 'not_ready' })
})

test('infinityEmbed: HTTP 500 -> InferenceError(unavailable)', async () => {
  const fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as FetchLike
  await expect(infinityEmbed(['a'], { url: 'http://x', model: 'm', fetch })).rejects.toMatchObject({ kind: 'unavailable' })
})

test('infinityEmbed: AbortError -> InferenceError(timeout)', async () => {
  const fetch = (async () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    throw e
  }) as unknown as FetchLike
  await expect(infinityEmbed(['a'], { url: 'http://x', model: 'm', fetch, timeout: 50 })).rejects.toMatchObject({ kind: 'timeout' })
})

test('infinityEmbed: dim_mismatch when expectedDim differs from observed', async () => {
  const fetch = embeddingsFetch([1, 2, 3]) // observed dim 3
  await expect(infinityEmbed(['a'], { url: 'http://x', model: 'm', fetch, expectedDim: 999 }))
    .rejects.toMatchObject({ kind: 'dim_mismatch' })
})

test('infinityEmbed: empty input -> [] (no fetch call)', async () => {
  const vecs = await infinityEmbed([], { url: 'http://x', model: 'm', fetch: embeddingsFetch([0]) })
  expect(vecs).toEqual([])
})

test('infinityRerank: scores aligned to input order', async () => {
  const fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }] }),
  })) as FetchLike
  const scores = await infinityRerank('q', ['a', 'b'], { url: 'http://x', model: 'm', fetch })
  expect(scores).toEqual([0.1, 0.9])
})

test('infinityRerank: HTTP error -> InferenceError(unavailable)', async () => {
  const fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as FetchLike
  await expect(infinityRerank('q', ['a'], { url: 'http://x', model: 'm', fetch })).rejects.toMatchObject({ kind: 'unavailable' })
})

test('infinityRerank: empty input -> [] (no fetch call)', async () => {
  const fetch = (async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) })) as FetchLike
  const scores = await infinityRerank('q', [], { url: 'http://x', model: 'm', fetch })
  expect(scores).toEqual([])
})
