/**
 * PROTOTYPE (throwaway) — G2 placement variants.
 *
 * A · 右侧详情栏 — details.aux 席位:与工具详情以页签共存,会话头按钮为入口(对照样本)
 * B · 左侧侧边栏 — sidebar 分区:迷你摘要条 + dock 摘要条;节点点击浮出卡(用户已否)
 * C · 浮动窗口   — shell.overlay:可拖拽/缩放/最大化,收起为右下状态条;minimap 默认关
 * D · 融合方案(默认,用户 2026-09-02 反馈) —
 *   B 的骨架(dock 摘要条 + 侧栏伸缩,弃浮出卡) + A 的底部节点详情卡
 *   + C 的弹出大视图(补小屏、兼顾单节点与全貌) + 加大字号 + 自动演进
 *   + 活跃节点呼吸 + hover 上下游高亮 + 图例行。
 * 状态机: collapsed → sidebar(侧栏展开,限高一瞥) ⇄ popped(弹出大视图)。
 */
(function () {
  const { NODES, EDGES, TYPE_LABEL, counts, evolve, state } = window.DagData

  const el = (id) => document.getElementById(id)
  const sidebar = el('sidebar')
  const details = el('details')
  const detailsHead = el('details-head')
  const detailsBody = el('details-body')
  const headerActions = el('conv-header-actions')
  const dockZone = el('dock-strip-zone')
  const sbDagZone = el('sb-dag-zone')
  const overlay = el('overlay-layer')

  const DEFAULTS = { head: detailsHead.innerHTML, body: detailsBody.innerHTML }

  const STATUS_LABEL = { completed: '完成', in_progress: '进行中', pending: '待办', running: '运行中', ended: '已结束' }
  const label = (id) => NODES.find(n => n.id === id)?.label ?? id

  function summaryChips() {
    const c = counts()
    return `<span class="chip"><i class="dot" style="background:var(--green)"></i>完成 ${c.taskDone}/${c.taskTotal}</span>`
      + `<span class="chip"><i class="dot" style="background:var(--brand)"></i>进行 ${c.taskActive}</span>`
      + `<span class="chip"><i class="dot" style="background:var(--violet);box-shadow:0 0 5px var(--violet)"></i>运行 ${c.running}</span>`
  }

  function nodeDetailHTML(id) {
    const n = NODES.find(x => x.id === id)
    if (!n) return ''
    const st = state.statuses[id]
    const blockedBy = EDGES.filter(e => e.type === 'dependency' && e.target === id).map(e => label(e.source))
    const spawns = EDGES.filter(e => (e.type === 'spawning' || e.type === 'containment') && e.source === id).map(e => label(e.target))
    return `<div class="head"><b>${n.label}</b><span class="status-chip st-${st}">${STATUS_LABEL[st] ?? st}</span></div>`
      + `<div class="row"><span class="k">类型</span><span class="v">${TYPE_LABEL[n.nodeType]} · ${id}</span></div>`
      + (blockedBy.length ? `<div class="row"><span class="k">阻塞于</span><span class="v">${blockedBy.join(' · ')}</span></div>` : '')
      + (spawns.length ? `<div class="row"><span class="k">派生</span><span class="v">${spawns.join(' · ')}</span></div>` : '')
      + `<div class="row"><span class="k">写入范围</span><span class="v">packages/dag/**</span></div>`
      + `<div class="row"><span class="k">操作</span><span class="v"><a href="#" data-locate="1">在对话中定位 →</a></div>`
  }

  function toast(msg) {
    const t = document.createElement('div')
    t.className = 'toast'
    t.textContent = msg
    document.body.append(t)
    setTimeout(() => t.remove(), 1600)
  }

  function wireLocate(root) {
    root.querySelectorAll('[data-locate]').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); toast('示意:滚动对话并高亮对应的工具调用卡片') })
    })
  }

  // =====================================================================
  // Variant A — 右侧详情栏 (details.aux)
  // =====================================================================
  function mountA() {
    let dagOpen = false
    let dag = null

    const entryBtn = document.createElement('button')
    entryBtn.className = 'btn-mini'
    headerActions.append(entryBtn)

    function updateBadges() {
      const c = counts()
      entryBtn.textContent = `▦ 任务图 · ${c.running} 运行`
      const badge = detailsHead.querySelector('.tab[data-tab="dag"] .badge')
      if (badge) badge.textContent = String(c.running)
      const chips = el('a-chips')
      if (chips) chips.innerHTML = summaryChips()
    }

    function renderHead() {
      const c = counts()
      detailsHead.innerHTML = `<div style="display:flex;align-items:stretch;height:40px">
        <div class="tabs" style="flex:1">
          <button class="tab ${dagOpen ? '' : 'active'}" data-tab="tools">工具详情</button>
          <button class="tab ${dagOpen ? 'active' : ''}" data-tab="dag">任务图 <span class="badge">${c.running}</span></button>
        </div>
        <button class="fw-btn" data-act="close" title="收起详情栏">✕</button>
      </div>`
      detailsHead.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        dagOpen = t.dataset.tab === 'dag'
        renderHead(); renderBody(); updateBadges()
      }))
      detailsHead.querySelector('[data-act="close"]').addEventListener('click', () => {
        details.setAttribute('data-closed', '')
      })
    }

    function renderBody() {
      dag?.destroy(); dag = null
      if (!dagOpen) { detailsBody.innerHTML = DEFAULTS.body; return }
      detailsBody.innerHTML = `
        <div class="dag-summary"><span id="a-chips">${summaryChips()}</span><span class="spacer"></span>
          <button class="btn-mini" id="a-evolve">▶ 演进下一步</button></div>
        <div class="dag-canvas-wrap"><div id="a-canvas"></div></div>
        <div class="node-detail" id="a-detail" style="display:none"></div>
        <div class="dag-hint">点击节点 → 底部详情卡 · 悬停看上下游 · 拖拽平移 · 滚轮缩放</div>`
      dag = DagGraph.create(el('a-canvas'), {
        onNodeClick: (id) => {
          const d = el('a-detail')
          d.style.display = ''
          d.innerHTML = nodeDetailHTML(id)
          wireLocate(d)
        },
        onCanvasClick: () => { const d = el('a-detail'); if (d) d.style.display = 'none' },
      })
      el('a-evolve').addEventListener('click', () => { evolve(); dag.refresh(); updateBadges() })
    }

    entryBtn.addEventListener('click', () => {
      details.removeAttribute('data-closed')
      dagOpen = true
      renderHead(); renderBody(); updateBadges()
    })

    renderHead(); renderBody(); updateBadges()
    return {
      destroy() { dag?.destroy(); entryBtn.remove() },
    }
  }

  // =====================================================================
  // Variant B — 左侧侧边栏 (sidebar 分区 + dock 摘要条)
  // =====================================================================
  function mountB() {
    let expanded = false
    let dag = null
    let pop = null

    function updateLive() {
      const c = counts()
      const set = (id, html) => { const n = el(id); if (n) n.innerHTML = html }
      set('b-sum', `${c.taskDone}/${c.taskTotal} · ${c.running} 运行`)
      set('b-dock-sum', `完成 ${c.taskDone}/${c.taskTotal} · 进行 ${c.taskActive} · 运行 ${c.running}`)
      set('b-mini-sum', `${c.taskDone}/${c.taskTotal} 完成 · ${c.running} 个在运行 · 点击展开`)
      const bar = el('b-bar')
      if (bar) bar.style.width = `${Math.round((c.taskDone / c.taskTotal) * 100)}%`
      const chips = el('b-chips')
      if (chips) chips.innerHTML = summaryChips()
    }

    function closePopover() { pop?.remove(); pop = null }

    function showPopover(id) {
      closePopover()
      pop = document.createElement('div')
      pop.className = 'sb-popover'
      pop.innerHTML = nodeDetailHTML(id)
      document.body.append(pop)
      wireLocate(pop)
      const r = sidebar.getBoundingClientRect()
      pop.style.left = `${Math.min(r.width + 10, window.innerWidth - 260)}px`
      pop.style.top = `${Math.max(80, r.height * 0.3)}px`
      setTimeout(() => {
        document.addEventListener('pointerdown', function onAway(e) {
          if (pop && !pop.contains(e.target)) { closePopover(); document.removeEventListener('pointerdown', onAway) }
        })
      })
    }

    function toggle() {
      expanded = !expanded
      closePopover()
      renderZone()
    }

    function renderZone() {
      dag?.destroy(); dag = null
      sidebar.style.width = expanded ? '420px' : ''
      if (!expanded) {
        sbDagZone.innerHTML = `
          <div class="sb-dag-head" id="b-head"><span>▸</span><b>任务编排</b><span class="spacer"></span><span id="b-sum"></span></div>
          <div class="sb-dag-mini">
            <div class="bar"><i id="b-bar" style="width:0%"></i></div>
            <span id="b-mini-sum"></span>
          </div>`
      } else {
        sbDagZone.innerHTML = `
          <div class="sb-dag-head" id="b-head"><span>▾</span><b>任务编排</b><span class="spacer"></span><span id="b-sum"></span></div>
          <div class="sb-dag-body">
            <div class="dag-summary"><span id="b-chips">${summaryChips()}</span><span class="spacer"></span>
              <button class="btn-mini" id="b-evolve">▶ 演进下一步</button></div>
            <div class="dag-canvas-wrap"><div id="b-canvas"></div></div>
            <div class="dag-hint">点击节点 → 浮出详情卡 · 侧栏宽度 420 = 上限</div>
          </div>`
        dag = DagGraph.create(el('b-canvas'), { onNodeClick: showPopover })
        el('b-evolve').addEventListener('click', () => { evolve(); dag.refresh(); updateLive() })
      }
      el('b-head').addEventListener('click', toggle)
      updateLive()
    }

    dockZone.innerHTML = `<div class="dock-strip" id="b-dock">
      <span>◈ 任务图</span><span id="b-dock-sum"></span><span style="margin-left:auto;color:var(--label-dim)">▴ 在侧栏展开</span>
    </div>`
    el('b-dock').addEventListener('click', () => { if (!expanded) toggle(); else toast('示意:滚动定位到侧栏任务编排分区') })

    renderZone()
    return {
      destroy() { dag?.destroy(); closePopover(); dockZone.innerHTML = '' },
    }
  }

  // =====================================================================
  // Variant C — 浮动窗口 (shell.overlay)
  // =====================================================================
  function mountC() {
    let dag = null
    const win = document.createElement('div')
    win.className = 'float-win'
    const pill = document.createElement('button')
    pill.className = 'float-pill'
    pill.style.display = 'none'
    overlay.append(win, pill)

    const geo = { x: 340, y: 88, w: 560, h: 430, maximized: false }

    function applyGeo() {
      if (geo.maximized) {
        win.style.left = '296px'; win.style.top = '60px'
        win.style.width = 'calc(100vw - 296px - 376px)'
        win.style.height = 'calc(100vh - 150px)'
      } else {
        win.style.left = `${geo.x}px`; win.style.top = `${geo.y}px`
        win.style.width = `${geo.w}px`; win.style.height = `${geo.h}px`
      }
    }

    function updateLive() {
      const c = counts()
      pill.innerHTML = `<span class="live"></span> 任务图 · 进行 ${c.taskActive} · 运行 ${c.running}`
      const chips = el('c-chips')
      if (chips) chips.innerHTML = summaryChips()
    }

    function renderWin() {
      win.innerHTML = `
        <div class="fw-head" id="c-head">
          <b>◈ 任务编排图</b><span class="spacer"></span>
          <button class="fw-btn" data-act="max" title="最大化 / 还原">▢</button>
          <button class="fw-btn" data-act="min" title="收起为状态条">—</button>
        </div>
        <div style="display:flex;flex:1;min-height:0">
          <div style="flex:1;display:flex;flex-direction:column;min-width:0">
            <div class="dag-summary"><span id="c-chips">${summaryChips()}</span><span class="spacer"></span>
              <button class="btn-mini" id="c-evolve">▶ 演进下一步</button></div>
            <div class="dag-canvas-wrap"><div id="c-canvas"></div></div>
            <div class="dag-hint">点击节点 → 右侧检视器 · 悬停看上下游 · 拖标题栏移动 · 右下角缩放</div>
          </div>
          <div class="node-detail" id="c-detail" style="display:none;width:190px;border-top:none;border-left:1px solid var(--border-l2)"></div>
        </div>
        <div class="fw-resize" id="c-resize"></div>`
      dag = DagGraph.create(el('c-canvas'), { minimap: false,
        onNodeClick: (id) => {
          const d = el('c-detail')
          d.style.display = ''
          d.innerHTML = nodeDetailHTML(id)
          wireLocate(d)
        },
        onCanvasClick: () => { const d = el('c-detail'); if (d) d.style.display = 'none' },
      })
      el('c-evolve').addEventListener('click', () => { evolve(); dag.refresh(); updateLive() })
      win.querySelector('[data-act="min"]').addEventListener('click', collapse)
      win.querySelector('[data-act="max"]').addEventListener('click', () => {
        geo.maximized = !geo.maximized; applyGeo()
      })
      wireDrag()
      wireResize()
    }

    function collapse() {
      win.style.display = 'none'
      pill.style.display = ''
      updateLive()
    }
    pill.addEventListener('click', () => { win.style.display = ''; pill.style.display = 'none' })

    function wireDrag() {
      const head = el('c-head')
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fw-btn')) return
        if (geo.maximized) return
        e.preventDefault()
        head.setPointerCapture(e.pointerId)
        const start = { x: e.clientX, y: e.clientY, gx: geo.x, gy: geo.y }
        const move = (ev) => {
          geo.x = Math.max(0, Math.min(window.innerWidth - 200, start.gx + ev.clientX - start.x))
          geo.y = Math.max(0, Math.min(window.innerHeight - 60, start.gy + ev.clientY - start.y))
          applyGeo()
        }
        const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up) }
        head.addEventListener('pointermove', move)
        head.addEventListener('pointerup', up)
      })
    }

    function wireResize() {
      const rz = el('c-resize')
      rz.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        if (geo.maximized) return
        rz.setPointerCapture(e.pointerId)
        const start = { x: e.clientX, y: e.clientY, w: geo.w, h: geo.h }
        const move = (ev) => {
          geo.w = Math.max(400, start.w + ev.clientX - start.x)
          geo.h = Math.max(300, start.h + ev.clientY - start.y)
          applyGeo()
        }
        const up = () => { rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', up) }
        rz.addEventListener('pointermove', move)
        rz.addEventListener('pointerup', up)
      })
    }

    applyGeo(); renderWin(); updateLive()
    return {
      destroy() { dag?.destroy(); win.remove(); pill.remove() },
    }
  }

  // =====================================================================
  // Variant D — 融合方案(默认)
  // =====================================================================
  function mountD() {
    let mode = 'collapsed' // 'collapsed' | 'sidebar' | 'popped'
    let dag = null
    let winMinimap = false

    const win = document.createElement('div')
    win.className = 'float-win'
    const geo = {
      x: Math.max(300, Math.round(window.innerWidth * 0.22)),
      y: 76,
      w: Math.min(860, window.innerWidth - 420),
      h: Math.min(600, window.innerHeight - 140),
      maximized: false,
    }

    function applyGeo() {
      if (geo.maximized) {
        win.style.left = '296px'; win.style.top = '56px'
        win.style.width = 'calc(100vw - 296px - 376px)'
        win.style.height = 'calc(100vh - 130px)'
      } else {
        win.style.left = `${geo.x}px`; win.style.top = `${geo.y}px`
        win.style.width = `${geo.w}px`; win.style.height = `${geo.h}px`
      }
    }

    function updateLive() {
      const c = counts()
      const set = (id, html) => { const n = el(id); if (n) n.innerHTML = html }
      set('d-sum', `${c.taskDone}/${c.taskTotal} · ${c.running} 运行`)
      set('d-dock-sum', `完成 ${c.taskDone}/${c.taskTotal} · 进行 ${c.taskActive} · 运行 ${c.running}`)
      set('d-mini-sum', `${c.taskDone}/${c.taskTotal} 完成 · ${c.running} 个在运行`)
      // 正在执行什么:直接点名进行中任务(最多 2 个,超出计数)。
      const active = NODES.filter(n => n.nodeType === 'task' && state.statuses[n.id] === 'in_progress')
      const exec = active.length === 0
        ? '空闲'
        : '正在执行 ' + active.slice(0, 2).map(n => `「${n.label}」`).join(' ') + (active.length > 2 ? ` 等 ${active.length} 项` : '')
      set('d-dock-exec', exec)
      const bar = el('d-bar')
      if (bar) bar.style.width = `${Math.round((c.taskDone / c.taskTotal) * 100)}%`
      for (const chipsId of ['d-sb-chips', 'd-win-chips']) set(chipsId, summaryChips())
      const act = el('d-dock-act')
      if (act) act.textContent = mode === 'popped' ? '◉ 已弹出大视图' : mode === 'sidebar' ? '▾ 在侧栏展开中' : '▴ 展开'
    }

    let auto = true
    let autoTimer = null

    function doEvolve() {
      evolve()
      dag?.refresh()
      updateLive()
    }

    function setAuto(next) {
      auto = next
      if (autoTimer !== null) { clearInterval(autoTimer); autoTimer = null }
      if (auto) autoTimer = setInterval(doEvolve, 2600)
      for (const b of document.querySelectorAll('[data-act="auto"]')) {
        b.textContent = auto ? '⏸ 暂停' : '⏵⏵ 自动'
        b.title = auto ? '自动演进中(2.6s/步),点击暂停' : '点击开启自动演进(2.6s/步)'
      }
    }

    /** 图容器公共骨架:工具条 + 画布 + 底部详情卡(A 式)+ 图例行。 */
    const LEGEND = `图例:▢任务 ●子代理 ◆工作流 ─依赖(绿=已完成) ┄紫=派生(流动) ┈琥珀=包含`
    function graphShellHTML(prefix, extraBtns, hint) {
      return `
        <div class="dag-summary" style="font-size:13px">
          <span id="${prefix}-chips"></span><span class="spacer"></span>
          <button class="btn-mini" data-act="auto"></button>
          <button class="btn-mini" data-act="evolve" title="手动前进一步">▶ 演进</button>
          <button class="btn-mini" data-act="fit" title="重新适配视图(缩放/平移后一键回全貌)">⤢ 适配</button>
          ${extraBtns}
        </div>
        <div class="dag-canvas-wrap"><div id="${prefix}-canvas"></div></div>
        <div class="node-detail" id="${prefix}-detail" style="display:none"></div>
        <div class="dag-hint">${LEGEND}<br>${hint}</div>`
    }

    function mountGraph(shellRoot, prefix, extraWires = {}) {
      dag?.destroy()
      dag = DagGraph.create(el(`${prefix}-canvas`), {
        minimap: prefix === 'd-win' && winMinimap,
        onNodeClick: (id) => {
          const d = el(`${prefix}-detail`)
          d.style.display = ''
          d.innerHTML = nodeDetailHTML(id)
          wireLocate(d)
        },
        onCanvasClick: () => { const d = el(`${prefix}-detail`); if (d) d.style.display = 'none' },
      })
      shellRoot.querySelector('[data-act="evolve"]').addEventListener('click', doEvolve)
      shellRoot.querySelector('[data-act="fit"]').addEventListener('click', () => dag?.fitNow())
      shellRoot.querySelector('[data-act="auto"]').addEventListener('click', () => setAuto(!auto))
      Object.entries(extraWires).forEach(([sel, fn]) => fn(shellRoot.querySelector(sel)))
      updateLive()
      setAuto(auto) // 同步新挂载按钮的标签(定时器重启无害)
    }

    /** 弹出大视图窗口(拖拽/缩放/最大化/小地图开关/收回侧栏)。 */
    function renderWin() {
      win.innerHTML = `
        <div class="fw-head" id="d-win-head">
          <b>◈ 任务编排图 · 大视图</b><span class="spacer"></span>
          <button class="fw-btn" data-act="map" title="小地图(默认关,不遮挡图)">🗺</button>
          <button class="fw-btn" data-act="max" title="最大化 / 还原">▢</button>
          <button class="fw-btn" data-act="back" title="收回侧栏">⤡</button>
          <button class="fw-btn" data-act="close" title="收回侧栏">✕</button>
        </div>
        ${graphShellHTML('d-win', '', '悬停节点 → 上下游链路高亮、其余压暗 · 点击看下方详情 · 拖标题栏移动/右下角缩放')}
        <div class="fw-resize" id="d-win-resize"></div>`
      mountGraph(win, 'd-win')

      const head = el('d-win-head')
      head.querySelector('[data-act="map"]').addEventListener('click', () => {
        winMinimap = !winMinimap
        toast(winMinimap ? '小地图:开(右上角)' : '小地图:关')
        renderWin() // 重建以应用 minimap 插件;DagData 状态全局保留
      })
      head.querySelector('[data-act="max"]').addEventListener('click', () => {
        geo.maximized = !geo.maximized; applyGeo()
      })
      for (const act of ['back', 'close']) {
        head.querySelector(`[data-act="${act}"]`).addEventListener('click', () => setMode('sidebar'))
      }
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fw-btn') || geo.maximized) return
        e.preventDefault()
        head.setPointerCapture(e.pointerId)
        const start = { x: e.clientX, y: e.clientY, gx: geo.x, gy: geo.y }
        const move = (ev) => {
          geo.x = Math.max(0, Math.min(window.innerWidth - 200, start.gx + ev.clientX - start.x))
          geo.y = Math.max(0, Math.min(window.innerHeight - 60, start.gy + ev.clientY - start.y))
          applyGeo()
        }
        const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up) }
        head.addEventListener('pointermove', move)
        head.addEventListener('pointerup', up)
      })

      const rz = el('d-win-resize')
      rz.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        if (geo.maximized) return
        rz.setPointerCapture(e.pointerId)
        const start = { x: e.clientX, y: e.clientY, w: geo.w, h: geo.h }
        const move = (ev) => {
          geo.w = Math.max(480, start.w + ev.clientX - start.x)
          geo.h = Math.max(360, start.h + ev.clientY - start.y)
          applyGeo()
        }
        const up = () => { rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', up) }
        rz.addEventListener('pointermove', move)
        rz.addEventListener('pointerup', up)
      })
    }

    // ---- 侧栏分区(三态) ----
    function renderZone() {
      dag?.destroy(); dag = null
      win.remove()
      sidebar.style.width = mode === 'sidebar' ? '420px' : ''
      if (mode === 'collapsed' || mode === 'popped') {
        sbDagZone.innerHTML = `
          <div class="sb-dag-head" id="d-head"><span>${mode === 'popped' ? '◉' : '▸'}</span><b>任务编排</b><span class="spacer"></span><span id="d-sum"></span></div>
          <div class="sb-dag-mini">
            <div class="bar"><i id="d-bar" style="width:0%"></i></div>
            <span id="d-mini-sum"></span>
          </div>`
        el('d-head').addEventListener('click', () => setMode('sidebar'))
        if (mode === 'popped') { overlay.append(win); applyGeo(); renderWin() }
      } else {
        const narrow = window.innerWidth < 1180
        sbDagZone.innerHTML = `
          <div class="sb-dag-head" id="d-head"><span>▾</span><b>任务编排</b><span class="spacer"></span><span id="d-sum"></span></div>
          <div class="sb-dag-body" style="height:min(42vh, 400px)">
            <!-- 限高:侧栏展开态只作"一瞥"视图;大量会话时不挤压会话列表,深看走 ⛶ 弹出大视图 -->
            ${graphShellHTML('d-sb',
              `<button class="btn-mini" data-act="pop" title="弹出大视图(大屏/小屏都看得清)">⛶ 弹出大视图</button>`,
              narrow ? '屏幕较窄——建议 ⛶ 弹出大视图查看' : '悬停节点看上下游高亮 · 点击看下方详情 · ⛶ 弹出大视图')}
          </div>`
        mountGraph(sbDagZone, 'd-sb', { '[data-act="pop"]': (b) => b.addEventListener('click', () => setMode('popped')) })
        el('d-head').addEventListener('click', () => setMode('collapsed'))
      }
      updateLive()
    }

    function setMode(next) {
      mode = next
      renderZone()
    }

    // ---- dock 摘要条(B 的骨架,常驻):计数 + 点名当前任务 ----
    dockZone.innerHTML = `<div class="dock-strip" id="d-dock">
      <span>◈ 任务图</span><span id="d-dock-exec" style="color:var(--label-primary)"></span><span id="d-dock-sum"></span>
      <span style="margin-left:auto;color:var(--label-dim)" id="d-dock-act">▴ 展开</span>
    </div>`
    el('d-dock').addEventListener('click', () => {
      if (mode === 'collapsed') setMode('sidebar')
      else if (mode === 'sidebar') toast('已展开——点 ⛶ 可弹出大视图')
      else { win.style.boxShadow = '0 0 0 3px var(--brand)'; setTimeout(() => { win.style.boxShadow = '' }, 600) }
    })

    renderZone()
    setAuto(true) // 演示默认自动演进
    return {
      destroy() {
        if (autoTimer !== null) { clearInterval(autoTimer); autoTimer = null }
        dag?.destroy(); win.remove()
      },
    }
  }

  // =====================================================================
  // Frame reset + switcher
  // =====================================================================
  const VARIANTS = [
    { key: 'D', name: 'D · 融合方案', desc: 'dock 摘要条 + 侧栏伸缩 + 弹出大视图 + 底部详情卡', mount: mountD },
    { key: 'A', name: 'A · 右侧详情栏', desc: 'details.aux 席位 · 与工具详情页签共存', mount: mountA },
    { key: 'B', name: 'B · 左侧侧边栏', desc: 'sidebar 分区 · 伸缩 + dock 摘要条', mount: mountB },
    { key: 'C', name: 'C · 浮动窗口', desc: 'shell.overlay · 拖拽/最大化/收起为状态条(minimap 默认关)', mount: mountC },
  ]

  let current = null

  function resetFrame() {
    detailsHead.innerHTML = DEFAULTS.head
    detailsBody.innerHTML = DEFAULTS.body
    details.removeAttribute('data-closed')
    sidebar.style.width = ''
    headerActions.innerHTML = ''
    dockZone.innerHTML = ''
    sbDagZone.innerHTML = ''
    overlay.innerHTML = ''
    document.querySelectorAll('.sb-popover, .toast').forEach(n => n.remove())
  }

  function setVariant(key, push) {
    const idx = VARIANTS.findIndex(v => v.key === key)
    const v = VARIANTS[idx < 0 ? 0 : idx]
    current?.destroy()
    resetFrame()
    current = v.mount() ?? {}
    el('sw-name').textContent = v.name
    el('sw-desc').textContent = v.desc
    if (push) history.replaceState(null, '', `?variant=${v.key}`)
  }

  const cycle = (dir) => {
    const cur = VARIANTS.findIndex(v => v.name === el('sw-name').textContent)
    setVariant(VARIANTS[(cur + dir + VARIANTS.length) % VARIANTS.length].key, true)
  }
  el('sw-prev').addEventListener('click', () => cycle(-1))
  el('sw-next').addEventListener('click', () => cycle(1))
  document.addEventListener('keydown', (e) => {
    const t = e.target
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.key === 'ArrowLeft') cycle(-1)
    if (e.key === 'ArrowRight') cycle(1)
  })

  setVariant(new URLSearchParams(location.search).get('variant') ?? 'D', false)
})()
