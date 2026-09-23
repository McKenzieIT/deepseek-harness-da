/**
 * `contextLayer` namespace dictionaries for the graph overlay and management chat.
 *
 * `kind.*` and `relation.*` name the node and relation kinds the client
 * presentation registry knows. Both projections are open: a kind absent from
 * these dictionaries falls back to its raw projected string as its accessible
 * label, so adding a Host kind never requires a dictionary entry first.
 */

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
  'node.detail': '详情',
  'node.detail.kind': '资产类型',
  'node.detail.conceptName': '概念名称',
  'node.relations': '关系',
  'kind.dws': '汇总表',
  'kind.dim': '维表',
  'kind.event': '事件',
  'kind.metric': '指标',
  'kind.concept': '概念',
  'relation.joins': '关联',
  'relation.derivedFrom': '派生自',
  'relation.relatedTo': '相关',
  'relation.detail.type': '关系类型',
  'relation.detail.target': '目标节点',
  'relation.detail.on': '关联条件',
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
  'node.detail': 'Details',
  'node.detail.kind': 'Asset Kind',
  'node.detail.conceptName': 'Concept Name',
  'node.relations': 'Relations',
  'kind.dws': 'Summary Table',
  'kind.dim': 'Dimension Table',
  'kind.event': 'Event',
  'kind.metric': 'Metric',
  'kind.concept': 'Concept',
  'relation.joins': 'Joins',
  'relation.derivedFrom': 'Derived From',
  'relation.relatedTo': 'Related To',
  'relation.detail.type': 'Relation Kind',
  'relation.detail.target': 'Target Node',
  'relation.detail.on': 'Join Condition',
  'overlay.off': 'Off',
  'overlay.coverage': 'Coverage',
  'overlay.heatmap': 'Heatmap',
  'search.placeholder': 'Search nodes…',
} satisfies Record<ContextLayerKey, string>
