/** `contextLayer` namespace dictionaries for the graph overlay and management chat. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'overlay.loading': '正在加载图谱…',
  'action.close': '关闭',
  'chat.title': '聊天',
  'chat.agent': '管理代理',
  'chat.collapse': '收起面板',
  'chat.updatingGraph': '正在更新图谱…',
  'chat.messagePlaceholder': '输入消息…',
  'chat.unavailablePlaceholder': '管理会话不可用',
  'chat.send': '发送',
  'node.close': '关闭面板',
  'node.domains': '业务域',
  'node.evalPassRate': '评测通过率',
  'node.insertReference': '插入聊天引用',
  'kind.dws': '汇总表',
  'kind.dim': '维表',
  'kind.event': '事件',
  'kind.metric': '指标',
  'kind.concept': '概念',
  'overlay.off': '关闭',
  'overlay.coverage': '覆盖率',
  'overlay.heatmap': '热力图',
  'search.placeholder': '搜索节点…',
} satisfies Record<string, string>

/** Keys owned by the context-layer Client UI. */
export type ContextLayerKey = keyof typeof zh

/** Translator passed through the context-layer component tree. */
export type ContextLayerTranslate = (key: ContextLayerKey, params?: Record<string, unknown>) => string

/** English dictionary, checked against the Simplified Chinese key set. */
export const en = {
  'overlay.loading': 'Loading graph…',
  'action.close': 'Close',
  'chat.title': 'Chat',
  'chat.agent': 'Management Agent',
  'chat.collapse': 'Collapse panel',
  'chat.updatingGraph': 'Updating graph…',
  'chat.messagePlaceholder': 'Type a message…',
  'chat.unavailablePlaceholder': 'Management session not available',
  'chat.send': 'Send',
  'node.close': 'Close panel',
  'node.domains': 'Domains',
  'node.evalPassRate': 'Eval Pass Rate',
  'node.insertReference': 'Insert chat reference',
  'kind.dws': 'Summary Table',
  'kind.dim': 'Dimension Table',
  'kind.event': 'Event',
  'kind.metric': 'Metric',
  'kind.concept': 'Concept',
  'overlay.off': 'Off',
  'overlay.coverage': 'Coverage',
  'overlay.heatmap': 'Heatmap',
  'search.placeholder': 'Search nodes…',
} satisfies Record<ContextLayerKey, string>
