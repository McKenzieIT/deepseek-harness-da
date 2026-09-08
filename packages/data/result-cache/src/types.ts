/**
 * Vocabulary for the result-cache Service Definition and the `result.get`
 * Remote domain. Defined locally (not re-exported from any Node-only owner)
 * so the browser-safe `./types` + `./client` subpaths stay free of the
 * `Service`/`Context` runtime surface — the same stance `CredentialView`
 * takes for the credentials seam.
 *
 * @module @deepseek-ai/dsh-result-cache/types
 */

/**
 * Opaque lookup token identifying one cached result. The vocabulary is
 * `qr_<sha256(sql)[0:12]>` for query-engine results and
 * `cr_<sha256(code+source)[0:12]>` for compute-derived ones; the token is
 * opaque to the contract layer — the store's `get` is the authority on what
 * exists.
 */
export type ResultId = string

/** One cached query or compute result. */
export interface ResultEntry {
  readonly columns: string[]
  readonly rows: unknown[][]
  readonly metadata?: ResultMetadata
}

/** Optional metadata stored alongside a cached result. */
export interface ResultMetadata {
  readonly sql?: string
  readonly truncated?: boolean
  readonly row_count?: number
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The result id is absent from the session-scoped cache (cross-session, evicted, or never stored). */
    'result-not-found': { readonly resultId: ResultId }
  }
}
