/**
 * Shared Remote-result unwrap contract for client RPC bridges.
 *
 * Both the evidence-query and schema-gateway bridges consume host RPC
 * namespaces whose methods return a `RemoteResult<T>` discriminator
 * (`{ ok, value?, error? }`). This module owns that shape and the single
 * unwrapping rule — throw on `!ok` or a missing value — so the two bridge
 * seams share one contract instead of re-declaring it byte-for-byte.
 */

/** Discriminated host RPC result: `ok` carries `value`; `!ok` carries `error`. */
export interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

/**
 * Unwrap a `RemoteResult<T>` into its `value`, or throw on failure.
 *
 * `ns` names the RPC seam (e.g. `'evidence-query'`, `'schema-gateway'`) so the
 * thrown message identifies which bridge failed. Throws
 * `${ns} RPC failed: <detail>` on `!ok` (detail derived from `error`: an
 * Error's `.message`, a string verbatim, else `'unknown'`), and
 * `${ns} RPC failed: ok response missing value` when the host returned
 * `{ ok: true }` with no value — treating that as a contract violation rather
 * than returning a phantom `undefined` typed as `T`. A present `null` is a
 * valid value and is returned (only `undefined` triggers the missing-value
 * error).
 * @param result - result
 * @param ns - ns
 * @returns the result
 */
export function unwrapRemoteResult<T>(result: RemoteResult<T>, ns: string): T {
  if (!result.ok) {
    let detail = 'unknown'
    if (result.error instanceof Error) detail = result.error.message
    else if (typeof result.error === 'string') detail = result.error
    throw new Error(`${ns} RPC failed: ${detail}`)
  }
  // RemoteResult.value is optional: a host { ok: true } with no value would
  // otherwise surface as undefined typed as T. Treat its absence as a
  // contract violation rather than returning a phantom value.
  if (result.value === undefined) throw new Error(`${ns} RPC failed: ok response missing value`)
  return result.value
}
