/**
 * Browser half: provide the `ctx.results` service and flush it on reconnect.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.sessions merge (the service's scope-addressed
// `ctx.get('sessions')`) and the `connection/reset` event declaration.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { DEFAULT_RESULT_CACHE_CONFIG } from './cache.ts'
import { ResultServiceImpl } from './service.ts'
import type { ResultService, ResultServiceConfig } from './service.ts'

export type { ResultService, ResultServiceConfig } from './service.ts'
export type { ResultCacheConfig, ResultFetcher, ResultFetchError } from './cache.ts'
export { DEFAULT_RESULT_CACHE_CONFIG, RESULT_NOT_FOUND, createResultCache } from './cache.ts'
export type { ResultEntry, ResultMetadata } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Session-aware hot cache over the `result.get` RPC (scope-addressed). */
    results: ResultService
  }
}

/** Required service: the wire handle (its `api` is the `result.get` seam). */
export const inject = ['connection']

/**
 * Provide `ctx.results` and flush the cache on reconnect. The service is a
 * scope-addressed root singleton (one instance; `sessions.scopeOf` derives
 * the caller's session), so a single `ctx.plugin` mount serves every session.
 * @param ctx - client cordis context carrying the connection handle.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  ctx.plugin(ResultServiceImpl, {
    api: connection.api,
    ...DEFAULT_RESULT_CACHE_CONFIG,
  } satisfies ResultServiceConfig)
  // Reconnect resyncs the host's session store; treat every cached entry as
  // stale and repull (the runtime's connection/reset event is the sanctioned
  // "wire-derived caches must treat their state as stale" signal).
  ctx.effect(
    () => ctx.on('connection/reset', () => { ctx.get('results')?.invalidateAll() }),
    'result-cache: connection/reset flush',
  )
}
