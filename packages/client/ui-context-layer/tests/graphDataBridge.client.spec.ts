import { describe, expect, it, vi } from 'vitest'
import { buildGraphDataClient } from '../src/client/graphDataBridge.ts'
import type { GraphData } from '../src/client/types.ts'

describe('buildGraphDataClient', () => {
  const mockData: GraphData = {
    nodes: [{ id: 'a', kind: 'dws', label: 'A', domains: ['core'] }],
    edges: [{ source: 'a', target: 'b', type: 'joins' }],
  }

  it('returns graph data on successful RPC', async () => {
    const remote = { getGraphData: vi.fn().mockResolvedValue({ ok: true, value: mockData }) }
    const client = buildGraphDataClient(remote)
    const result = await client.fetchGraphData({ focus: 'a', depth: 2 })
    expect(result).toEqual(mockData)
    expect(remote.getGraphData).toHaveBeenCalledWith({ focus: 'a', depth: 2 })
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
    expect(remote.getGraphData).toHaveBeenCalledWith(undefined)
  })
})
