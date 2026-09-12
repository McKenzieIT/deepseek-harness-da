/**
 * Wire vocabulary for cached query/compute results. Mirrored locally rather
 * than imported from `@deepseek-ai/dsh-host-apiproxy/api` so this browser
 * package stays self-contained at the type boundary — the same stance the
 * apiproxy contract layer takes for its own `ResultEntry` (defined locally
 * rather than imported from the host `dsh-result-cache` package, keeping the
 * browser-safe contract free of the host `Service`/`Context` surface). The
 * shape is structurally identical to the RPC response value, so the
 * `api.results.get` result assigns without coercion.
 *
 * @module @deepseek-ai/dsh-client-result-cache
 */

/** Optional metadata stored alongside a cached result. */
export interface ResultMetadata {
  readonly sql?: string
  readonly truncated?: boolean
  readonly row_count?: number
}

/** One cached query or compute result (the value held in the LRU). */
export interface ResultEntry {
  readonly columns: string[]
  // Readonly-tightened so the canonical `RemoteResult<CanonicalResultEntry>`
  // (rows: readonly (readonly Json[])[]) travelling through `ctx.remote.result.get`
  // assigns to this local mirror without a cast. Also aligns the type with the
  // module's own contract ("hits return the cached reference; entries are
  // treated as immutable read-only views").
  readonly rows: readonly (readonly unknown[])[]
  readonly metadata?: ResultMetadata
}
