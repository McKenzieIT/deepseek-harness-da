/**
 * The byte-bounded LRU core for the client result cache. Pure over an
 * injected fetcher (the `result.get` RPC), so eviction, admission, the
 * miss/not-found/error paths, and session-key isolation are testable with no
 * Cordis or DOM machinery. The {@link ResultService} wrapper adds scope
 * addressing (the caller's session id) and lives as the `ctx.results` service.
 *
 * Design (R5 resolution, 2026-09-03):
 * - Byte-bounded LRU, no TTL. `cr_` results are immutable-once-written on the
 *   host and `qr_` results carry a point-in-time snapshot, so a TTL would
 *   only evict hot entries prematurely; correctness is the invalidation API's
 *   job, not a timer's.
 * - `maxEntrySize` admission: an entry larger than the per-entry budget is
 *   fetched on demand and never cached (one multi-MB result must not
 *   displace the hot working set).
 * - No per-hit clone: a hit returns the same cached reference (results are
 *   treated as immutable read-only views).
 * - Session isolation via composite key (`scope:rid`): the host resolves
 *   `result.get` per session, and the client key mirrors that so one
 *   session's cached rows never leak to another under a shared `qr_` id.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

import { LRUCache } from 'lru-cache'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ResultEntry } from './types.ts'

/** A host miss for one result id (business miss, not a transport fault). */
export const RESULT_NOT_FOUND = 'result-not-found'

/** Tunable cache bounds. Mirrors R5's Config fields; defaults in {@link DEFAULT_RESULT_CACHE_CONFIG}. */
export interface ResultCacheConfig {
  /** Per-entry byte budget (sizeCalculation units). Entries above this are fetched on demand, never cached. */
  readonly maxEntrySize: number
  /** Total byte budget across every cached entry (sizeCalculation units). */
  readonly maxSize: number
  /** Entry-count backstop (defense-in-depth against thousands of tiny entries). */
  readonly max: number
  /** Refresh recency on read so hot results stay resident. */
  readonly updateAgeOnGet: boolean
}

/**
 * R5 bounds. `maxEntrySize` ~8MB admits a 10,000-row table (G1 D7's expensive
 * memoization case — folding/expanding such a table without a cache re-RPCs
 * all 10,000 rows); `maxSize` ~64MB sits in the 50–100MB band the 2026-H2
 * research defended for a hot layer sharing a Chrome tab's renderer budget;
 * `max` ~64 is the count backstop. The size unit is the JSON-serialized
 * UTF-16 code-unit length of the entry — a proxy for retained memory, chosen
 * so admission + eviction reason about the same shape that sits on the heap.
 */
export const DEFAULT_RESULT_CACHE_CONFIG: ResultCacheConfig = {
  maxEntrySize: 8_000_000,
  maxSize: 64_000_000,
  max: 64,
  updateAgeOnGet: true,
}

/** Fetch one result id, returning the RPC result (ok value or business/transport error). */
export type ResultFetcher = (resultId: string, signal?: AbortSignal) => Promise<RpcResult<ResultEntry>>

/** Non-not-found fetch failure (propagated to the consumer; not cached). */
export class ResultFetchError extends Error {
  override readonly name = 'ResultFetchError'
  /** The host error code (e.g. `internal` for a service-absent result-cache provider). */
  readonly code: string

  /** @param resultId - the id that failed to resolve. @param error - the host RpcError. */
  constructor(readonly resultId: string, error: RpcError) {
    super(`result.get(${resultId}) failed: ${error.code}: ${error.message}`)
    this.code = error.code
  }
}

/**
 * Key separator: neither session ids (UUIDs) nor `qr_`/`cr_` result ids (hex)
 * carry a colon, and the trailing colon makes scope-prefix matching exact
 * (no `s1`/`s1x` collision).
 */
const SCOPE_SEP = ':'

/** Composite cache key for one (session, result) pair. */
function scopeKey(scope: string, resultId: string): string {
  return `${scope}${SCOPE_SEP}${resultId}`
}

/** The byte-budget estimate for one entry (JSON-serialized UTF-16 code units). */
function estimateEntrySize(entry: ResultEntry): number {
  return JSON.stringify(entry).length
}

/** The outward cache face; the service wraps it with scope addressing. */
export interface ResultCache {
  /**
   * Resolve one (scope, resultId). A hit returns the cached reference (no
   * clone); a miss calls the fetcher, caches the value if it fits the
   * per-entry budget, and returns it. A host `result-not-found` resolves to
   * `undefined` (and is not cached); any other failure rejects with a
   * {@link ResultFetchError}.
   */
  get(scope: string, resultId: string, signal?: AbortSignal): Promise<ResultEntry | undefined>
  /** Drop one (scope, resultId) entry (the invalidation API the consumer calls on a fresh `query_data`). */
  invalidate(scope: string, resultId: string): void
  /** Drop every entry for one session (session teardown / resync). */
  invalidateScope(scope: string): void
  /** Drop every entry (reconnect flush). */
  invalidateAll(): void
  /** The byte-budget estimate for one entry (exposed for tests + diagnostics). */
  sizeOf(entry: ResultEntry): number
}

/**
 * Construct a byte-bounded LRU over an injected fetcher.
 * @param config - the tunable bounds.
 * @param fetcher - resolves a result id to its RPC result (the `result.get` seam).
 * @returns the cache face.
 */
export function createResultCache(config: ResultCacheConfig, fetcher: ResultFetcher): ResultCache {
  const lru = new LRUCache<string, ResultEntry>({
    max: config.max,
    maxSize: config.maxSize,
    maxEntrySize: config.maxEntrySize,
    sizeCalculation: estimateEntrySize,
    updateAgeOnGet: config.updateAgeOnGet,
  })

  return {
    async get(scope: string, resultId: string, signal?: AbortSignal): Promise<ResultEntry | undefined> {
      const key = scopeKey(scope, resultId)
      const cached = lru.get(key)
      if (cached !== undefined) return cached

      const result = await fetcher(resultId, signal)
      if (!result.ok) {
        if (result.error.code === RESULT_NOT_FOUND) return undefined
        throw new ResultFetchError(resultId, result.error)
      }
      // Admission: an oversized entry is fetched on demand and never cached,
      // so a single large result cannot evict the hot working set. lru-cache's
      // own maxEntrySize guard agrees, but the decision is explicit here
      // (explicit-over-implicit at the admission boundary).
      if (estimateEntrySize(result.value) <= config.maxEntrySize) lru.set(key, result.value)
      return result.value
    },

    invalidate(scope: string, resultId: string): void {
      lru.delete(scopeKey(scope, resultId))
    },

    invalidateScope(scope: string): void {
      const prefix = `${scope}${SCOPE_SEP}`
      for (const key of [...lru.keys()]) {
        if (key.startsWith(prefix)) lru.delete(key)
      }
    },

    invalidateAll(): void {
      lru.clear()
    },

    sizeOf(entry: ResultEntry): number {
      return estimateEntrySize(entry)
    },
  }
}
