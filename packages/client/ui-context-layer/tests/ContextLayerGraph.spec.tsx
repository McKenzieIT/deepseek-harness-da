// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ContextLayerGraph } from '../src/client/ContextLayerGraph.tsx'
import type { GraphData } from '../src/client/types.ts'

// Mock @antv/g6 with a controllable Graph whose render() returns a fresh
// DEFERRED promise each call — the test decides when render resolves, so it
// can unmount before the .then(applyLOD) would fire. vi.hoisted keeps the
// mock + latest resolver accessible to the (hoisted) vi.mock factory.
const { mockGraph, resolveCurrentRender } = vi.hoisted(() => {
  let currentResolve: () => void = () => {}
  const mockGraph = {
    on: vi.fn(),
    getZoom: vi.fn().mockReturnValue(1),
    setData: vi.fn(),
    render: vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { currentResolve = resolve }),
    ),
    destroy: vi.fn(),
    getNodeData: vi.fn().mockReturnValue([{ id: 'n1' }]),
    getComboData: vi.fn().mockReturnValue([]),
    updateNodeData: vi.fn(),
    collapseElement: vi.fn(),
    expandElement: vi.fn(),
    resize: vi.fn(),
  }
  return { mockGraph, resolveCurrentRender: () => { currentResolve() } }
})

vi.mock('@antv/g6', () => ({
  Graph: vi.fn().mockImplementation(function () {
    return mockGraph
  }),
}))

const DATA: GraphData = {
  nodes: [{ id: 'n1', kind: 'dws', label: 'Node1', domains: ['core'] }],
  edges: [],
}

describe('ContextLayerGraph — render().then unmount race (ucl-9)', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; the resize effect constructs one on mount.
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(function () {
        return {
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        }
      }),
    )
  })

  beforeEach(() => {
    vi.clearAllMocks() // reset call counts, keep mock implementations
  })

  it('does not applyLOD on the destroyed graph when unmounted before render resolves', async () => {
    const { unmount } = render(<ContextLayerGraph data={DATA} />)

    // The data effect ran on mount and called render() — its promise is pending.
    expect(mockGraph.render).toHaveBeenCalledTimes(1)

    // Unmount before render resolves. The init effect's cleanup destroys the
    // graph; the data effect's .then(applyLOD) still closes over that graph.
    unmount()

    // Now resolve render. Before the fix there was no cancelled flag, so the
    // .then fired applyLOD on the destroyed graph (calling updateNodeData).
    await act(async () => {
      resolveCurrentRender()
      await Promise.resolve()
      await Promise.resolve()
    })

    // applyLOD would call updateNodeData — it must NOT have run post-unmount.
    expect(mockGraph.updateNodeData).not.toHaveBeenCalled()
  })

  it('applies LOD after render resolves on a normal mount (no unmount)', async () => {
    const { unmount } = render(<ContextLayerGraph data={DATA} />)
    expect(mockGraph.render).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCurrentRender()
      await Promise.resolve()
      await Promise.resolve()
    })

    // applyLOD ran → updateNodeData called with the (non-empty) LOD update for
    // n1. Seeding getNodeData([{id:'n1'}] above makes this a real assertion:
    // a stub applyLOD that no-ops updateNodeData([]) would NOT pass it.
    expect(mockGraph.updateNodeData).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'n1' })]),
    )
    unmount()
  })
})
