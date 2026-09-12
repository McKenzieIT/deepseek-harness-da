/**
 * Host-half Remote gateway for the result-cache seam (`ctx.resultCache`).
 * `@Remote('get')` resolves one `result_id` to its cached `ResultEntry` via
 * `ctx.get('resultCache')` (the optional store seam — a composition without a
 * result-cache provider still serves every other domain). A missing id
 * (cross-session, evicted with the session, or never stored) answers
 * `result-not-found` (a business miss, not a transport fault); a deployment
 * without a result-cache provider answers `internal` (service absent). This
 * mirrors the credentials/settings/approval absent pattern: the store read
 * stays `ctx.get`, never `ctx.resultCache`, so the service key is not a
 * required injection.
 *
 * The result_id vocabulary is `qr_<sha256(sql)[0:12]>` for query-engine
 * results and `cr_<sha256(code+source)[0:12]>` for compute-derived ones; the
 * id is an opaque lookup token here — the store's `get` is the authority on
 * what exists.
 *
 * @module @deepseek-ai/dsh-result-cache/remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote, RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ResultEntry, ResultId } from './types.ts'

/**
 * Client-side contract for the results Remote namespace (`result/get`). The
 * Client calls `ctx.remote.result.get(resultId)`; the Host Gateway dispatches
 * to {@link ResultsRemoteGateway.get} through the live `@Remote('get')` marker
 * (SRC fallback) or the generated strict descriptor.
 */
export interface ResultsRemote {
  /**
   * Resolve one `result_id` to its cached entry.
   * @param resultId - opaque lookup token (`qr_<…>` / `cr_<…>`).
   * @returns the cached entry.
   * @throws `{ code: 'result-not-found' }` when the id is absent from the
   * session-scoped cache (it may belong to another session or have aged out
   * with it).
   * @throws `{ code: 'internal' }` when no result-cache provider is mounted in
   * this deployment's composition.
   */
  get(resultId: ResultId): ResultEntry | Promise<ResultEntry>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Remote gateway over the optional `ctx.resultCache` store seam. */
    resultGateway: ResultsRemoteGateway
  }
}

/**
 * Host Remote gateway over the optional `ctx.resultCache` store seam. Register
 * as a Host plugin (`host.plugin(ResultsRemoteGateway)`) to expose the
 * `result/get` endpoint; the Typert Gateway routes incoming calls through the
 * live `@Remote('get')` marker (or the generated strict descriptor once
 * `build:lib:host` emits `lib/typert.host.js` + `lib/typert.remote-client.js`).
 */
export class ResultsRemoteGateway extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'resultGateway', { namespace: 'result' })
  }

  /**
   * Remote face of the result-cache `get`. Reads the optional `resultCache`
   * service: absent → `internal` (the carrier's `rpcFailure` catch-all maps a
   * thrown `Error` to `{ code: 'internal' }`); a missing id →
   * `result-not-found` (a `RemoteError` carries its `.details` payload
   * through the boundary unchanged, so the `code` survives to the Client).
   * @param resultId - opaque lookup token.
   * @returns the cached entry.
   */
  @Remote('get')
  get(resultId: ResultId): ResultEntry {
    const cache = this.ctx.get('resultCache')
    if (cache === undefined) {
      throw new Error(
        'result cache service is absent: this deployment does not mount a result-cache provider (e.g. @deepseek-ai/dsh-result-cache-memory) in its composition',
      )
    }
    const entry = cache.get(resultId)
    if (entry === undefined) {
      throw new RemoteError(
        'result-not-found',
        `result_id "${resultId}" is not available in the session-scoped result cache (it may belong to another session or have aged out with it)`,
        { resultId },
      )
    }
    return entry
  }
}

export default ResultsRemoteGateway
