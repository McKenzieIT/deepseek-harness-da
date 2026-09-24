// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SemanticGraphData as GraphData, SemanticGraphNodeId } from '@deepseek-ai/dsh-schema-gateway/types'
import { ContextLayerGraph } from '../src/client/ContextLayerGraph.tsx'
import { createGraphPresentationRegistry } from '../src/client/graph-presentation.ts'
import { GENERIC_EDGE_COLOR, GENERIC_NODE_COLOR } from '../src/client/graph-styles.ts'
import { en, type ContextLayerKey } from '../src/client/locales.ts'

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

const t = (key: ContextLayerKey): string => en[key]
const presentation = createGraphPresentationRegistry()

/** Branding only the id keeps every other fixture field under field-level typechecking. */
const id = (value: string): SemanticGraphNodeId => brandString<SemanticGraphNodeId>(value)

const DATA: GraphData = {
  nodes: [{ id: id('n1'), kind: 'dws', label: 'Node1', domains: ['core'] }],
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
    const { unmount } = render(<ContextLayerGraph data={DATA} t={t} presentation={presentation} />)

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
    const { unmount } = render(<ContextLayerGraph data={DATA} t={t} presentation={presentation} />)
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

describe('ContextLayerGraph — open-kind styling through the presentation seam (W27)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** The G6 payload the component pushed through setData on mount. */
  function pushedData(): {
    nodes: { data: Record<string, unknown>; style: Record<string, unknown> }[]
    edges: { style: Record<string, unknown> }[]
  } {
    return mockGraph.setData.mock.calls[0]?.[0] as ReturnType<typeof pushedData>
  }

  it('styles known node and relation kinds from their registered presentation', () => {
    const data: GraphData = {
      nodes: [
        { id: id('n1'), kind: 'dws', label: 'Orders', domains: ['core'] },
        { id: id('n2'), kind: 'metric', label: 'DAU', domains: ['core'] },
      ],
      edges: [{ source: id('n1'), target: id('n2'), type: 'derived_from' }],
    }
    const { unmount } = render(<ContextLayerGraph data={data} t={t} presentation={presentation} />)

    const pushed = pushedData()
    expect(pushed.nodes[0]?.style.fill).toBe(presentation.resolveNode(data.nodes[0]!, t).style.fill)
    expect(pushed.nodes[0]?.style.fill).not.toBe(GENERIC_NODE_COLOR)
    // The edge wears the relation kind's stroke and carries its localized label.
    expect(pushed.edges[0]?.style.stroke).toBe(presentation.resolveRelation(data.edges[0]!, t).style.stroke)
    expect(pushed.edges[0]?.style.labelText).toBe(en['relation.derivedFrom'])
    unmount()
  })

  // W27 acceptance 3 on the canvas: an unregistered node kind renders with the
  // generic fill, and an unregistered relation kind gets the generic stroke plus
  // its raw kind string as its accessible edge label. Before this, edgeStyle
  // never saw e.type at all, so an unknown relation had no label.
  it('falls back generically for unregistered node and relation kinds, keeping the edge label', () => {
    const data: GraphData = {
      nodes: [
        { id: id('n1'), kind: 'sankey_chart', label: 'Weekly Flow', domains: ['core'] },
        { id: id('n2'), kind: 'dws', label: 'Orders', domains: ['core'] },
      ],
      edges: [{ source: id('n1'), target: id('n2'), type: 'visualizes' }],
    }
    const { unmount } = render(<ContextLayerGraph data={data} t={t} presentation={presentation} />)

    const pushed = pushedData()
    expect(pushed.nodes[0]?.style.fill).toBe(GENERIC_NODE_COLOR)
    expect(pushed.edges[0]?.style.stroke).toBe(GENERIC_EDGE_COLOR)
    expect(pushed.edges[0]?.style.labelText).toBe('visualizes')
    unmount()
  })

  // The overlay hook restores the normal fill from the payload rather than
  // re-deriving it from a business field, so the graph core reads no node kind.
  it('carries the resolved fill on the node payload for the overlay to restore', () => {
    const data: GraphData = {
      nodes: [{ id: id('n1'), kind: 'sankey_chart', label: 'Weekly Flow', domains: ['core'] }],
      edges: [],
    }
    const { unmount } = render(<ContextLayerGraph data={data} t={t} presentation={presentation} />)
    expect(pushedData().nodes[0]?.data.fill).toBe(GENERIC_NODE_COLOR)
    expect(pushedData().nodes[0]?.data.kind).toBeUndefined()
    unmount()
  })
})
