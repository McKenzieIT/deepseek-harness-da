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

/**
 * A Typert-safe arbitrary-JSON value. `unknown[][]` in {@link ResultEntry.rows}
 * carries an `unknown` element that the Typert analyzer rejects at a
 * `@Remote` boundary ("Remote boundary contains unconstrained unknown data");
 * this recursive JSON union is constrained (no `unknown`/`any`) yet
 * permissive enough to carry every cell value a query or compute result
 * produces (strings, numbers, booleans, null, nested arrays/objects).
 * Mirrors the `Json` type in `@deepseek-ai/dsh-schema-gateway`.
 */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

/** One cached query or compute result. */
export interface ResultEntry {
  readonly columns: string[]
  readonly rows: readonly (readonly Json[])[]
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
