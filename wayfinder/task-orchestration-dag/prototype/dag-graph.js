/**
 * PROTOTYPE (throwaway) — G2 shared G6 v5 dagre graph component.
 * One factory, reused by every placement variant: the varying axis in G2 is
 * WHERE the panel lives and HOW it collapses, not the graph itself.
 * Paint follows G1: 5 node types, 4 edge types, Y-mode state colors
 * (completed dependency paths turn green, spawning edges march while the
 * spawned node is running).
 */
(function () {
  const T = {
    green: 'rgb(78, 209, 126)',
    blue: 'rgb(103, 158, 254)',
    neutral: 'rgb(151, 157, 166)',
    neutralDim: 'rgba(151, 157, 166, 0.45)',
    violet: 'rgb(167, 139, 250)',
    amber: 'rgb(247, 173, 49)',
    label: 'rgb(233, 236, 242)',
    labelDim: 'rgb(129, 133, 140)',
    edge: 'rgba(255, 255, 255, 0.32)',
    edgeSeq: 'rgba(255, 255, 255, 0.14)',
    edgeContain: 'rgba(247, 173, 49, 0.5)',
  }
  const tint = (rgb, a) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`)

  const STATUS_FILL = {
    completed: { stroke: T.green, fill: tint(T.green, 0.16) },
    in_progress: { stroke: T.blue, fill: tint(T.blue, 0.16) },
    pending: { stroke: T.neutralDim, fill: 'rgba(255, 255, 255, 0.03)' },
  }

  function nodeStyle(node, status) {
    const base = { labelText: node.label, labelFill: T.label, cursor: 'pointer' }
    switch (node.nodeType) {
      case 'task': {
        const s = STATUS_FILL[status] ?? STATUS_FILL.pending
        return {
          ...base, type: 'rect', size: [118, 32], radius: 7,
          fill: s.fill, stroke: s.stroke, lineWidth: 1.4,
          labelFontSize: 11,
          ports: [{ placement: 'top' }, { placement: 'bottom' }],
        }
      }
      case 'subagent': {
        const running = status === 'running'
        return {
          ...base, type: 'circle', size: 34,
          fill: running ? tint(T.violet, 0.2) : 'rgba(255,255,255,0.04)',
          stroke: running ? T.violet : T.neutralDim, lineWidth: 1.6,
          iconText: '子', iconFill: running ? T.violet : T.labelDim, iconFontSize: 12,
          labelPlacement: 'bottom', labelFontSize: 10, labelFill: running ? T.label : T.labelDim,
        }
      }
      case 'workflow-run': {
        const running = status === 'running'
        return {
          ...base, type: 'diamond', size: 52,
          fill: running ? tint(T.amber, 0.18) : 'rgba(255,255,255,0.04)',
          stroke: running ? T.amber : T.neutralDim, lineWidth: 1.6,
          iconText: '流', iconFill: running ? T.amber : T.labelDim, iconFontSize: 11,
          labelPlacement: 'bottom', labelFontSize: 10, labelFill: running ? T.label : T.labelDim,
        }
      }
      case 'workflow-agent': {
        const done = status === 'completed'
        return {
          ...base, type: 'circle', size: 26,
          fill: done ? tint(T.green, 0.18) : tint(T.amber, 0.14),
          stroke: done ? T.green : tint(T.amber, 0.8), lineWidth: 1.3,
          labelPlacement: 'bottom', labelFontSize: 10,
          labelFill: done ? T.label : T.label,
        }
      }
      default:
        return base
    }
  }

  function edgeStyle(edge, statuses, sourceNode) {
    switch (edge.type) {
      case 'dependency': {
        const done = statuses[edge.source] === 'completed'
        return {
          stroke: done ? tint(T.green, 0.75) : T.edge, lineWidth: 1.5,
          endArrow: true, endArrowSize: 6, endArrowType: 'triangle',
        }
      }
      case 'sequence':
        return { stroke: T.edgeSeq, lineWidth: 1 }
      case 'spawning': {
        const running = statuses[edge.target] === 'running'
        return {
          stroke: running ? T.violet : tint(T.violet, 0.35),
          lineWidth: running ? 1.8 : 1.2,
          lineDash: [6, 4], endArrow: true, endArrowSize: 5, endArrowType: 'triangle',
        }
      }
      case 'containment':
        return { stroke: T.edgeContain, lineWidth: 1, lineDash: [2, 4] }
      default:
        return { stroke: T.edge, lineWidth: 1 }
    }
  }

  function buildData() {
    const { NODES, EDGES, state } = window.DagData
    const statuses = state.statuses
    return {
      nodes: NODES.map(n => ({
        id: n.id, data: { nodeType: n.nodeType },
        style: nodeStyle(n, statuses[n.id]),
      })),
      edges: EDGES.map((e, i) => ({
        id: `e-${i}`, source: e.source, target: e.target, data: { type: e.type },
        style: edgeStyle(e, statuses),
      })),
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {{ onNodeClick?: (id: string) => void, minimap?: boolean, onCounts?: (c: object) => void }} opts
   */
  function createDagGraph(container, opts = {}) {
    let raf = null
    let destroyed = false
    const graph = new G6.Graph({
      container,
      animation: true,
      autoFit: 'view',
      padding: [20, 14, 26, 14],
      layout: {
        type: 'antv-dagre', rankdir: 'TB', nodesep: 26, ranksep: 44,
        align: 'UL', animation: true,
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      plugins: opts.minimap ? [{ type: 'minimap', size: [128, 88], position: 'right-bottom' }] : [],
      data: buildData(),
    })

    graph.on('node:click', (evt) => { if (evt.itemId) opts.onNodeClick?.(evt.itemId) })
    graph.on('node:mouseenter', () => { container.style.cursor = 'pointer' })
    graph.on('node:mouseleave', () => { container.style.cursor = 'default' })

    // Marching ants on running spawning edges (R2 pattern: rAF + lineDashOffset).
    function startAnts() {
      const { EDGES, state } = window.DagData
      let offset = 0
      const step = () => {
        if (destroyed) return
        offset = (offset - 0.6) % 1000
        const updates = EDGES
          .map((e, i) => ({ e, id: `e-${i}` }))
          .filter(({ e }) => e.type === 'spawning' && state.statuses[e.target] === 'running')
          .map(({ id }) => ({ id, style: { lineDashOffset: offset } }))
        if (updates.length > 0) {
          try { graph.updateEdgeData(updates) } catch { /* graph mid-render during variant teardown */ }
        }
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }

    graph.render().then(() => { if (!destroyed) startAnts() })
    window.__dagGraph = graph // debug handle for the prototype's own verification

    let fitRaf = null
    const ro = new ResizeObserver(() => {
      if (destroyed) return
      fitRaf ??= requestAnimationFrame(() => {
        fitRaf = null
        const w = container.clientWidth, h = container.clientHeight
        if (w > 0 && h > 0) { graph.resize(w, h); graph.fitView() }
      })
    })
    ro.observe(container)

    return {
      graph,
      /** Repaint after DagData.evolve(): full setData keeps positions as dagre preset. */
      refresh() {
        if (destroyed) return
        graph.setData(buildData())
        graph.render()
      },
      destroy() {
        destroyed = true
        if (raf !== null) cancelAnimationFrame(raf)
        if (fitRaf !== null) cancelAnimationFrame(fitRaf)
        ro.disconnect()
        try { graph.destroy() } catch { /* already torn down */ }
      },
    }
  }

  window.DagGraph = { create: createDagGraph, T }
})()
