/**
 * Graph Animation Layer — W11 D5
 *
 * Provides animation utilities triggered by Narration Gate releases:
 *  - fadeIn: opacity 0→1 for newly added nodes/edges
 *  - dashedHighlight: dashed stroke for reachability preview edges
 *  - pulseNode: red pulsing ring for degradation alert
 *  - blinkNodes: rapid opacity toggle for "evaluating" state
 *  - focusWithZoom: smooth pan + zoom to center on a node
 *
 * The `useGraphAnimations` hook consumes released batches from the narration
 * gate and dispatches the appropriate animation per update type.
 *
 * The `useOverlayMode` hook manages the diagnostic overlay state:
 *  - off: default styling
 *  - coverage: color nodes by whether they have eval data
 *  - heatmap: color nodes by pass-rate gradient
 *
 * @module graph-animations
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Graph } from '@antv/g6'
import type { GraphUpdate } from './narration-gate.ts'
import { evalBorderColor, KIND_COLORS, type NodeKind } from './graph-styles.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FADE_DURATION = 400
const BLINK_INTERVAL = 300
const PULSE_DURATION = 1500
const PULSE_RING_EXPAND = 20
const FOCUS_ZOOM_LEVEL = 1.5
const FOCUS_ANIMATION_DURATION = 600

/** Color used for degradation pulse ring. */
const DEGRADATION_COLOR = '#ff4d4f'

/** Color for coverage overlay: nodes WITH eval data. */
const COVERAGE_HAS_EVAL = '#52c41a'
/** Color for coverage overlay: nodes WITHOUT eval data. */
const COVERAGE_NO_EVAL = '#bfbfbf'

// ---------------------------------------------------------------------------
// Animation utilities
// ---------------------------------------------------------------------------

/**
 * Fade in nodes/edges by animating opacity from 0 to 1.
 * Uses G6 v5's updateData + animation config.
 */
export function fadeIn(
  graph: Graph,
  elementIds: string[],
  duration = DEFAULT_FADE_DURATION,
): void {
  if (!graph || elementIds.length === 0) return

  // Set initial opacity to 0
  const nodeData = graph.getNodeData()
  const edgeData = graph.getEdgeData()
  const nodeIds = new Set(nodeData.map(n => n.id))
  const edgeIds = new Set(edgeData.map(e => e.id))

  const nodeUpdates: Array<{ id: string; style: Record<string, unknown> }> = []
  const edgeUpdates: Array<{ id: string; style: Record<string, unknown> }> = []

  for (const id of elementIds) {
    if (nodeIds.has(id)) {
      nodeUpdates.push({ id, style: { opacity: 0 } })
    } else if (edgeIds.has(id)) {
      edgeUpdates.push({ id, style: { opacity: 0 } })
    }
  }

  // Apply opacity 0 immediately
  if (nodeUpdates.length > 0) graph.updateNodeData(nodeUpdates)
  if (edgeUpdates.length > 0) graph.updateEdgeData(edgeUpdates)

  // Animate to opacity 1 after a microtask (let the 0-opacity render)
  requestAnimationFrame(() => {
    const nodeRestore = nodeUpdates.map(u => ({ id: u.id, style: { opacity: 1 } }))
    const edgeRestore = edgeUpdates.map(u => ({ id: u.id, style: { opacity: 1 } }))

    if (nodeRestore.length > 0) {
      graph.updateNodeData(nodeRestore)
    }
    if (edgeRestore.length > 0) {
      graph.updateEdgeData(edgeRestore)
    }

    // G6 v5 supports animation via the graph's animation config. If the graph
    // has animation enabled (default), updateData transitions are animated.
    // We set a transition duration on the elements via style.
    // Fallback: the opacity jump from 0→1 will be handled by G6's built-in
    // transition if `animation: true` is set on the graph instance.
    void duration
  })
}

/**
 * Apply dashed stroke style to edges for reachability preview.
 * The dashed style persists until explicitly cleared.
 */
export function dashedHighlight(graph: Graph, edgeIds: string[]): void {
  if (!graph || edgeIds.length === 0) return

  const updates = edgeIds.map(id => ({
    id,
    style: {
      lineDash: [6, 4],
      stroke: '#1890ff',
      lineWidth: 2,
      opacity: 0.85,
    },
  }))

  graph.updateEdgeData(updates)
}

/**
 * Clear dashed highlight from edges (restore normal style).
 */
export function clearDashedHighlight(graph: Graph, edgeIds: string[]): void {
  if (!graph || edgeIds.length === 0) return

  const updates = edgeIds.map(id => ({
    id,
    style: {
      lineDash: undefined,
      stroke: 'rgba(0,0,0,0.45)',
      lineWidth: 1,
      opacity: 1,
    },
  }))

  graph.updateEdgeData(updates)
}

/**
 * Pulse a colored ring around nodes to signal degradation or alerts.
 * Uses a setInterval-based expand+fade cycle. Returns a cancel function.
 */
export function pulseNode(
  graph: Graph,
  nodeIds: string[],
  color = DEGRADATION_COLOR,
): () => void {
  if (!graph || nodeIds.length === 0) return () => {}

  let frame = 0
  const totalFrames = Math.ceil(PULSE_DURATION / 50) // ~50ms per frame
  let cancelled = false

  const animate = () => {
    if (cancelled) return
    frame = (frame + 1) % totalFrames
    const progress = frame / totalFrames
    // Ring expands and fades out over the cycle
    const ringSize = 32 + PULSE_RING_EXPAND * progress
    const ringOpacity = 1 - progress

    const updates = nodeIds.map(id => ({
      id,
      style: {
        stroke: color,
        lineWidth: 3 + (1 - progress) * 3,
        shadowColor: color,
        shadowBlur: ringSize * ringOpacity,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      },
    }))

    graph.updateNodeData(updates)
    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)

  // Auto-stop after 3 full cycles
  const timeout = setTimeout(() => {
    cancelled = true
    // Restore normal stroke
    const restore = nodeIds.map(id => ({
      id,
      style: {
        lineWidth: 3,
        shadowColor: 'transparent',
        shadowBlur: 0,
      },
    }))
    graph.updateNodeData(restore)
  }, PULSE_DURATION * 3)

  return () => {
    cancelled = true
    clearTimeout(timeout)
    const restore = nodeIds.map(id => ({
      id,
      style: {
        lineWidth: 3,
        shadowColor: 'transparent',
        shadowBlur: 0,
      },
    }))
    graph.updateNodeData(restore)
  }
}

/**
 * Blink nodes by toggling opacity rapidly to indicate "evaluating" state.
 * Returns a cancel function that stops blinking and restores full opacity.
 */
export function blinkNodes(graph: Graph, nodeIds: string[]): () => void {
  if (!graph || nodeIds.length === 0) return () => {}

  let visible = true
  const intervalId = setInterval(() => {
    visible = !visible
    const updates = nodeIds.map(id => ({
      id,
      style: { opacity: visible ? 1 : 0.3 },
    }))
    graph.updateNodeData(updates)
  }, BLINK_INTERVAL)

  return () => {
    clearInterval(intervalId)
    // Restore full opacity
    const restore = nodeIds.map(id => ({
      id,
      style: { opacity: 1 },
    }))
    graph.updateNodeData(restore)
  }
}

/**
 * Smooth pan + zoom to center on a specific node.
 * Uses G6 v5's focusElement API with animation.
 */
export function focusWithZoom(graph: Graph, nodeId: string): void {
  if (!graph) return

  graph.focusElement(nodeId, {
    duration: FOCUS_ANIMATION_DURATION,
    easing: 'ease-in-out',
  })

  // Adjust zoom to bring the node into clear view
  const currentZoom = graph.getZoom()
  if (currentZoom < FOCUS_ZOOM_LEVEL) {
    graph.zoomTo(FOCUS_ZOOM_LEVEL, {
      duration: FOCUS_ANIMATION_DURATION,
      easing: 'ease-in-out',
    })
  }
}

// ---------------------------------------------------------------------------
// useGraphAnimations hook
// ---------------------------------------------------------------------------

/**
 * Hook that consumes released GraphUpdate batches from the Narration Gate
 * and dispatches the appropriate animation for each update type.
 *
 * Animation mapping:
 *  - add_nodes → fadeIn
 *  - add_edges → fadeIn
 *  - update_nodes with evalStatus: 'running' → blinkNodes
 *  - update_nodes with evalStatus: 'degraded' → pulseNode (red) + focusWithZoom
 *  - update_nodes with reachabilityPreview edges → dashedHighlight
 *
 * @param graph - the G6 graph instance (null if not yet mounted)
 * @param released - released updates from useNarrationGate
 */
export function useGraphAnimations(
  graph: Graph | null,
  released: readonly GraphUpdate[],
): void {
  // Track which batches we've already processed (by array length/identity)
  const processedCountRef = useRef(0)
  // Track active blink cancellers keyed by node id
  const activeBlinkRef = useRef<Map<string, () => void>>(new Map())
  // Track active pulse cancellers keyed by node id
  const activePulseRef = useRef<Map<string, () => void>>(new Map())
  // Track dashed-highlight edge ids for session-level persistence
  const dashedEdgesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!graph) return
    if (released.length <= processedCountRef.current) return

    // Process only the new (unprocessed) updates
    const newUpdates = released.slice(processedCountRef.current)
    processedCountRef.current = released.length

    for (const update of newUpdates) {
      const ids = update.items.map(item => item.id)

      switch (update.type) {
        case 'add_nodes':
          fadeIn(graph, ids)
          break

        case 'add_edges':
          fadeIn(graph, ids)
          break

        case 'update_nodes':
          for (const item of update.items) {
            const nodeId = item.id

            // Reachability preview — highlight associated edges
            if (item.reachabilityPreview === true) {
              // The item may include edge ids to highlight
              const previewEdges = item.previewEdgeIds as string[] | undefined
              if (previewEdges && previewEdges.length > 0) {
                dashedHighlight(graph, previewEdges)
                for (const eid of previewEdges) dashedEdgesRef.current.add(eid)
              }
            }

            // Eval status animations
            const evalStatus = item.evalStatus as string | undefined

            if (evalStatus === 'running') {
              // Stop any existing blink for this node first
              activeBlinkRef.current.get(nodeId)?.()
              const cancel = blinkNodes(graph, [nodeId])
              activeBlinkRef.current.set(nodeId, cancel)
            } else if (evalStatus === 'degraded') {
              // Stop any existing blink (eval finished)
              activeBlinkRef.current.get(nodeId)?.()
              activeBlinkRef.current.delete(nodeId)
              // Start degradation pulse
              activePulseRef.current.get(nodeId)?.()
              const cancel = pulseNode(graph, [nodeId], DEGRADATION_COLOR)
              activePulseRef.current.set(nodeId, cancel)
              // Auto-focus on the degraded node
              focusWithZoom(graph, nodeId)
            } else if (evalStatus === 'settled' || evalStatus === 'passed') {
              // Eval completed without degradation — stop animations
              activeBlinkRef.current.get(nodeId)?.()
              activeBlinkRef.current.delete(nodeId)
              activePulseRef.current.get(nodeId)?.()
              activePulseRef.current.delete(nodeId)
            }
          }
          break

        case 'remove_nodes':
          // Clean up any running animations for removed nodes
          for (const item of update.items) {
            activeBlinkRef.current.get(item.id)?.()
            activeBlinkRef.current.delete(item.id)
            activePulseRef.current.get(item.id)?.()
            activePulseRef.current.delete(item.id)
          }
          break
      }
    }
  }, [graph, released])

  // Cleanup all animations on unmount
  useEffect(() => {
    return () => {
      for (const cancel of activeBlinkRef.current.values()) cancel()
      activeBlinkRef.current.clear()
      for (const cancel of activePulseRef.current.values()) cancel()
      activePulseRef.current.clear()
    }
  }, [])
}

// ---------------------------------------------------------------------------
// Overlay mode
// ---------------------------------------------------------------------------

/** Diagnostic overlay modes for the graph. */
export type OverlayMode = 'off' | 'coverage' | 'heatmap'

export interface OverlayModeState {
  /** Current overlay mode. */
  mode: OverlayMode
  /** Switch to a different overlay mode. */
  setMode: (mode: OverlayMode) => void
}

/**
 * Hook that manages the diagnostic overlay mode for the graph.
 *
 * - off: normal styling (kind-based fill + eval border)
 * - coverage: binary coloring — green if node has eval data, gray if not
 * - heatmap: pass-rate gradient fill (red→yellow→green)
 *
 * When mode changes, all nodes are re-styled accordingly.
 *
 * @param graph - the G6 graph instance (null if not yet mounted)
 */
export function useOverlayMode(graph: Graph | null): OverlayModeState {
  const [mode, setModeInternal] = useState<OverlayMode>('off')

  const setMode = useCallback((newMode: OverlayMode) => {
    setModeInternal(newMode)
  }, [])

  // Apply overlay styling when mode or graph changes
  useEffect(() => {
    if (!graph) return

    const nodeData = graph.getNodeData()
    if (!nodeData || nodeData.length === 0) return

    const updates = nodeData.map((node) => {
      const data = (node as { data?: Record<string, unknown> }).data ?? {}
      const kind = (data.kind ?? 'dws') as NodeKind
      const evalPassRate = data.evalPassRate as number | undefined

      switch (mode) {
        case 'off':
          // Restore normal kind-based styling
          return {
            id: node.id,
            style: {
              fill: KIND_COLORS[kind],
              stroke: evalBorderColor(evalPassRate),
              lineWidth: evalPassRate !== undefined ? 3 : 1,
            },
          }

        case 'coverage':
          // Binary: has eval data or not
          return {
            id: node.id,
            style: {
              fill: evalPassRate !== undefined ? COVERAGE_HAS_EVAL : COVERAGE_NO_EVAL,
              stroke: evalPassRate !== undefined ? '#389e0d' : '#8c8c8c',
              lineWidth: 2,
            },
          }

        case 'heatmap':
          // Pass-rate gradient as fill color
          return {
            id: node.id,
            style: {
              fill: evalPassRate !== undefined
                ? evalBorderColor(evalPassRate)
                : COVERAGE_NO_EVAL,
              stroke: evalPassRate !== undefined
                ? evalBorderColor(evalPassRate)
                : '#8c8c8c',
              lineWidth: 2,
            },
          }
      }
    })

    graph.updateNodeData(updates)
  }, [graph, mode])

  return { mode, setMode }
}
