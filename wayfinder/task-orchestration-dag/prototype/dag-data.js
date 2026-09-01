/**
 * PROTOTYPE (throwaway) — G2 sample DAG data, following the G1 decision:
 * 5 node types (task / subagent / workflow-run / workflow-agent) and
 * 4 edge types (dependency / sequence / spawning / containment).
 * Statuses drive paint; EVOLUTION scripts a Y-mode state march so placement
 * can be judged against live state changes, not a frozen snapshot.
 */

const NODES = [
  { id: 't1', nodeType: 'task', label: '梳理 TodoPanel 数据流', status: 'completed' },
  { id: 't2', nodeType: 'task', label: '定义 dag_task 工具协议', status: 'completed' },
  { id: 't3', nodeType: 'task', label: '实现会话事件投影层', status: 'in_progress' },
  { id: 't4', nodeType: 'task', label: '客户端 G6 渲染', status: 'in_progress' },
  { id: 't5', nodeType: 'task', label: '动效与边类型打磨', status: 'pending' },
  { id: 't6', nodeType: 'task', label: '预设组合接入', status: 'pending' },
  { id: 's2', nodeType: 'subagent', label: '上游调研', status: 'ended' },
  { id: 's1', nodeType: 'subagent', label: '评审代理', status: 'running' },
  { id: 'w1', nodeType: 'workflow-run', label: '并行审计', status: 'running' },
  { id: 'wa1', nodeType: 'workflow-agent', label: '审计·模型', status: 'completed' },
  { id: 'wa2', nodeType: 'workflow-agent', label: '审计·交互', status: 'running' },
  { id: 'wa3', nodeType: 'workflow-agent', label: '审计·动效', status: 'running' },
]

const EDGES = [
  { type: 'sequence', source: 't1', target: 't2' },
  { type: 'dependency', source: 't2', target: 't4' },
  { type: 'dependency', source: 't2', target: 't6' },
  { type: 'dependency', source: 't3', target: 't5' },
  { type: 'dependency', source: 't4', target: 't5' },
  { type: 'spawning', source: 't1', target: 's2' },
  { type: 'spawning', source: 't3', target: 's1' },
  { type: 'spawning', source: 't4', target: 'w1' },
  { type: 'containment', source: 'w1', target: 'wa1' },
  { type: 'containment', source: 'w1', target: 'wa2' },
  { type: 'containment', source: 'w1', target: 'wa3' },
]

/** Scripted state march: each entry is a list of {id, status} patches. */
const EVOLUTION = [
  [{ id: 'wa2', status: 'completed' }],
  [{ id: 't3', status: 'completed' }, { id: 's1', status: 'ended' }],
  [{ id: 'wa3', status: 'completed' }, { id: 'w1', status: 'completed' }, { id: 't4', status: 'completed' }],
  [{ id: 't5', status: 'in_progress' }, { id: 't6', status: 'in_progress' }],
  [{ id: 't5', status: 'completed' }, { id: 't6', status: 'completed' }],
]

const INITIAL_STATUSES = Object.fromEntries(NODES.map(n => [n.id, n.status]))

/** Shared mutable prototype state — persists across variant switches so all
 *  variants can be compared at the same evolution step. */
const state = {
  step: 0,
  statuses: { ...INITIAL_STATUSES },
}

const TYPE_LABEL = {
  task: '任务', subagent: '子代理', 'workflow-run': '工作流', 'workflow-agent': '执行代理',
}

function counts() {
  const c = { completed: 0, in_progress: 0, pending: 0, running: 0, ended: 0 }
  for (const n of NODES) c[state.statuses[n.id]] += 1
  const tasks = NODES.filter(n => n.nodeType === 'task')
  return {
    ...c,
    taskTotal: tasks.length,
    taskDone: tasks.filter(n => state.statuses[n.id] === 'completed').length,
    taskActive: tasks.filter(n => state.statuses[n.id] === 'in_progress').length,
  }
}

/** Apply the next evolution patch (wraps around by resetting to initial). */
function evolve() {
  if (state.step >= EVOLUTION.length) {
    state.statuses = { ...INITIAL_STATUSES }
    state.step = 0
  } else {
    for (const patch of EVOLUTION[state.step]) state.statuses[patch.id] = patch.status
    state.step += 1
  }
  return counts()
}

window.DagData = { NODES, EDGES, state, counts, evolve, TYPE_LABEL }
