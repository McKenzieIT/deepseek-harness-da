/**
 * ContextLayerGraph — base G6 v5 React component for the context-layer
 * interactive relation graph.
 *
 * Responsibilities:
 *  1. Mount a G6 Graph instance into a container div.
 *  2. Configure combo-force layout (domain clusters as combos).
 *  3. Handle semantic-zoom LOD switching (far/mid/near) on zoom events.
 *  4. Apply node/edge/combo styles from graph-styles.ts.
 *  5. Expose click/double-click callbacks for detail panel + focus navigation.
 *  6. Support domain filter (hide/show combos + their nodes).
 *  7. Render minimap plugin.
 *
 * Does NOT handle: conversation panel, animation layer, evidence overlay,
 * or any W11 features.
 */
import { useEffect, useRef, useState } from 'react'
import { Graph, type IElementEvent } from '@antv/g6'
import {
  getLayoutConfig,
  getZoomLevel,
  getLODConfig,
  type ZoomLevel,
} from './graph-layout.ts'
import {
  nodeStyle,
  edgeStyle,
  comboStyle,
} from './graph-styles.ts'
import type { GraphData, GraphNode, GraphEdge } from './types.ts'

export interface ContextLayerGraphProps {
  /** Graph data (nodes + edges) from getGraphData RPC. */
  data: GraphData | null
  /** Currently active domain filter (undefined = show all). */
  domainFilter?: string
  /** Callback when a node is clicked (opens detail panel). */
  onNodeClick?: (nodeId: string) => void
  /** Callback when a node is double-clicked (focus + expand neighbors). */
  onNodeDoubleClick?: (nodeId: string) => void
  /** Callback with the G6 Graph instance once initialized. */
  onGraphReady?: (graph: Graph) => void
  /** Container width (defaults to 100%). */
  width?: number | string
  /** Container height (defaults to 100%). */
  height?: number | string
}

/**
 * Transform GraphData into G6-compatible data structure with combos.
 */
function toG6Data(data: GraphData, domainFilter?: string) {
  // Build domain set for combo generation
  const domainSet = new Set<string>()
  for (const node of data.nodes) {
    for (const d of node.domains) domainSet.add(d)
  }
  const domainList = [...domainSet].sort()
  const domainIndexMap = new Map(domainList.map((d, i) => [d, i]))

  // Filter nodes by domain if filter is active
  const filteredNodes = domainFilter
    ? data.nodes.filter(n => n.domains.includes(domainFilter))
    : data.nodes

  const nodeIds = new Set(filteredNodes.map(n => n.id))

  // Filter edges to only include those between visible nodes
  const filteredEdges = data.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target),
  )

  // Build combos from domains
  const activeDomains = domainFilter
    ? [domainFilter]
    : domainList

  const combos = activeDomains.map((name, _idx) => ({
    id: `combo-${name}`,
    label: name,
    style: comboStyle(domainIndexMap.get(name) ?? 0),
  }))

  // Map nodes with primary domain → combo assignment
  const nodes = filteredNodes.map(n => ({
    id: n.id,
    label: n.label,
    combo: `combo-${n.domains[0] ?? 'unknown'}`,
    data: {
      kind: n.kind,
      evalPassRate: n.evalPassRate,
      domains: n.domains,
    },
    style: nodeStyle(n.kind, n.evalPassRate),
  }))

  // Map edges
  const edges = filteredEdges.map((e, idx) => ({
    id: `edge-${idx}`,
    source: e.source,
    target: e.target,
    data: { type: e.type, on: e.on },
    style: edgeStyle(false),
  }))

  return { nodes, edges, combos }
}

/**
 * Apply LOD changes to the graph based on current zoom level.
 * Updates node label visibility, badge visibility, and combo collapse state.
 */
function applyLOD(graph: Graph, level: ZoomLevel): void {
  const lod = getLODConfig(level)

  // Update all nodes' label visibility (batched)
  const nodeData = graph.getNodeData()
  const nodeUpdates = nodeData.map(node => ({
    id: node.id,
    style: {
      labelText: lod.showLabel ? (node as { label?: string }).label ?? '' : '',
      size: 32 * lod.nodeScale,
    },
  }))
  graph.updateNodeData(nodeUpdates)

  // Update combo collapse state
  const comboData = graph.getComboData()
  for (const combo of comboData) {
    if (lod.combosCollapsed) {
      graph.collapseElement(combo.id)
    } else {
      graph.expandElement(combo.id)
    }
  }
}

/**
 * Base G6 v5 graph component for the context layer.
 */
export function ContextLayerGraph({
  data,
  domainFilter,
  onNodeClick,
  onNodeDoubleClick,
  onGraphReady,
  width = '100%',
  height = '100%',
}: ContextLayerGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const [currentZoomLevel, setCurrentZoomLevel] = useState<ZoomLevel>('mid')
  const zoomLevelRef = useRef<ZoomLevel>(currentZoomLevel)
  zoomLevelRef.current = currentZoomLevel

  // Initialize graph
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const graph = new Graph({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
      // Fit view on initial render
      autoFit: 'view',
      // Layout
      layout: getLayoutConfig(),
      // Behaviors (interactions v1)
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'drag-element',
      ],
      // Plugins
      plugins: [
        {
          type: 'minimap',
          key: 'minimap',
          size: [160, 120],
          position: 'right-bottom' as const,
        },
      ],
      // Node default style
      node: {
        type: 'circle',
        style: {
          size: 32,
          labelPlacement: 'bottom',
          labelFontSize: 12,
        },
      },
      // Edge default style
      edge: {
        type: 'line',
        style: {
          endArrow: true,
        },
      },
      // Combo default style
      combo: {
        type: 'rect',
        style: {
          radius: 8,
          padding: 20,
          labelFontSize: 14,
          labelPlacement: 'top',
        },
      },
    })

    graphRef.current = graph
    onGraphReady?.(graph)

    // Handle zoom event for semantic LOD switching
    graph.on('afterTransform', () => {
      const zoom = graph.getZoom()
      const newLevel = getZoomLevel(zoom)
      if (newLevel !== zoomLevelRef.current) {
        setCurrentZoomLevel(newLevel)
        applyLOD(graph, newLevel)
      }
    })

    // Node click handler (G6 v5: node ID is on evt.itemId)
    graph.on<IElementEvent & { itemId?: string }>('node:click', (evt) => {
      const itemId = evt.itemId
      if (itemId) onNodeClick?.(itemId)
    })

    // Node double-click handler
    graph.on<IElementEvent & { itemId?: string }>('node:dblclick', (evt) => {
      const itemId = evt.itemId
      if (itemId) onNodeDoubleClick?.(itemId)
    })

    return () => {
      try { graph.destroy() } catch { /* guard against double-destroy during async render */ }
      graphRef.current = null
    }
  }, [])

  // Update data when it changes
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !data) return

    const g6Data = toG6Data(data, domainFilter)
    graph.setData(g6Data)
    graph.render().then(() => {
      // Apply current LOD state after render completes
      applyLOD(graph, zoomLevelRef.current)
    })
  }, [data, domainFilter])

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width: w, height: h } = entry.contentRect
      graphRef.current?.resize(w, h)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        minHeight: 400,
        position: 'relative',
      }}
    />
  )
}

export type { GraphData, GraphNode, GraphEdge }
