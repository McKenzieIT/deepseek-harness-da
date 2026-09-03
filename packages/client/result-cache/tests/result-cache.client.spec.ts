import { describe, expect, it, vi } from 'vitest'
import type { ResultFetcher } from '../src/client/cache.ts'
import {
  DEFAULT_RESULT_CACHE_CONFIG,
  ResultFetchError,
  RESULT_NOT_FOUND,
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

/** An ok fetcher return for one id. */
function ok(result: ResultEntry): ResultFetcher {
  return vi.fn(async () => ({ ok: true as const, value: result }))
}

/** A fetcher that answers not-found for every id. */
function notFound(): ResultFetcher {
  return vi.fn(async (resultId: string) => ({
    ok: false as const,
    error: { code: RESULT_NOT_FOUND, message: 'miss', details: { resultId } },
  })) as unknown as ResultFetcher
}

/** A fetcher that answers a transport/service error for every id. */
function serviceError(code = 'internal'): ResultFetcher {
  return vi.fn(async () => ({
    ok: false as const,
    error: { code, message: 'boom', details: {} },
  })) as unknown as ResultFetcher
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
    const fetcher = serviceError('internal')
    const cache = createResultCache(DEFAULT_RESULT_CACHE_CONFIG, fetcher)

    await expect(cache.get('s1', 'qr_1')).rejects.toBeInstanceOf(ResultFetchError)
    await expect(cache.get('s1', 'qr_1')).rejects.toThrow(/internal: boom/)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not admit entries above maxEntrySize (fetched on demand each time)', async () => {
    const fetcher = ok(entry('qr_1'))
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, maxEntrySize: 1 }, fetcher)

    await cache.get('s1', 'qr_1')
    await cache.get('s1', 'qr_1') // oversized -> never cached -> refetch
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used when the byte budget (maxSize) is exceeded', async () => {
    const fetcher = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) })) as unknown as ResultFetcher
    // Each entry's serialized size (~36) fits one-at-a-time under 50 but two exceed it.
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, maxSize: 50 }, fetcher)

    await cache.get('s1', 'qr_1') // cached (size ~36 <= 50)
    await cache.get('s1', 'qr_2') // evicts qr_1 (72 > 50)
    await cache.get('s1', 'qr_1') // miss -> refetch
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('enforces the entry-count backstop (max) even when the byte budget is huge', async () => {
    const fetcher = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) })) as unknown as ResultFetcher
    const cache = createResultCache({ ...DEFAULT_RESULT_CACHE_CONFIG, max: 2, maxSize: 1_000_000 }, fetcher)

    await cache.get('s1', 'qr_1') // count 1
    await cache.get('s1', 'qr_2') // count 2 (full)
    await cache.get('s1', 'qr_3') // count would be 3 -> evict LRU (qr_1)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await cache.get('s1', 'qr_1') // qr_1 was evicted -> miss -> refetch
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher).toHaveBeenLastCalledWith('qr_1', undefined)
  })

  it('updateAgeOnGet rescues a read entry from eviction (recency refreshed on read)', async () => {
    const fetcher = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) })) as unknown as ResultFetcher
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
    const fetcher = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) })) as unknown as ResultFetcher
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
    const fetcher = vi.fn(async (rid: string) => ({ ok: true as const, value: entry(rid) })) as unknown as ResultFetcher
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
