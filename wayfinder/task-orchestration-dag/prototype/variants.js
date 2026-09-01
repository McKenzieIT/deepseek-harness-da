/**
 * PROTOTYPE (throwaway) — G2 placement variants.
 *
 * Three structurally different answers to "DAG 面板放在哪、如何伸缩":
 *   A · 右侧详情栏 — details.aux 席位:与工具详情以页签共存,会话头按钮为入口
 *   B · 左侧侧边栏 — sidebar 分区:收起为迷你摘要条,展开时侧栏拉宽到 420,
 *                    同时演示 composer 上方的 dock 摘要条(TodoPanel 后继)
 *   C · 浮动窗口   — shell.overlay:可拖拽/可缩放/可最大化,收起为右下状态条
 *
 * 图本体共享(dag-graph.js);变化的是面板位置、折叠形态与节点交互方式。
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
  window.__protoToast = toast

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
        <div class="dag-hint">点击节点 → 底部详情卡 · 拖拽平移 · 滚轮缩放</div>`
      dag = DagGraph.create(el('a-canvas'), { onNodeClick: (id) => {
        const d = el('a-detail')
        d.style.display = ''
        d.innerHTML = nodeDetailHTML(id)
        wireLocate(d)
      } })
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

    // composer 上方的 dock 摘要条(conversation.input.dock 席位,TodoPanel 后继)
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
            <div class="dag-hint">点击节点 → 右侧检视器 · 拖标题栏移动 · 右下角缩放</div>
          </div>
          <div class="node-detail" id="c-detail" style="display:none;width:190px;border-top:none;border-left:1px solid var(--border-l2)"></div>
        </div>
        <div class="fw-resize" id="c-resize"></div>`
      dag = DagGraph.create(el('c-canvas'), { minimap: true, onNodeClick: (id) => {
        const d = el('c-detail')
        d.style.display = ''
        d.innerHTML = nodeDetailHTML(id)
        wireLocate(d)
      } })
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
  // Frame reset + switcher
  // =====================================================================
  const VARIANTS = [
    { key: 'A', name: 'A · 右侧详情栏', desc: 'details.aux 席位 · 与工具详情页签共存', mount: mountA },
    { key: 'B', name: 'B · 左侧侧边栏', desc: 'sidebar 分区 · 伸缩 + dock 摘要条', mount: mountB },
    { key: 'C', name: 'C · 浮动窗口', desc: 'shell.overlay · 拖拽/最大化/收起为状态条', mount: mountC },
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

  setVariant(new URLSearchParams(location.search).get('variant') ?? 'A', false)
})()
