import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ResultFetcher } from '../src/client/cache.ts'
import {
  DEFAULT_RESULT_CACHE_CONFIG,
  RESULT_NOT_FOUND,
  ResultFetchError,
  createResultCache,
} from '../src/client/cache.ts'
import type { ResultEntry } from '../src/client/types.ts'

/** A small result entry whose serialized size the byte/eviction tests reason about. */
function entry(resultId: string, rows = 1): ResultEntry {
  return {
    columns: ['c'],
    rows: Array.from({ length: rows }, (_, i) => [`${resultId}:${i}`]),
  }
}

/** A deferred ok-value settlement (for single-flight / epoch-race timing). */
function settleable(): { promise: Promise<{ ok: true; value: ResultEntry }>; settle: (value: { ok: true; value: ResultEntry }) => void } {
  let settle!: (value: { ok: true; value: ResultEntry }) => void
  const promise = new Promise<{ ok: true; value: ResultEntry }>((resolve) => { settle = resolve })
  return { promise, settle }
}

/** An ok fetcher return for one id. */
function ok(result: ResultEntry): Mock<ResultFetcher> {
  return vi.fn(async () => ({ ok: true as const, value: result }))
}

/** A fetcher that answers not-found for every id. */
function notFound(): Mock<ResultFetcher> {
  return vi.fn(async (resultId: string) => ({
    ok: false as const,
    error: { code: RESULT_NOT_FOUND, message: 'miss', details: { resultId } },
  }))
}

/** A fetcher that answers a service-absent (internal) error for every id. */
function serviceError(): Mock<ResultFetcher> {
  return vi.fn(async () => ({
    ok: false as const,
    error: { code: 'internal' as const, message: 'boom', details: {} },
  }))
}

/** A fetcher that throws (transport: network/timeout/abort) for every id. */
function throwing(message = 'network timeout'): Mock<ResultFetcher> {
  return vi.fn(async () => { throw new Error(message) })
}

/** A fetcher that throws synchronously (a sync guard / bug — never returns a Promise) for every id. */
function syncThrowing(message = 'sync boom'): Mock<ResultFetcher> {
  return vi.fn(() => { throw new Error(message) })
}

describe('createResultCache', () => {
  it('misses then fetches, and a second read hits without a second fetch', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    const first = await cache.get('s1', 'qr_1')
    const second = await cache.get('s1', 'qr_1')
    expect(first).toEqual(entry('qr_1'))
    expect(second).toEqual(entry('qr_1'))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('returns the SAME reference on a hit (no per-hit clone)', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    const first = await cache.get('s1', 'qr_1')
    const second = await cache.get('s1', 'qr_1')
    expect(second).toBe(first)
  })

  it('passes the AbortSignal through to the fetcher', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)
    const controller = new AbortController()

    await cache.get('s1', 'qr_1', controller.signal)
    expect(fetcher).toHaveBeenCalledWith('qr_1', controller.signal)
  })

  it('isolates sessions: the same rid under two scopes fetches twice', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await cache.get('s1', 'qr_1')
    await cache.get('s2', 'qr_1') // different session -> miss
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('resolves a host result-not-found to undefined and does not cache it', async () => {
    const fetcher = notFound()
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    expect(await cache.get('s1', 'qr_x')).toBeUndefined()
    expect(await cache.get('s1', 'qr_x')).toBeUndefined() // still not cached -> refetch
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('propagates a non-not-found error as a ResultFetchError and does not cache it', async () => {
    const fetcher = serviceError()
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await expect(cache.get('s1', 'qr_1')).rejects.toBeInstanceOf(ResultFetchError)
    await expect(cache.get('s1', 'qr_1')).rejects.toThrow(/internal: boom/)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('folds a throwing (transport) fetcher into a ResultFetchError with code `transport` and does not cache it', async () => {
    const fetcher = throwing('network timeout')
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await expect(cache.get('s1', 'qr_1')).rejects.toBeInstanceOf(ResultFetchError)
    await expect(cache.get('s1', 'qr_1')).rejects.toMatchObject({ code: 'transport' })
    await expect(cache.get('s1', 'qr_1')).rejects.toThrow(/network timeout/)
    expect(fetcher).toHaveBeenCalledTimes(3) // never cached -> each get refetches
  })

  it('releases the in-flight slot when a fetcher throws synchronously (no stale-reject leak)', async () => {
    const fetcher = syncThrowing('sync boom')
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await expect(cache.get('s1', 'qr_1')).rejects.toMatchObject({ code: 'transport' })
    // The slot must be cleared (the `finally` ran with the entry present in the
    // map) so a fresh get refetches — it must NOT return the stale rejected
    // promise that the first get left behind.
    await expect(cache.get('s1', 'qr_1')).rejects.toMatchObject({ code: 'transport' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent gets for the same key into one fetch (single-flight)', async () => {
    const { promise, settle } = settleable()
    const fetcher: Mock<ResultFetcher> = vi.fn(() => promise)
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    const a = cache.get('s1', 'qr_1')
    const b = cache.get('s1', 'qr_1') // in-flight -> coalesced, no second fetch
    expect(fetcher).toHaveBeenCalledTimes(1)

    settle({ ok: true as const, value: entry('qr_1') })
    const aValue = await a
    const bValue = await b
    expect(aValue).toEqual(entry('qr_1'))
    expect(bValue).toBe(aValue) // same reference — one fetch, cached, no clone
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not store a stale snapshot when invalidate lands during an in-flight fetch (epoch guard)', async () => {
    // First call is held open (the in-flight window); later calls resolve immediately with a distinct value.
    let firstSettle!: (value: { ok: true; value: ResultEntry }) => void
    let calls = 0
    const fetcher: Mock<ResultFetcher> = vi.fn(() => {
      calls += 1
      if (calls === 1) return new Promise<{ ok: true; value: ResultEntry }>((resolve) => { firstSettle = resolve })
      return Promise.resolve({ ok: true as const, value: entry(`qr_1_v${calls}`) })
    })
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    const inFlight = cache.get('s1', 'qr_1') // call 1 -> held
    expect(fetcher).toHaveBeenCalledTimes(1)
    cache.invalidate('s1', 'qr_1') // fresh query_data invalidates mid-flight
    firstSettle({ ok: true as const, value: entry('qr_1_v1') }) // late fetch resolves with the OLD snapshot

    // The in-flight caller still receives its fetched value (the missed-event
    // residual R5 documents — a full generation-token would block it; this
    // minimal epoch guard does not).
    expect(await inFlight).toEqual(entry('qr_1_v1'))
    // ...but the stale snapshot is NOT cached: a fresh get refetches (call 2 -> v2).
    const fresh = await cache.get('s1', 'qr_1')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fresh).toEqual(entry('qr_1_v2'))
  })

  it('does not admit entries above maxEntrySize (fetched on demand each time)', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, maxEntrySize: 1 }, fetcher)

    await cache.get('s1', 'qr_1')
    await cache.get('s1', 'qr_1') // oversized -> never cached -> refetch
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used when the byte budget (maxSize) is exceeded', async () => {
    const fetcher: Mock<ResultFetcher> = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) }))
    // Each entry's serialized size (~36) fits one-at-a-time under 50 but two exceed it.
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, maxSize: 50 }, fetcher)

    await cache.get('s1', 'qr_1') // cached (size ~36 <= 50)
    await cache.get('s1', 'qr_2') // evicts qr_1 (72 > 50)
    await cache.get('s1', 'qr_1') // miss -> refetch
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('enforces the entry-count backstop (max) even when the byte budget is huge', async () => {
    const fetcher: Mock<ResultFetcher> = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) }))
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, max: 2, maxSize: 1_000_000 }, fetcher)

    await cache.get('s1', 'qr_1') // count 1
    await cache.get('s1', 'qr_2') // count 2 (full)
    await cache.get('s1', 'qr_3') // count would be 3 -> evict LRU (qr_1)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await cache.get('s1', 'qr_1') // qr_1 was evicted -> miss -> refetch
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher).toHaveBeenLastCalledWith('qr_1', undefined)
  })

  it('a read refreshes recency so a hot entry survives an LRU sweep (no TTL)', async () => {
    const fetcher: Mock<ResultFetcher> = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) }))
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, max: 2, maxSize: 1_000_000 }, fetcher)

    await cache.get('s1', 'qr_1') // count 1
    await cache.get('s1', 'qr_2') // count 2
    await cache.get('s1', 'qr_1') // HIT -> refreshes qr_1 (qr_2 now LRU)
    await cache.get('s1', 'qr_3') // evict LRU (qr_2), keep qr_1
    expect(fetcher).toHaveBeenCalledTimes(3)
    await cache.get('s1', 'qr_1') // HIT (survived the refresh) -> no fetch
    expect(fetcher).toHaveBeenCalledTimes(3)
    await cache.get('s1', 'qr_2') // qr_2 was evicted -> miss -> refetch
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher).toHaveBeenLastCalledWith('qr_2', undefined)
  })

  it('invalidate drops one entry so the next read refetches', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await cache.get('s1', 'qr_1')
    cache.invalidate('s1', 'qr_1')
    await cache.get('s1', 'qr_1')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('invalidateScope drops only that session, leaving other sessions intact', async () => {
    const fetcher: Mock<ResultFetcher> = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) }))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await cache.get('s1', 'qr_1')
    await cache.get('s1', 'qr_2')
    await cache.get('s2', 'qr_1')
    cache.invalidateScope('s1')

    await cache.get('s1', 'qr_1') // s1 evicted -> refetch
    await cache.get('s1', 'qr_2') // s1 evicted -> refetch
    expect(fetcher).toHaveBeenCalledTimes(5)

    const before = fetcher.mock.calls.length
    await cache.get('s2', 'qr_1') // s2 intact -> hit
    expect(fetcher.mock.calls.length).toBe(before)
  })

  it('invalidateAll drops every entry across all sessions', async () => {
    const fetcher: Mock<ResultFetcher> = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) }))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await cache.get('s1', 'qr_1')
    await cache.get('s2', 'qr_2')
    expect(fetcher).toHaveBeenCalledTimes(2)

    cache.invalidateAll()
    await cache.get('s1', 'qr_1') // refetch
    await cache.get('s2', 'qr_2') // refetch
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('sizeOf reports the JSON-serialized length of an entry', () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)
    expect(cache.sizeOf(entry('qr_1'))).toBe(JSON.stringify(entry('qr_1')).length)
  })
})
