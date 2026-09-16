const sessions = {
  gmv: {
    title: 'GMV 下跌归因',
    runId: 'planrun_gmv_20260916',
    subtitle: '问数 · 单 Session/current-Agent lane · journalSeq 184',
    messages: [
      { role: 'user', text: '为什么昨天 GMV 比上周同期下降了 12%？请核对退款和渠道口径。' },
      { role: 'assistant', text: '我会先锁定指标口径，再并行读取订单与退款数据，最后验证主要归因。', tool: 'task.create × 6 · Plan revision 3' },
      { role: 'assistant', text: '订单侧已完成。退款明细第一次读取超时，当前使用同一任务的第二次 Attempt 重试；渠道拆解已可执行。' },
    ],
    stop: 'latest RunStopRecord · waiting_for_attempt · 2026-09-16 15:42:18 +08:00',
    health: '运行正常',
    tasks: [
      { id: 'metric', label: '确认 GMV 与退款口径', status: 'completed', x: 50, y: 10, verification: 'verified', output: 'metric-spec://gmv-v4', evidence: '指标字典与财务口径一致', attempts: [{ id: 'attempt-01', state: 'completed', binding: 'primary · DSH current Agent', output: 'metric-spec://gmv-v4' }] },
      { id: 'orders', label: '读取订单事实表', status: 'completed', x: 24, y: 34, verification: 'verified', output: 'dataset://orders-20260915', evidence: '分区、行数与金额校验通过', attempts: [{ id: 'attempt-02', state: 'completed', binding: 'primary · SQL executor', output: 'dataset://orders-20260915' }] },
      { id: 'refunds', label: '统一退款异常口径', status: 'running', x: 74, y: 34, verification: 'pending', output: '—', evidence: '等待当前 Attempt 输出', attempts: [{ id: 'attempt-03', state: 'failed', binding: 'primary · SQL executor', output: 'timeout after 30s' }, { id: 'attempt-04', state: 'running', binding: 'primary · SQL executor · generation 2', output: 'pending' }] },
      { id: 'channels', label: '按渠道拆解 GMV 变化', status: 'ready', x: 20, y: 65, verification: 'not_started', output: '—', evidence: '依赖已满足，可被 outer loop 准入', attempts: [] },
      { id: 'anomaly', label: '验证退款是否为主因', status: 'blocked', x: 61, y: 65, verification: 'not_started', output: '—', evidence: '等待 refunds 完成', hold: 'DependencyHold · blockedBy refunds', attempts: [] },
      { id: 'answer', label: '生成归因结论与建议', status: 'blocked', x: 43, y: 90, verification: 'not_started', output: '—', evidence: '等待 channels 与 anomaly', hold: 'DependencyHold · blockedBy channels, anomaly', attempts: [] },
    ],
    edges: [['metric', 'orders'], ['metric', 'refunds'], ['orders', 'channels'], ['refunds', 'anomaly'], ['channels', 'answer'], ['anomaly', 'answer']],
  },
  pipeline: {
    title: '每日宽表构建',
    runId: 'planrun_dws_20260916',
    subtitle: '数据工程 · 单 Session/current-Agent lane · journalSeq 96',
    messages: [
      { role: 'user', text: '把订单、商品和流量数据合成每日经营宽表，并补齐质量校验。' },
      { role: 'assistant', text: '已创建分区检查、维表同步、宽表构建和质量验证任务。', tool: 'task.create × 5 · Plan revision 2' },
      { role: 'assistant', text: '商品维表凭据不可用。计划与已完成结果已保留，自动执行停在 HostUnavailable Hold。' },
    ],
    stop: 'latest RunStopRecord · held · host_unavailable · 2026-09-16 15:39:04 +08:00',
    health: '需要处理 Hold',
    held: true,
    tasks: [
      { id: 'partition', label: '检查源表分区完整性', status: 'completed', x: 50, y: 10, verification: 'verified', output: 'report://partition-check', evidence: '三个源表分区均已到达', attempts: [{ id: 'attempt-11', state: 'completed', binding: 'primary · SQL executor', output: 'report://partition-check' }] },
      { id: 'orders2', label: '同步订单增量', status: 'completed', x: 22, y: 39, verification: 'verified', output: 'dataset://ods-orders', evidence: '主键与金额校验通过', attempts: [{ id: 'attempt-12', state: 'completed', binding: 'primary · pipeline executor', output: 'dataset://ods-orders' }] },
      { id: 'products', label: '同步商品维表', status: 'blocked', x: 73, y: 39, verification: 'not_started', output: '—', evidence: '未产生输出', hold: 'HostUnavailable Hold · credential analytics_prod expired', attempts: [{ id: 'attempt-13', state: 'cancelled', binding: 'primary · pipeline executor', output: 'external effect: none confirmed' }] },
      { id: 'wide', label: '构建经营宽表', status: 'blocked', x: 30, y: 72, verification: 'not_started', output: '—', evidence: '等待商品维表', hold: 'DependencyHold · blockedBy products', attempts: [] },
      { id: 'quality', label: '验证行数、唯一键和金额', status: 'blocked', x: 70, y: 72, verification: 'not_started', output: '—', evidence: '等待宽表产出', hold: 'DependencyHold · blockedBy wide', attempts: [] },
    ],
    edges: [['partition', 'orders2'], ['partition', 'products'], ['orders2', 'wide'], ['products', 'wide'], ['wide', 'quality']],
  },
}

const uiBySession = Object.fromEntries(Object.keys(sessions).map(id => [id, { rightOpen: id === 'gmv', fullscreen: false, selectedTask: id === 'gmv' ? 'refunds' : null }]))
let activeSession = 'gmv'
let reconnecting = false
let narrow = false
let watchAdvanced = false

const app = document.querySelector('#app')
const sessionList = document.querySelector('#session-list')
const taskSummary = document.querySelector('#task-summary')
const rightbar = document.querySelector('#task-rightbar')
const fullscreenButton = document.querySelector('#fullscreen-button')
const closeButton = document.querySelector('#close-button')
const narrowButton = document.querySelector('#narrow-button')
const reconnect = document.querySelector('#reconnect')

function statusLabel(status) {
  return { completed: '完成', running: '执行中', ready: '可执行', blocked: '受阻', failed: '失败' }[status] ?? status
}

function counts(session) {
  return session.tasks.reduce((result, task) => {
    result[task.status] = (result[task.status] ?? 0) + 1
    return result
  }, { completed: 0, running: 0, ready: 0, blocked: 0 })
}

function currentTask(session) {
  return session.tasks.find(task => task.status === 'running') ?? session.tasks.find(task => task.status === 'ready') ?? session.tasks.find(task => task.hold?.startsWith('HostUnavailable')) ?? session.tasks.find(task => task.hold) ?? session.tasks[0]
}

function renderSessions() {
  sessionList.innerHTML = Object.entries(sessions).map(([id, session]) => `<button type="button" class="session-button ${id === activeSession ? 'active' : ''}" data-session="${id}">${session.title}</button>`).join('')
  for (const button of sessionList.querySelectorAll('[data-session]')) {
    button.addEventListener('click', () => {
      activeSession = button.dataset.session
      render()
    })
  }
}

function renderTranscript(session) {
  document.querySelector('#transcript').innerHTML = session.messages.map(message => `
    <article class="message ${message.role === 'user' ? 'user' : ''}">
      ${message.text}
      ${message.tool ? `<div class="tool"><span>${message.tool}</span><span class="tool-state">✓ 已记录</span></div>` : ''}
    </article>`).join('')
}

function renderSummary(session) {
  const c = counts(session)
  const active = currentTask(session)
  taskSummary.disabled = reconnecting
  taskSummary.classList.toggle('unavailable', reconnecting)
  if (reconnecting) {
    document.querySelector('#summary-primary').textContent = '任务编排暂不可用'
    document.querySelector('#summary-secondary').textContent = '等待 snapshot 恢复；不会从聊天记录猜测任务状态'
    document.querySelector('#summary-action').textContent = '重新连接中'
  } else {
    document.querySelector('#summary-primary').textContent = active.status === 'running' ? `正在执行「${active.label}」` : session.held ? `已暂停「${active.label}」` : `下一步「${active.label}」`
    document.querySelector('#summary-secondary').textContent = `${c.completed}/${session.tasks.length} 完成 · ${c.ready} 可执行 · ${c.blocked} 受阻`
    document.querySelector('#summary-action').textContent = uiBySession[activeSession].rightOpen ? '定位任务图' : '在右侧查看'
  }
}

function renderMetrics(session) {
  const c = counts(session)
  const attemptCount = session.tasks.reduce((sum, task) => sum + task.attempts.length, 0)
  const holdCount = session.tasks.filter(task => task.hold).length
  document.querySelector('#metrics').innerHTML = [
    ['任务', session.tasks.length], ['完成', c.completed], ['Attempts', attemptCount], ['Holds', holdCount],
  ].map(([label, value]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join('')
}

function nodeById(session, id) { return session.tasks.find(task => task.id === id) }

function connectedIds(session, selectedId) {
  if (!selectedId) return new Set()
  const result = new Set([selectedId])
  let changed = true
  while (changed) {
    changed = false
    for (const [source, target] of session.edges) {
      if (result.has(target) && !result.has(source)) { result.add(source); changed = true }
      if (result.has(source) && !result.has(target)) { result.add(target); changed = true }
    }
  }
  return result
}

function renderGraph(session) {
  const selectedId = uiBySession[activeSession].selectedTask
  const connected = connectedIds(session, selectedId)
  const edges = session.edges.map(([sourceId, targetId]) => {
    const source = nodeById(session, sourceId)
    const target = nodeById(session, targetId)
    const completed = source.status === 'completed' && target.status === 'completed'
    const active = selectedId && connected.has(sourceId) && connected.has(targetId)
    const dimmed = selectedId && !active
    return `<path class="${completed ? 'completed' : ''} ${active ? 'active' : ''} ${dimmed ? 'dimmed' : ''}" d="M ${source.x} ${source.y + 6} L ${target.x} ${target.y - 6}" />`
  }).join('')
  document.querySelector('#edge-layer').innerHTML = `<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" /></marker></defs>${edges}`
  document.querySelector('#node-layer').innerHTML = session.tasks.map(task => {
    const dimmed = selectedId && !connected.has(task.id)
    return `<button type="button" class="task-node ${task.status} ${task.id === selectedId ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}" data-task="${task.id}" style="left:${task.x}%;top:${task.y}%" aria-pressed="${task.id === selectedId}">
      <span class="node-top"><i class="node-status"></i>${statusLabel(task.status)} · Task</span>
      <span class="node-label">${task.label}</span>
      <span class="node-meta">${task.attempts.length} Attempt · ${task.verification}</span>
    </button>`
  }).join('')
  for (const button of document.querySelectorAll('[data-task]')) {
    button.addEventListener('click', () => {
      uiBySession[activeSession].selectedTask = button.dataset.task
      renderGraph(session)
      renderDetail(session)
    })
  }
}

function renderDetail(session) {
  const id = uiBySession[activeSession].selectedTask
  const panel = document.querySelector('#detail-panel')
  const task = id ? nodeById(session, id) : null
  panel.classList.toggle('visible', task !== null)
  document.querySelector('#selection-hint').textContent = task ? `已选择 ${task.id}` : '选择任务查看执行、证据与阻塞原因'
  if (!task) {
    panel.innerHTML = '<span class="detail-key">未选择任务</span>'
    return
  }
  const attempts = task.attempts.length === 0
    ? '<div class="detail-value">尚未创建 Attempt</div>'
    : task.attempts.map(attempt => `<div class="attempt"><span>${attempt.id}</span><span class="binding-primary">${attempt.binding}</span><span>${attempt.state}</span></div>`).join('')
  panel.innerHTML = `
    <div class="detail-head"><div><div class="eyebrow">${task.id}</div><h2>${task.label}</h2></div><span class="status-pill ${task.status}">${statusLabel(task.status)}</span></div>
    <div class="detail-grid">
      <span class="detail-key">Task 状态</span><span class="detail-value">${statusLabel(task.status)}</span>
      <span class="detail-key">验证状态</span><span class="detail-value">${task.verification}</span>
      <span class="detail-key">OutputRef</span><span class="detail-value">${task.output}</span>
      ${task.hold ? `<span class="detail-key">Hold</span><span class="detail-value">${task.hold}</span>` : ''}
    </div>
    <div class="detail-section"><strong>Attempts 与主 Binding</strong>${attempts}</div>
    <div class="detail-section"><strong>Evidence</strong><div class="evidence">${task.evidence}</div></div>
    ${task.hold ? `<div class="detail-section"><strong>为什么没有继续</strong><div class="hold">${task.hold}</div></div>` : ''}
  `
}

function renderRightbar(session) {
  document.querySelector('#run-title').textContent = session.title
  document.querySelector('#run-subtitle').textContent = session.subtitle
  document.querySelector('#run-health').textContent = session.health
  document.querySelector('#run-health').classList.toggle('held', Boolean(session.held))
  document.querySelector('#stop-record').innerHTML = `<b>停止记录</b> · ${session.stop}`
  document.querySelector('#tab-dot').style.background = session.held ? 'var(--amber)' : 'var(--blue)'
  renderMetrics(session)
  renderGraph(session)
  renderDetail(session)
}

function render() {
  const session = sessions[activeSession]
  const ui = uiBySession[activeSession]
  const forcedFullscreen = narrow && ui.rightOpen
  document.querySelector('#conversation-title').textContent = session.title
  renderSessions()
  renderTranscript(session)
  renderSummary(session)
  renderRightbar(session)
  app.classList.toggle('right-open', ui.rightOpen)
  app.classList.toggle('fullscreen', ui.rightOpen && (ui.fullscreen || forcedFullscreen))
  app.classList.toggle('sim-narrow', narrow)
  rightbar.setAttribute('aria-hidden', String(!ui.rightOpen))
  taskSummary.setAttribute('aria-expanded', String(ui.rightOpen))
  fullscreenButton.textContent = ui.fullscreen || forcedFullscreen ? '⤢' : '⛶'
  fullscreenButton.setAttribute('aria-label', ui.fullscreen || forcedFullscreen ? '退出全屏' : '进入全屏')
  fullscreenButton.title = ui.fullscreen || forcedFullscreen ? '退出全屏' : '进入全屏'
  document.querySelector('#connection-label').classList.toggle('offline', reconnecting)
  document.querySelector('#connection-label').lastChild.textContent = reconnecting ? 'Task DAG 正在重连' : 'Task DAG 已连接'
}

function openRightbar() {
  if (reconnecting) return
  uiBySession[activeSession].rightOpen = true
  render()
  requestAnimationFrame(() => fullscreenButton.focus())
}

function closeRightbar() {
  const ui = uiBySession[activeSession]
  ui.rightOpen = false
  ui.fullscreen = false
  render()
  requestAnimationFrame(() => taskSummary.focus())
}

taskSummary.addEventListener('click', openRightbar)
closeButton.addEventListener('click', closeRightbar)
fullscreenButton.addEventListener('click', () => {
  if (narrow) return
  uiBySession[activeSession].fullscreen = !uiBySession[activeSession].fullscreen
  render()
  requestAnimationFrame(() => fullscreenButton.focus())
})
document.querySelector('#fit-button').addEventListener('click', () => {
  document.querySelector('#graph-stage').animate([{ boxShadow: 'inset 0 0 0 2px rgba(111,158,255,.75)' }, { boxShadow: 'inset 0 0 0 0 rgba(111,158,255,0)' }], { duration: 480 })
})
document.querySelector('#restart-button').addEventListener('click', () => {
  reconnecting = true
  for (const ui of Object.values(uiBySession)) {
    ui.rightOpen = false
    ui.fullscreen = false
    ui.selectedTask = null
  }
  reconnect.classList.add('visible')
  render()
  setTimeout(() => {
    reconnecting = false
    reconnect.classList.remove('visible')
    render()
    taskSummary.focus()
  }, 1100)
})
narrowButton.addEventListener('click', () => {
  narrow = !narrow
  narrowButton.setAttribute('aria-pressed', String(narrow))
  render()
})
document.querySelector('#advance-button').addEventListener('click', () => {
  if (watchAdvanced) return
  const session = sessions.gmv
  nodeById(session, 'refunds').status = 'completed'
  nodeById(session, 'refunds').verification = 'verified'
  nodeById(session, 'refunds').output = 'dataset://refunds-normalized'
  nodeById(session, 'refunds').evidence = '退款金额与支付流水勾稽通过'
  nodeById(session, 'refunds').attempts[1].state = 'completed'
  nodeById(session, 'refunds').attempts[1].output = 'dataset://refunds-normalized'
  nodeById(session, 'anomaly').status = 'running'
  delete nodeById(session, 'anomaly').hold
  nodeById(session, 'anomaly').attempts = [{ id: 'attempt-05', state: 'running', binding: 'primary · current Agent', output: 'pending' }]
  session.stop = 'latest RunStopRecord · continuing · admitted anomaly · 2026-09-16 15:43:02 +08:00'
  uiBySession.gmv.selectedTask = 'anomaly'
  watchAdvanced = true
  activeSession = 'gmv'
  render()
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  const ui = uiBySession[activeSession]
  if (!ui.rightOpen) return
  if (ui.fullscreen && !narrow) {
    ui.fullscreen = false
    render()
    fullscreenButton.focus()
  } else {
    closeRightbar()
  }
})

render()
