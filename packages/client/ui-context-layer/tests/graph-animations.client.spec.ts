// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Graph } from '@antv/g6'
import { fadeIn, useGraphAnimations, useOverlayMode } from '../src/client/graph-animations.ts'
import { GENERIC_NODE_COLOR, evalBorderColor } from '../src/client/graph-styles.ts'
import type { GraphUpdate } from '../src/client/narration-gate.ts'

// Controllable requestAnimationFrame: store callbacks in a queue keyed by
// handle so the test decides when (and whether) a frame fires. cancelAnimationFrame
// removes a callback from the queue — the behavior under test.
const rafQueue = new Map<number, FrameRequestCallback>()
let rafHandle = 0

function flushRaf(): void {
  // Fire a copy of the pending callbacks; clear so a second flush is a no-op.
  const pending = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of pending) cb(0)
}

function makeMockGraph(nodes: Array<{ id: string }>) {
  return {
    getNodeData: vi.fn().mockReturnValue(nodes),
    getEdgeData: vi.fn().mockReturnValue([]),
    updateNodeData: vi.fn(),
    updateEdgeData: vi.fn(),
    draw: vi.fn(),
  }
}

describe('graph-animations — fadeIn rAF leak (ucl-10)', () => {
  beforeEach(() => {
    rafQueue.clear()
    rafHandle = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++rafHandle
      rafQueue.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fadeIn returns a cancel fn that cancels the pending restore rAF', () => {
    const graph = makeMockGraph([{ id: 'n1' }])
    const cancel = fadeIn(graph as unknown as Graph, ['n1'])

    // Immediate opacity-0 is applied synchronously (before the rAF fires).
    expect(graph.updateNodeData).toHaveBeenCalledTimes(1)
    expect(graph.draw).toHaveBeenCalledTimes(1)

    // Cancel the pending restore before the frame fires. Before the fix
    // fadeIn returned void, so `cancel` was undefined and this was a no-op —
    // the rAF then fired the opacity-1 restore on a graph that may be gone.
    expect(typeof cancel).toBe('function')
    cancel()

    // Fire any pending frames. fadeIn's restore was cancelled, so the graph
    // must NOT receive a second updateNodeData (opacity-1) call.
    flushRaf()
    expect(graph.updateNodeData).toHaveBeenCalledTimes(1)
  })

  it('useGraphAnimations cancels pending fadeIn rAFs on unmount', () => {
    const graph = makeMockGraph([{ id: 'n1' }])
    const release: GraphUpdate = {
      type: 'add_nodes',
      items: [{ id: 'n1' }],
      source: 'discover_relations',
    }

    const { rerender, unmount } = renderHook(
      ({ g, r }: { g: Graph; r: readonly GraphUpdate[] }) => { useGraphAnimations(g, r) },
      { initialProps: { g: graph as unknown as Graph, r: [] as GraphUpdate[] } },
    )

    // No release yet — nothing animated.
    expect(graph.updateNodeData).toHaveBeenCalledTimes(0)

    // Release an add_nodes batch → fadeIn applies opacity-0 and schedules a
    // restore rAF.
    rerender({ g: graph as unknown as Graph, r: [release] })
    expect(graph.updateNodeData).toHaveBeenCalledTimes(1)

    // Unmount. The cleanup must cancel the pending fadeIn rAF so it does not
    // fire updateNodeData on the destroyed graph. Before the fix the cleanup
    // only cancelled blink/pulse cancellers, so the rAF leaked.
    unmount()
    flushRaf()

    // Still exactly 1 call — the opacity-1 restore never fired post-unmount.
    expect(graph.updateNodeData).toHaveBeenCalledTimes(1)
  })
})

describe('graph-animations — useOverlayMode reads no node kind (W27)', () => {
  /** A G6 node payload as ContextLayerGraph.toG6Data writes it. */
  function payloadNode(id: string, data: Record<string, unknown>) {
    return { id, data }
  }

  it('restores the presentation-resolved fill the payload carries', () => {
    const graph = makeMockGraph([payloadNode('n1', { fill: '#13c2c2', evalPassRate: 0.5 })])
    const { result } = renderHook(() => useOverlayMode(graph as unknown as Graph))

    expect(result.current.mode).toBe('off')
    // `off` restores data.fill verbatim: the hook never re-derives a fill from a
    // node kind, so a kind registered only in the presentation registry still
    // survives leaving an overlay.
    expect(graph.updateNodeData).toHaveBeenCalledWith([{
      id: 'n1',
      style: { fill: '#13c2c2', stroke: evalBorderColor(0.5), lineWidth: 3 },
    }])
  })

  // A payload whose `data` compartment lost its fill (or carries a non-string)
  // must still yield a CSS color string, not `undefined` or a prototype member.
  it('falls back to the generic color when the payload carries no usable fill', () => {
    const graph = makeMockGraph([payloadNode('n1', { fill: 42 })])
    renderHook(() => useOverlayMode(graph as unknown as Graph))
    expect(graph.updateNodeData).toHaveBeenCalledWith([{
      id: 'n1',
      style: { fill: GENERIC_NODE_COLOR, stroke: evalBorderColor(undefined), lineWidth: 1 },
    }])
  })

  it('colors by eval data in coverage mode and by pass rate in heatmap mode', () => {
    const graph = makeMockGraph([
      payloadNode('withEval', { fill: '#13c2c2', evalPassRate: 1 }),
      payloadNode('noEval', { fill: '#13c2c2' }),
    ])
    const { result } = renderHook(() => useOverlayMode(graph as unknown as Graph))

    act(() => { result.current.setMode('coverage') })
    const coverage = graph.updateNodeData.mock.lastCall?.[0] as { style: { fill: string } }[]
    expect(coverage[0]?.style.fill).not.toBe(coverage[1]?.style.fill)

    act(() => { result.current.setMode('heatmap') })
    const heatmap = graph.updateNodeData.mock.lastCall?.[0] as { style: { fill: string } }[]
    expect(heatmap[0]?.style.fill).toBe(evalBorderColor(1))
  })

  it('does nothing without a graph or without nodes', () => {
    renderHook(() => useOverlayMode(null))
    const empty = makeMockGraph([])
    renderHook(() => useOverlayMode(empty as unknown as Graph))
    expect(empty.updateNodeData).not.toHaveBeenCalled()
  })
})
