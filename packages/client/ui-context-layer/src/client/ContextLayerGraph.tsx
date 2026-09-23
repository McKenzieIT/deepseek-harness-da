/**
 * ContextLayerGraph — base G6 v5 React component for the context-layer
 * interactive relation graph.
 *
 * Responsibilities:
 *  1. Mount a G6 Graph instance into a container div.
 *  2. Configure combo-force layout (domain clusters as combos).
 *  3. Handle semantic-zoom LOD switching (far/mid/near) on zoom events.
 *  4. Map resolved presentations onto G6 node/edge styles, and combo styles
 *     from graph-styles.ts.
 *  5. Expose click/double-click callbacks for detail panel + focus navigation.
 *  6. Support domain filter (hide/show combos + their nodes).
 *  7. Render minimap plugin.
 *
 * Node and relation kinds reach the canvas only through the presentation
 * registry: the component reads `kind`/`type` as opaque registry keys and never
 * interprets a table, metric, or concept field itself. The resolved fill rides
 * on the G6 node payload so the diagnostic overlay can restore it without
 * re-deriving it from business data (W27).
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
import type { GraphPresentationReader } from './graph-presentation.ts'
import type { ContextLayerTranslate } from './locales.ts'
import type { SemanticGraphData as GraphData, SemanticGraphNode as GraphNode, SemanticGraphEdge as GraphEdge } from '@deepseek-ai/dsh-schema-gateway/types'

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
  /** Resolves the node and relation kinds present in `data`. */
  presentation: GraphPresentationReader
  /** Localized copy for the resolved kind labels. */
  t: ContextLayerTranslate
}

/**
 * Transform GraphData into G6-compatible data structure with combos.
 */
function toG6Data(
  data: GraphData,
  presentation: GraphPresentationReader,
  t: ContextLayerTranslate,
  domainFilter?: string,
) {
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
  const nodes = filteredNodes.map((n) => {
    const resolved = presentation.resolveNode(n, t)
    return {
      id: n.id,
      label: n.label,
      // ui-context-layer-3: when a domainFilter is active, assign every filtered
      // node to the filter's combo — a node whose domains[0] differs from the
      // filter domain would otherwise reference an uncreated combo.
      combo: `combo-${domainFilter ?? n.domains[0] ?? 'unknown'}`,
      // The payload carries the RESOLVED fill, not the kind: useOverlayMode
      // restores it when leaving a diagnostic overlay, so the animation layer
      // never has to re-resolve a kind. evalPassRate is the overlay's own
      // subject and stays.
      data: {
        fill: resolved.style.fill,
        evalPassRate: n.evalPassRate,
        domains: n.domains,
      },
      style: nodeStyle(resolved.style),
    }
  })

  // Map edges. `labelText` is the relation's accessible label: the kind's
  // localized name when one is registered, else its raw kind string, so an
  // unregistered relation kind is still named on the canvas (W27).
  const edges = filteredEdges.map((e, idx) => {
    const resolved = presentation.resolveRelation(e, t)
    return {
      id: `edge-${idx}`,
      source: e.source,
      target: e.target,
      data: { type: e.type, on: e.on },
      style: { ...edgeStyle(resolved.style), labelText: resolved.label },
    }
  })

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
      void graph.collapseElement(combo.id)
    } else {
      void graph.expandElement(combo.id)
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
  presentation,
  t,
}: ContextLayerGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const [currentZoomLevel, setCurrentZoomLevel] = useState<ZoomLevel>('mid')
  const zoomLevelRef = useRef<ZoomLevel>(currentZoomLevel)
  zoomLevelRef.current = currentZoomLevel

  // ui-context-layer-1: keep the latest click callbacks in refs so the G6
  // handlers (registered once in the mount effect) always invoke the current
  // closure. Without this the `[]`-deps init effect captures the mount-render
  // onNodeClick; ContextLayerView's handleNodeClick depends on [data] and bails
  // while data is null (the overlay load path), so the captured handler bails
  // forever and node click never opens the detail panel.
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick)
  onNodeDoubleClickRef.current = onNodeDoubleClick

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

    // Node click handler (G6 v5: node ID is on evt.target.id; evt.itemId does
    // not exist in 5.1.1). Read the callback from the ref so the latest
    // onNodeClick closure is used (ui-context-layer-1 stale-closure fix).
    graph.on<IElementEvent>('node:click', (evt) => {
      const itemId = evt.target.id
      if (itemId) onNodeClickRef.current?.(itemId)
    })

    // Node double-click handler (same ref-latest pattern).
    graph.on<IElementEvent>('node:dblclick', (evt) => {
      const itemId = evt.target.id
      if (itemId) onNodeDoubleClickRef.current?.(itemId)
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

    const g6Data = toG6Data(data, presentation, t, domainFilter)
    graph.setData(g6Data)
    // ucl-9: guard the post-render LOD apply against unmount / data-change
    // races. The init effect's cleanup calls graph.destroy() + nulls
    // graphRef, but this .then still closes over the local `graph` const —
    // without a cancelled flag it would run applyLOD on the destroyed/stale
    // graph, and a rejected render promise would surface as an unhandled
    // rejection. The flag is set in this effect's cleanup (runs on unmount
    // and on every data/domainFilter change).
    let cancelled = false
    void graph.render()
      .then(() => {
        if (cancelled) return
        applyLOD(graph, zoomLevelRef.current)
      })
      .catch(() => {
        // render failed (e.g. graph torn down mid-render) — nothing to apply.
      })
    return () => {
      cancelled = true
    }
    // `t` is a fresh reference per locale revision and stable within one, so
    // listing it re-labels the canvas on a locale switch without churning on
    // unrelated re-renders. `presentation` is the handle the plugin creates once
    // in apply.
  }, [data, domainFilter, presentation, t])

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
    return () =>{  observer.disconnect() }
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
