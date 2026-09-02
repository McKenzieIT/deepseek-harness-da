/**
 * PROTOTYPE (throwaway) — G2 shared G6 v5 dagre graph component.
 * One factory, reused by every placement variant: the varying axis in G2 is
 * WHERE the panel lives and HOW it collapses, not the graph itself.
 * Paint follows G1: 5 node types, 4 edge types, Y-mode state colors
 * (completed dependency paths turn green).
 *
 * 动效核心:@antv/g Web Animations API。实测(像素哈希)update*Data 不触发重绘,
 * rAF 循环是死的;连续样式动画必须走渲染引擎自己的通道(element.animate),
 * 离散状态切换必须补 graph.draw()。
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
          ...base, type: 'rect', size: [134, 38], radius: 8,
          fill: s.fill, stroke: s.stroke, lineWidth: 1.5,
          labelFontSize: 13,
          ports: [{ placement: 'top' }, { placement: 'bottom' }],
        }
      }
      case 'subagent': {
        const running = status === 'running'
        return {
          ...base, type: 'circle', size: 40,
          fill: running ? tint(T.violet, 0.2) : 'rgba(255,255,255,0.04)',
          stroke: running ? T.violet : T.neutralDim, lineWidth: 1.7,
          iconText: '子', iconFill: running ? T.violet : T.labelDim, iconFontSize: 13,
          labelPlacement: 'bottom', labelFontSize: 11.5, labelFill: running ? T.label : T.labelDim,
        }
      }
      case 'workflow-run': {
        const running = status === 'running'
        return {
          ...base, type: 'diamond', size: 58,
          fill: running ? tint(T.amber, 0.18) : 'rgba(255,255,255,0.04)',
          stroke: running ? T.amber : T.neutralDim, lineWidth: 1.7,
          iconText: '流', iconFill: running ? T.amber : T.labelDim, iconFontSize: 12,
          labelPlacement: 'bottom', labelFontSize: 11.5, labelFill: running ? T.label : T.labelDim,
        }
      }
      case 'workflow-agent': {
        const done = status === 'completed'
        return {
          ...base, type: 'circle', size: 30,
          fill: done ? tint(T.green, 0.18) : tint(T.amber, 0.14),
          stroke: done ? T.green : tint(T.amber, 0.8), lineWidth: 1.4,
          labelPlacement: 'bottom', labelFontSize: 11,
          labelFill: T.label,
        }
      }
      default:
        return base
    }
  }

  function edgeStyle(edge, statuses) {
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
          lineWidth: running ? 2.2 : 1.2,
          lineDash: [8, 5], endArrow: true, endArrowSize: 5, endArrowType: 'triangle',
        }
      }
      case 'containment': {
        // 运行中的工作流其包含边缓速流动;完成后静止变暗。
        const running = statuses[edge.source] === 'running'
        return {
          stroke: running ? tint(T.amber, 0.8) : T.edgeContain,
          lineWidth: running ? 1.6 : 1,
          lineDash: [3, 6],
        }
      }
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
   * @param {{ onNodeClick?: (id: string) => void, minimap?: boolean }} opts
   */
  function createDagGraph(container, opts = {}) {
    let destroyed = false
    const graph = new G6.Graph({
      container,
      animation: true,
      autoFit: 'view',
      padding: [20, 14, 26, 14],
      layout: {
        type: 'antv-dagre', rankdir: 'TB', nodesep: 30, ranksep: 50,
        align: 'UL', animation: true,
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      plugins: opts.minimap ? [{ type: 'minimap', size: [128, 88], position: 'right-top' }] : [],
      data: buildData(),
    })

    // G6 5.1.1 carries the element id on evt.target.id (evt.itemId is absent in this build).
    graph.on('node:click', (evt) => {
      const id = evt.target?.id ?? evt.itemId
      if (id) opts.onNodeClick?.(id)
    })
    graph.on('node:mouseenter', (evt) => {
      container.style.cursor = 'pointer'
      const id = evt.target?.id
      if (id) hoverFocus(id)
    })
    graph.on('node:mouseleave', () => {
      container.style.cursor = 'default'
      hoverRestore()
    })

    // ---- 动效:@antv/g Web Animations API --------------------------------------
    let anims = []

    function findEl(id) {
      const root = graph.getCanvas().document ?? graph.getCanvas().getRoot()
      let found = null
      const walk = (node) => {
        if (found || !node) return
        if (node.id === id) { found = node; return }
        for (const c of node.children ?? []) walk(c)
      }
      walk(root)
      return found
    }

    /** (重)装动画:流动边 + 活跃节点呼吸。任何 render/draw 后调用(元素会被重建)。 */
    function installAnimations() {
      if (destroyed) return
      for (const a of anims) { try { a.cancel() } catch { /* already finished */ } }
      anims = []
      window.__animCount = 0
      const { NODES, EDGES, state } = window.DagData
      const zoom = graph.getZoom() || 1
      // 屏幕观感速度恒定(≈48px/s),换算回 graph 空间需除以 zoom。
      const speed = Math.max(24, 48 / zoom)
      for (let i = 0; i < EDGES.length; i++) {
        const e = EDGES[i]
        const full = e.type === 'spawning' && state.statuses[e.target] === 'running'
        const slow = e.type === 'containment' && state.statuses[e.source] === 'running'
        if (!full && !slow) continue
        const el = findEl(`e-${i}`)
        if (!el || typeof el.animate !== 'function') continue
        const dist = e.type === 'spawning' ? 39 : 27 // 虚线周期整数倍,循环无缝
        const dur = (dist / (full ? speed : speed / 2)) * 1000
        anims.push(el.animate(
          [{ lineDashOffset: 0 }, { lineDashOffset: -dist }],
          { duration: dur, iterations: Infinity },
        ))
      }
      // 活跃节点呼吸(执行中任务 / 运行中代理与工作流)——"现在在执行什么"。
      for (const n of NODES) {
        const st = state.statuses[n.id]
        if (st !== 'in_progress' && st !== 'running') continue
        const el = findEl(n.id)
        if (!el || typeof el.animate !== 'function') continue
        const base = n.nodeType === 'task' ? 1.5 : 1.7
        anims.push(el.animate(
          [
            { lineWidth: base, shadowBlur: 0 },
            { lineWidth: base + 2.6, shadowBlur: 16, shadowColor: 'rgba(255,255,255,0.5)' },
            { lineWidth: base, shadowBlur: 0 },
          ],
          { duration: 1500, iterations: Infinity },
        ))
      }
      window.__animCount = anims.length
    }

    // 缩放/平移后速度感知需重算;防抖 300ms。
    let transformTimer = null
    graph.on('afterTransform', () => {
      if (destroyed || transformTimer !== null) return
      transformTimer = setTimeout(() => { transformTimer = null; installAnimations() }, 300)
    })

    // ---- hover 上下游高亮:回答"上下游关联是什么" ------------------------------
    function relatedOf(id) {
      const { EDGES } = window.DagData
      const up = new Set(), down = new Set()
      const walkUp = (x) => { for (const e of EDGES) if (e.target === x && !up.has(e.source)) { up.add(e.source); walkUp(e.source) } }
      const walkDown = (x) => { for (const e of EDGES) if (e.source === x && !down.has(e.target)) { down.add(e.target); walkDown(e.target) } }
      walkUp(id); walkDown(id)
      return new Set([id, ...up, ...down])
    }

    function hoverFocus(id) {
      const { NODES, EDGES, state } = window.DagData
      const rel = relatedOf(id)
      graph.updateNodeData(NODES.map(n => ({
        id: n.id,
        style: rel.has(n.id) ? nodeStyle(n, state.statuses[n.id]) : { ...nodeStyle(n, state.statuses[n.id]), opacity: 0.22 },
      })))
      graph.updateEdgeData(EDGES.map((e, i) => {
        const base = edgeStyle(e, state.statuses)
        const inside = rel.has(e.source) && rel.has(e.target)
        return { id: `e-${i}`, style: inside ? { ...base, lineWidth: base.lineWidth + 0.8 } : { ...base, opacity: 0.1 } }
      }))
      graph.draw()
      installAnimations()
    }

    function hoverRestore() {
      const { NODES, EDGES, state } = window.DagData
      graph.updateNodeData(NODES.map(n => ({ id: n.id, style: nodeStyle(n, state.statuses[n.id]) })))
      graph.updateEdgeData(EDGES.map((e, i) => ({ id: `e-${i}`, style: edgeStyle(e, state.statuses) })))
      graph.draw()
      installAnimations()
    }

    graph.render().then(() => { if (!destroyed) installAnimations() })
    window.__dagGraph = graph // debug handle for the prototype's own verification

    let fitRaf = null
    const ro = new ResizeObserver(() => {
      if (destroyed) return
      fitRaf ??= requestAnimationFrame(() => {
        fitRaf = null
        const w = container.clientWidth, h = container.clientHeight
        if (w > 0 && h > 0) { graph.resize(w, h); graph.fitView(); installAnimations() }
      })
    })
    ro.observe(container)

    // 状态变迁脉冲:变化的节点/边加粗发光 ~750ms 后还原,让"演进"一眼可见。
    let lastStatuses = { ...window.DagData.state.statuses }
    let pulseTimer = null
    function pulse(changedNodes, changedEdges) {
      if (pulseTimer !== null) { clearTimeout(pulseTimer); pulseTimer = null }
      if (changedNodes.length > 0) {
        graph.updateNodeData(changedNodes.map(id => ({
          id, style: { lineWidth: 3.5, shadowColor: 'rgba(255,255,255,0.55)', shadowBlur: 14 },
        })))
      }
      if (changedEdges.length > 0) {
        graph.updateEdgeData(changedEdges.map(id => ({ id, style: { lineWidth: 3.2 } })))
      }
      graph.draw()
      installAnimations()
      pulseTimer = setTimeout(() => {
        pulseTimer = null
        hoverRestore() // 全量还原样式并重绘 + 重装动画
      }, 750)
    }

    return {
      graph,
      /** Re-fit after manual zoom/pan (⤢ 适配 button). */
      fitNow() { if (!destroyed) { graph.fitView(); installAnimations() } },
      /** Repaint after DagData.evolve(): full setData keeps positions as dagre preset,
       *  then pulse every node/edge whose style actually changed. */
      refresh() {
        if (destroyed) return
        const { NODES, EDGES, state } = window.DagData
        const statuses = state.statuses
        const changedNodes = NODES.filter(n => lastStatuses[n.id] !== statuses[n.id]).map(n => n.id)
        const changedEdges = EDGES
          .map((e, i) => ({ e, id: `e-${i}` }))
          .filter(({ e }) => {
            const before = edgeStyle(e, lastStatuses)
            const after = edgeStyle(e, statuses)
            return before.stroke !== after.stroke || before.lineWidth !== after.lineWidth
          })
          .map(({ id }) => id)
        graph.setData(buildData())
        graph.render().then(() => {
          if (destroyed) return
          lastStatuses = { ...statuses }
          pulse(changedNodes, changedEdges)
        })
      },
      destroy() {
        destroyed = true
        for (const a of anims) { try { a.cancel() } catch { /* already finished */ } }
        anims = []
        if (transformTimer !== null) { clearTimeout(transformTimer); transformTimer = null }
        if (fitRaf !== null) cancelAnimationFrame(fitRaf)
        if (pulseTimer !== null) clearTimeout(pulseTimer)
        ro.disconnect()
        try { graph.destroy() } catch { /* already torn down */ }
      },
    }
  }

  window.DagGraph = { create: createDagGraph, T }
})()
