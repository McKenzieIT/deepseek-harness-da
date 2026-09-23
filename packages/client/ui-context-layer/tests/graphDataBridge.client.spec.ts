import { describe, expect, it, vi } from 'vitest'
import { buildGraphDataClient } from '../src/client/graphDataBridge.ts'
import type { SemanticGraphData as GraphData } from '@deepseek-ai/dsh-schema-gateway'

describe('buildGraphDataClient', () => {
  const mockData = {
    nodes: [{ id: 'a', kind: 'dws', label: 'A', domains: ['core'] }],
    edges: [{ source: 'a', target: 'b', type: 'joins' }],
  } as unknown as GraphData

  it('returns graph data on successful RPC', async () => {
    const remote = { getGraphData: vi.fn().mockResolvedValue({ ok: true, value: mockData }) }
    const client = buildGraphDataClient(remote)
    const result = await client.fetchGraphData({ focus: 'a', depth: 2 })
    expect(result).toEqual(mockData)
    expect(remote.getGraphData).toHaveBeenCalledWith({ focus: 'a', depth: 2 }, undefined)
  })

  it('throws on RPC failure', async () => {
    const remote = { getGraphData: vi.fn().mockResolvedValue({ ok: false, error: 'timeout' }) }
    const client = buildGraphDataClient(remote)
    await expect(client.fetchGraphData()).rejects.toThrow('getGraphData RPC failed: timeout')
  })

  it('passes no opts when called without arguments', async () => {
    const remote = { getGraphData: vi.fn().mockResolvedValue({ ok: true, value: mockData }) }
    const client = buildGraphDataClient(remote)
    await client.fetchGraphData()
    expect(remote.getGraphData).toHaveBeenCalledWith(undefined, undefined)
  })

  // `RemoteResult.value` is statically required on the ok branch, but the value
  // is decoded from the wire, so a malformed `{ ok: true }` reaches this bridge.
  // Without the guard `unwrap` returns `undefined` typed as GraphData and the
  // failure surfaces later as a `data.nodes` TypeError inside React, naming no
  // RPC. The canonical helper (ui-semantic-layer/src/client/remoteResult.ts)
  // states this rule for both the evidence-query and schema-gateway bridges.
  it('throws when an ok response carries no value', async () => {
    const remote = { getGraphData: vi.fn().mockResolvedValue({ ok: true }) }
    const client = buildGraphDataClient(remote)
    await expect(client.fetchGraphData()).rejects.toThrow(
      'getGraphData RPC failed: ok response missing value',
    )
  })
})
