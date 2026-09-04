/**
 * Service Definition for the result-cache capability seam (`ctx.resultCache`):
 * store and retrieve query/compute results by `result_id`. Implementations
 * subclass {@link ResultCache} and register as the `resultCache` service;
 * `@deepseek-ai/dsh-result-cache-memory` (in-memory, session-scoped) is the
 * first.
 *
 * @module @deepseek-ai/dsh-result-cache
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ResultEntry } from './types.ts'

export type { ResultEntry } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    resultCache: ResultCache
  }
}

/**
 * Abstract result cache service. Subclass, implement {@link get}/{@link put}/{@link has},
 * and load the subclass as a plugin — it registers as `ctx.resultCache`.
 *
 * Semantics every implementation must honor:
 * - {@link get} returns the entry for `resultId`, or `undefined` if not found.
 *   The caller decides whether a missing id is an error.
 * - {@link put} stores an entry under `resultId`. Idempotent when the entry is
 *   identical; throws when a DIFFERENT entry is stored under an existing id
 *   (immutable-once-written).
 * - {@link has} returns whether an entry exists for `resultId`.
 */
export abstract class ResultCache extends Service {
  constructor(ctx: Context) {
    super(ctx, 'resultCache')
  }

  /**
   * Read the cached entry for a result id.
   * @param resultId - the result id to read.
   * @returns the stored entry, or `undefined` when no entry is cached under `resultId`.
   */
  abstract get(resultId: string): ResultEntry | undefined
  /**
   * Store a result entry under its id. `cr_` (compute-derived) ids are
   * immutable-once-written: a different entry under an existing `cr_` id
   * throws; `qr_` (query-derived) ids overwrite with the latest entry.
   * @param resultId - the result id to store under.
   * @param entry - the result entry to cache.
   */
  abstract put(resultId: string, entry: ResultEntry): void
  /**
   * Test whether an entry is cached for a result id.
   * @param resultId - the result id to test.
   * @returns whether an entry is cached under `resultId`.
   */
  abstract has(resultId: string): boolean
}

export default ResultCache
