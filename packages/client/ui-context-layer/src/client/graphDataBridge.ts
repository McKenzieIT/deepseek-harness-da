import type { GraphData, GraphDataOpts } from './types.ts'

export interface GraphDataClient {
  fetchGraphData(opts?: GraphDataOpts): Promise<GraphData>
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
  if (!result.ok) throw new Error(`getGraphData RPC failed: ${String(result.error ?? 'unknown')}`)
  return result.value as T
}

export function buildGraphDataClient(remote: GraphDataRemoteNamespace): GraphDataClient {
  return {
    async fetchGraphData(opts?) { return unwrap(await remote.getGraphData(opts)) },
  }
}
