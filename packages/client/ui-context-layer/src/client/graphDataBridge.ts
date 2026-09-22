/**
 * Client fetch seam for the semantic-graph RPC. Imports the graph types and
 * the Remote result contract from their owner (`@deepseek-ai/dsh-schema-gateway`
 * + `@deepseek-ai/dsh-typert-protocol`) — the client no longer re-declares
 * them. Unwraps the host's `RemoteResult<SemanticGraphData>` (a discriminated
 * union: `{ ok: true; value } | { ok: false; error: RemoteFailure }`).
 *
 * The `schemaGateway` namespace type comes from the owner-generated
 * `@deepseek-ai/dsh-schema-gateway/remote` augmentation of
 * `TypertRemoteNamespaceMap`, so a contract change (new method, arity shift)
 * surfaces here without a hand-written interface.
 */
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-schema-gateway/remote'
import type { SemanticGraphData as GraphData, SemanticGraphQuery as GraphDataOpts } from '@deepseek-ai/dsh-schema-gateway'

/** The schemaGateway Remote namespace (owner-generated contract). */
type SchemaGatewayRemote = TypertRemoteNamespaceMap['schemaGateway']

/** GraphDataClient */
export interface GraphDataClient {
  fetchGraphData: (opts?: GraphDataOpts) => Promise<GraphData>
}

/**
 * Extract a human-readable detail string from a Remote failure. `RemoteFailure`
 * is a union of `RemoteError<Code>` (extends `Error` with `.message`); test
 * doubles may pass a plain string. Accepting `unknown` keeps both paths
 * type-safe without narrowing the discriminated union prematurely.
 * @param error - the error from a `{ ok: false }` RemoteResult.
 * @returns a diagnostic string for the thrown Error.
 */
function failureDetail(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown'
}

/**
 * Unwrap a RemoteResult: return the value on success, throw on failure.
 * @param result - the RemoteResult from the generated client.
 * @returns the business value (T) when ok.
 * @throws Error when the RPC failed.
 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) {
    throw new Error(`getGraphData RPC failed: ${failureDetail(result.error)}`)
  }
  return result.value
}

/**
 * Build a GraphDataClient over a schemaGateway Remote namespace. Only the
 * `getGraphData` method is required (a test double or a `Pick` of the full
 * namespace suffices). The `scopeId` is left `undefined` — the bridge is
 * single-scope (the active scope); a future per-scope UI can thread it through.
 * @param remote - a namespace providing `getGraphData` (owner-generated contract).
 * @returns a client that unwraps the RemoteResult into a plain GraphData.
 */
export function buildGraphDataClient(remote: Pick<SchemaGatewayRemote, 'getGraphData'>): GraphDataClient {
  return {
    async fetchGraphData(opts?) {
      return unwrap(await remote.getGraphData(opts, undefined))
    },
  }
}
