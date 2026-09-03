/**
 * The byte-bounded LRU core for the client result cache. Pure over an
 * injected fetcher (the `result.get` RPC), so eviction, admission, the
 * miss/not-found/error paths, single-flight coalescing, the in-flight
 * invalidation (epoch) guard, and session-key isolation are testable with no
 * Cordis or DOM machinery. The {@link ResultService} wrapper adds scope
 * addressing (the caller's session id) and lives as the `ctx.results` service.
 *
 * Design (R5 resolution, 2026-09-03):
 * - Byte-bounded LRU, no TTL. `cr_` results are immutable-once-written on the
 *   host and `qr_` results carry a point-in-time snapshot, so a TTL would
 *   only evict hot entries prematurely; correctness is the invalidation API's
 *   job, not a timer's. (`updateAgeOnGet` was dropped: lru-cache refreshes
 *   recency on read with no TTL regardless of that flag, so it was a no-op.)
 * - `maxEntrySize` admission: an entry larger than the per-entry budget is
 *   fetched on demand and never cached (one multi-MB result must not
 *   displace the hot working set). The size is computed once and passed to
 *   `lru.set` so `sizeCalculation` does not re-serialize the entry.
 * - No per-hit clone: a hit returns the same cached reference (results are
 *   treated as immutable read-only views).
 * - Session isolation via composite key (`scope:rid`): the host resolves
 *   `result.get` per session, and the client key mirrors that so one
 *   session's cached rows never leak to another under a shared `qr_` id.
 * - Single-flight: concurrent `get`s for the same key coalesce onto one
 *   in-flight fetch (React 18 StrictMode double-invoke + concurrent render +
 *   two toolviews sharing a `result_id` would otherwise re-RPC multi-MB
 *   payloads — exactly what this cache exists to avoid).
 * - Epoch guard: an `invalidate*` during an in-flight fetch marks that fetch
 *   `aborted` so its late `lru.set` is skipped — without this, a fresh
 *   `query_data` (invalidate) that lands while the old fetch is in flight
 *   would store a stale snapshot that survives the whole session (no TTL).
 *   This is R5's minimal in-flight subset; the missed-event residual (a
 *   get-after-invalidate-during-flight returning the old value once) stays a
 *   Known Limitation — the full generation-token hardening is deferred.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

import { LRUCache } from 'lru-cache'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ResultEntry } from './types.ts'

/** A host miss for one result id (business miss, not a transport fault). */
export const RESULT_NOT_FOUND = 'result-not-found' as const

/** Tunable cache bounds. Mirrors R5's Config fields; defaults in {@link DEFAULT_RESULT_CACHE_CONFIG}. */
export interface ResultCacheConfig {
  /** Per-entry byte budget (sizeCalculation units). Entries above this are fetched on demand, never cached. */
  readonly maxEntrySize: number
  /** Total byte budget across every cached entry (sizeCalculation units). */
  readonly maxSize: number
  /** Entry-count backstop (defense-in-depth against thousands of tiny entries). */
  readonly max: number
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
}

/** Fetch one result id, returning the RPC result (ok value or business error); may throw (transport). */
export type ResultFetcher = (resultId: string, signal?: AbortSignal) => Promise<RpcResult<ResultEntry>>

/** Code used when the fetcher itself rejects (network/timeout/abort/parse) — not a host business error. */
export const RESULT_FETCH_TRANSPORT = 'transport'

/**
 * Non-not-found fetch failure (propagated to the consumer; not cached). The
 * `code` is widened to `string` (not the closed `RpcErrorCode` union): a
 * thrown transport failure carries no `RpcError`, so the code is either a
 * host business code (from an `{ok:false}` result) or {@link RESULT_FETCH_TRANSPORT}.
 */
export class ResultFetchError extends Error {
  override readonly name = 'ResultFetchError'
  /** The host error code, or `transport` for a fetcher throw. */
  readonly code: string

  /** @param resultId - the id that failed to resolve. @param code - the error code. @param message - the error message. */
  constructor(readonly resultId: string, code: string, message: string) {
    super(`result.get(${resultId}) failed: ${code}: ${message}`)
    this.code = code
  }
}

/**
 * Key separator: a literal colon. Session ids (UUIDs) and `qr_`/`cr_` result ids
 * (hex) carry no colon, and `scopeKey` URL-encodes both parts anyway, so a
 * colon-bearing id cannot spoof the boundary (`(a:b, c)` ≠ `(a, b:c)`).
 */
const SCOPE_SEP = ':'

/** Composite cache key for one (session, result) pair (both parts URL-encoded so a `:` in an id cannot collide with the separator). */
function scopeKey(scope: string, resultId: string): string {
  return `${encodeURIComponent(scope)}${SCOPE_SEP}${encodeURIComponent(resultId)}`
}

/** The byte-budget estimate for one entry (JSON-serialized UTF-16 code units). */
function estimateEntrySize(entry: ResultEntry): number {
  return JSON.stringify(entry).length
}

/** The message of an unknown fetcher rejection (transport) — never empty. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'fetch failed'
}

/** One in-flight fetch for a key: its coalesced promise + an epoch-abort flag. */
interface InFlight {
  /** The coalesced promise concurrent gets share (single-flight). */
  pending: Promise<ResultEntry | undefined>
  /** Set by `invalidate*` during the fetch so the late `lru.set` is skipped (epoch guard). */
  aborted: boolean
}

/** The outward cache face; the service wraps it with scope addressing. */
export interface ResultCache {
  /**
   * Resolve one (scope, resultId). A hit returns the cached reference (no
   * clone); a miss calls the fetcher, caches the value if it fits the
   * per-entry budget, and returns it. Concurrent misses for the same key
   * coalesce onto one fetch (single-flight). A host `result-not-found`
   * resolves to `undefined` (and is not cached); any other failure —
   * including a thrown fetcher (transport) — rejects with a
   * {@link ResultFetchError}. An `invalidate*` during an in-flight fetch
   * aborts it so the (now-stale) snapshot is not stored.
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
 * @param fetcher - resolves a result id to its RPC result (the `result.get` seam); may throw on transport faults.
 * @returns the cache face.
 */
export function createResultCache(config: ResultCacheConfig, fetcher: ResultFetcher): ResultCache {
  const lru = new LRUCache<string, ResultEntry>({
    max: config.max,
    maxSize: config.maxSize,
    maxEntrySize: config.maxEntrySize,
    sizeCalculation: estimateEntrySize,
  })
  /** In-flight fetches by key (single-flight coalescing + epoch-abort tracking). */
  const inFlight = new Map<string, InFlight>()

  return {
    async get(scope: string, resultId: string, signal?: AbortSignal): Promise<ResultEntry | undefined> {
      const key = scopeKey(scope, resultId)
      const cached = lru.get(key)
      if (cached !== undefined) return cached

      // Single-flight: a concurrent get for the same key rides the in-flight fetch.
      const existing = inFlight.get(key)
      if (existing !== undefined) return existing.pending

      const entry: InFlight = { pending: undefined as unknown as Promise<ResultEntry | undefined>, aborted: false }
      const pending = (async (): Promise<ResultEntry | undefined> => {
        try {
          let result: RpcResult<ResultEntry>
          try {
            result = await fetcher(resultId, signal)
          } catch (error) {
            throw new ResultFetchError(resultId, RESULT_FETCH_TRANSPORT, messageOf(error))
          }
          if (!result.ok) {
            if (result.error.code === RESULT_NOT_FOUND) return undefined
            throw new ResultFetchError(resultId, result.error.code, result.error.message)
          }
          // Admission + epoch guard: store only if not invalidated during the
          // fetch and the entry fits the per-entry budget. The size is computed
          // once and handed to `lru.set` so sizeCalculation is not re-invoked.
          if (!entry.aborted) {
            const size = estimateEntrySize(result.value)
            if (size <= config.maxEntrySize) lru.set(key, result.value, { size })
          }
          return result.value
        } finally {
          // Release the slot when the fetch settles, but only if this entry
          // still owns it (a later invalidate-then-get may have replaced it).
          if (inFlight.get(key) === entry) inFlight.delete(key)
        }
      })()
      entry.pending = pending
      inFlight.set(key, entry)
      return pending
    },

    invalidate(scope: string, resultId: string): void {
      const key = scopeKey(scope, resultId)
      const entry = inFlight.get(key)
      if (entry !== undefined) entry.aborted = true
      lru.delete(key)
    },

    invalidateScope(scope: string): void {
      const prefix = `${encodeURIComponent(scope)}${SCOPE_SEP}`
      for (const key of [...lru.keys()]) {
        if (key.startsWith(prefix)) lru.delete(key)
      }
      for (const key of [...inFlight.keys()]) {
        if (!key.startsWith(prefix)) continue
        const entry = inFlight.get(key)
        if (entry !== undefined) entry.aborted = true
      }
    },

    invalidateAll(): void {
      for (const entry of inFlight.values()) entry.aborted = true
      inFlight.clear()
      lru.clear()
    },

    sizeOf(entry: ResultEntry): number {
      return estimateEntrySize(entry)
    },
  }
}
