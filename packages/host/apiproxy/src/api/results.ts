/**
 * results domain contract: the web face of the result-cache seam
 * (`ctx.resultCache`). A `result.get` call resolves one `result_id` to its
 * cached `ResultEntry`; the store is session-scoped and in-memory, so an id
 * that belongs to another session or has aged out with it is
 * `result-not-found` (a business miss, not a transport fault). Day-1 returns
 * the full entry — no pagination; a later `result.getPage` would land
 * non-destructively alongside, never changing this method.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Optional metadata stored alongside a cached query/compute result. */
export interface ResultMetadata {
  readonly sql?: string
  readonly truncated?: boolean
  readonly row_count?: number
}

/**
 * One cached query or compute result — the wire mirror of the host
 * `ResultEntry` (`@deepseek-ai/dsh-result-cache`). Defined locally rather than
 * imported so the browser-safe contract layer stays free of the result-cache
 * package's `Service`/`Context` surface (the same stance `CredentialView`
 * takes for the credentials seam).
 */
export interface ResultEntry {
  readonly columns: string[]
  readonly rows: unknown[][]
  readonly metadata?: ResultMetadata
}

/** Results-domain unary methods (the map key result.get of RpcMethodMap). */
export interface ResultsApi {
  /**
   * Resolve one `result_id` to its cached entry. A missing id (cross-session,
   * evicted with the session, or never stored) answers `result-not-found`; a
   * deployment without a result-cache provider answers `internal` (service
   * absent). The result_id vocabulary is `qr_<sha256(sql)[0:12]>` for
   * query-engine results and `cr_<sha256(code+source)[0:12]>` for
   * compute-derived ones.
   */
  get(request: RpcRequest<{ resultId: string }>): Promise<RpcResponse<ResultEntry>>
}
