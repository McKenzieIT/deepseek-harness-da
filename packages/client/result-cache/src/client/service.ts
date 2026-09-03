/**
 * The scope-addressed `ctx.results` service. Mirrors the host
 * `ResultCache extends Service` placement (one service instance, scope-aware
 * through the Cordis Service tracker) and the client `ConversationController`
 * scope-addressing pattern: `this.ctx` is rebound to the caller's context
 * when the service is reached through a scoped ctx, so `sessions.scopeOf`
 * derives the caller's session without a per-session service instance.
 *
 * The cache itself ({@link createResultCache}) is pure over an injected
 * fetcher; this wrapper supplies the fetcher (the `result.get` RPC) and the
 * session id, turning `get(rid)` into a composite-keyed cache lookup. A
 * consumer reaches it through the inject face:
 * `sessions.scope(sessionId).get('results').get(rid)` — addressed from a
 * scoped ctx, so `scopeOf` resolves the session.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { IApiClient, RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ctx.sessions Context merge so `ctx.get('sessions')` is
// typed, and ISessions/SessionId for the scope-addressed calls.
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { createResultCache } from './cache.ts'
import type { ResultCache, ResultCacheConfig } from './cache.ts'
import type { ResultEntry } from './types.ts'

/** Construction config: the wire client plus the tunable cache bounds. */
export interface ResultServiceConfig extends ResultCacheConfig {
  /** The shared API client (the `result.get` RPC seam; `ctx.connection.api`). */
  readonly api: IApiClient
}

/**
 * The outward `ctx.results` face: a session-aware hot cache over the
 * `result.get` RPC. Reach it through a scoped ctx
 * (`sessions.scope(id).get('results')`) so `get`/`invalidate` resolve the
 * caller's session; `invalidateSession`/`invalidateAll` take an explicit id
 * (or none) for teardown/reconnect paths.
 */
export interface ResultService {
  /**
   * Resolve one result id for the caller's session. Hit returns the cached
   * reference (no clone); miss calls `result.get` and caches the entry.
   * `result-not-found` resolves to `undefined`; other failures reject.
   */
  get(resultId: string, signal?: AbortSignal): Promise<ResultEntry | undefined>
  /** Drop the caller's session's entry for one id (fresh-`query_data` invalidation). */
  invalidate(resultId: string): void
  /** Drop every entry for one session (session teardown / resync). */
  invalidateSession(sessionId: SessionId): void
  /** Drop every entry across all sessions (reconnect flush). */
  invalidateAll(): void
}

/**
 * Scope-addressed result cache service. Provided as `ctx.results`.
 */
export class ResultServiceImpl extends Service implements ResultService {
  private readonly cache: ResultCache
  private readonly api: IApiClient

  /**
   * @param ctx - owning root context (the Service tracker rebinds it on scoped access).
   * @param config - the wire client plus the tunable bounds.
   */
  constructor(ctx: Context, config: ResultServiceConfig) {
    super(ctx, 'results')
    this.api = config.api
    this.cache = createResultCache(config, (resultId, signal) => this.fetch(resultId, signal))
  }

  /** The `result.get` fetcher: unwrap the RPC response to its result. */
  private async fetch(resultId: string, signal?: AbortSignal): Promise<RpcResult<ResultEntry>> {
    const response = await this.api.results.get({ resultId }, signal)
    return response.result
  }

  /**
   * The caller's session id (scope-addressed via the tracker-rebound ctx).
   * `op` labels the throw so `invalidate()` does not blame `get`.
   */
  private scopeId(op: string): SessionId {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) {
      throw new Error("results: sessions service unavailable — address the service via sessions.scope(id).get('results')")
    }
    const sessionId = sessions.scopeOf(this.ctx)
    if (sessionId === undefined) {
      throw new Error(`results: ${op} requires a session scope — address the service via sessions.scope(id).get('results')`)
    }
    return sessionId
  }

  async get(resultId: string, signal?: AbortSignal): Promise<ResultEntry | undefined> {
    return this.cache.get(this.scopeId('get'), resultId, signal)
  }

  invalidate(resultId: string): void {
    this.cache.invalidate(this.scopeId('invalidate'), resultId)
  }

  invalidateSession(sessionId: SessionId): void {
    this.cache.invalidateScope(sessionId)
  }

  invalidateAll(): void {
    this.cache.invalidateAll()
  }
}
