/**
 * Browser half: provide the `ctx.results` service, flush it on reconnect,
 * and expose the cache bounds as a schemastery `Config` the host can override
 * from `cordis.yml` (R5's "Config fields from `cordis.yml`" — a client package
 * *can* declare a schemastery Config, as `ui-semantic-layer` does; the prior
 * Agent Note claim that client packages use only construction-config was wrong).
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge (the `result/get` endpoint is dispatched
// through the api-remotes assembly) and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { DEFAULT_RESULT_CACHE_CONFIG } from './cache.ts'
import { ResultServiceImpl } from './service.ts'
import type { ResultService, ResultServiceConfig } from './service.ts'

export type { ResultService, ResultServiceConfig } from './service.ts'
export type { ResultCacheConfig, ResultFetcher } from './cache.ts'
export {
  DEFAULT_RESULT_CACHE_CONFIG,
  RESULT_FETCH_TRANSPORT,
  RESULT_NOT_FOUND,
  ResultFetchError,
  createResultCache,
} from './cache.ts'
export type { ResultEntry, ResultMetadata } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Session-aware hot cache over the `result.get` RPC (scope-addressed). */
    results: ResultService
  }
}

/** Required service: the Client Remote face (its `result.get` is the wire seam). */
export const inject = ['remote']

/**
 * Plugin config: the cache bounds, each optional (the host declares overrides;
 * {@link DEFAULT_RESULT_CACHE_CONFIG} fills the rest). Mirrors R5's Config
 * fields as a schemastery schema so `cordis.yml` can tune the cache.
 */
export interface Config {
  /** Per-entry byte budget; entries above are fetched on demand, never cached. */
  readonly maxEntrySize?: number
  /** Total byte budget across every cached entry. */
  readonly maxSize?: number
  /** Entry-count backstop against thousands of tiny entries. */
  readonly max?: number
}

/** Schemastery schema for {@link Config}: every field defaults to the R5 bound. */
export const Config: z<Config> = z.object({
  maxEntrySize: z.number().default(DEFAULT_RESULT_CACHE_CONFIG.maxEntrySize),
  maxSize: z.number().default(DEFAULT_RESULT_CACHE_CONFIG.maxSize),
  max: z.number().default(DEFAULT_RESULT_CACHE_CONFIG.max),
})

/**
 * Provide `ctx.results` and flush the cache on reconnect. The service is a
 * scope-addressed root singleton (one instance; `sessions.scopeOf` derives the
 * caller's session), so a single `ctx.plugin` mount serves every session. The
 * bounds merge the host's `config` (parsed from `cordis.yml` via {@link Config})
 * over {@link DEFAULT_RESULT_CACHE_CONFIG}.
 * @param ctx - client cordis context carrying the connection handle.
 * @param config - optional bound overrides (defaults fill the rest).
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(ResultServiceImpl, {
    maxEntrySize: config.maxEntrySize ?? DEFAULT_RESULT_CACHE_CONFIG.maxEntrySize,
    maxSize: config.maxSize ?? DEFAULT_RESULT_CACHE_CONFIG.maxSize,
    max: config.max ?? DEFAULT_RESULT_CACHE_CONFIG.max,
  } satisfies ResultServiceConfig)
  // Reconnect resyncs the host's session store; treat every cached entry as
  // stale and repull (the runtime's connection/reset event is the sanctioned
  // "wire-derived caches must treat their state as stale" signal, delivered on
  // the plain cordis event bus — no `connection` service inject required).
  ctx.effect(
    () => ctx.on('connection/reset', () => { ctx.get('results')?.invalidateAll() }),
    'result-cache: connection/reset flush',
  )
}
