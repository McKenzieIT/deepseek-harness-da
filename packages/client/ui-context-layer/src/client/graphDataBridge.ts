import type { GraphData, GraphDataOpts } from './types.ts'

export interface GraphDataClient {
  fetchGraphData: (opts?: GraphDataOpts) => Promise<GraphData>
}

interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

interface GraphDataRemoteNamespace {
  getGraphData(opts?: GraphDataOpts): Promise<RemoteResult<GraphData>>
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) {
    let detail = 'unknown'
    if (result.error instanceof Error) detail = result.error.message
    else if (typeof result.error === 'string') detail = result.error
    throw new Error(`getGraphData RPC failed: ${detail}`)
  }
  // RemoteResult.value is optional: a host { ok: true } with no value would
  // otherwise surface as undefined typed as T. Treat its absence as a
  // contract violation rather than returning a phantom value.
  if (result.value === undefined) throw new Error('getGraphData RPC failed: ok response missing value')
  return result.value
}

export function buildGraphDataClient(remote: GraphDataRemoteNamespace): GraphDataClient {
  return {
    async fetchGraphData(opts?) { return unwrap(await remote.getGraphData(opts)) },
  }
}
