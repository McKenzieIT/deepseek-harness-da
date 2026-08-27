/** Locale dictionaries for the semantic layer management UI. */

export type SemanticLayerKey =
  | 'title'
  | 'loading'
  | 'error'
  | 'presenter.search.title'
  | 'presenter.search.noResults'
  | 'presenter.search.hit'
  | 'presenter.definition.title'
  | 'presenter.definition.notFound'
  | 'presenter.definition.fields'
  | 'presenter.definition.relations'
  | 'presenter.coverage.title'
  | 'presenter.coverage.total'
  | 'presenter.coverage.confirmed'
  | 'presenter.coverage.draft'
  | 'presenter.coverage.domains'
  | 'presenter.relations.title'
  | 'presenter.relations.added'
  | 'presenter.relations.noChange'
  | 'evidence.placeholder'
  | 'evidence.coverage.title'
  | 'evidence.coverage.empty'
  | 'evidence.coverage.total'
  | 'evidence.coverage.tables'
  | 'evidence.coverage.events'
  | 'evidence.coverage.metrics'
  | 'evidence.coverage.confirmed'
  | 'evidence.coverage.draft'
  | 'evidence.eval.title'
  | 'evidence.eval.noResults'
  | 'evidence.eval.pass'
  | 'evidence.eval.fail'
  | 'evidence.eval.error'
  | 'evidence.eval.passRate'
  | 'evidence.eval.more'
  | 'evidence.eval.trigger'
  | 'evidence.eval.running'
  | 'evidence.eval.lastRun'
  | 'evidence.eval.complete'
  | 'evidence.eval.notConfigured'
  | 'evidence.eval.failed'
  | 'evidence.eval.reportMode'
  | 'evidence.evalDelta.title'
  | 'evidence.evalDelta.empty'
  | 'evidence.evalDelta.comparing'
  | 'evidence.evalDelta.improved'
  | 'evidence.evalDelta.regressed'
  | 'evidence.evalDelta.unchanged'
  | 'evidence.evalDelta.more'
  | 'evidence.gap.title'
  | 'evidence.gap.empty'
  | 'evidence.gap.noGaps'
  | 'evidence.gap.from'
  | 'evidence.gap.more'
  | 'schema.domains'
  | 'schema.search.placeholder'
  | 'schema.tab.tables'
  | 'schema.tab.events'
  | 'schema.tab.metrics'
  | 'schema.detail.empty'
  | 'schema.detail.columns'
  | 'schema.detail.col.name'
  | 'schema.detail.col.type'
  | 'schema.detail.col.comment'
  | 'schema.detail.col.role'
  | 'schema.detail.col.description'
  | 'schema.detail.metrics'
  | 'schema.detail.dimensionRefs'
  | 'schema.detail.partitions'
  | 'schema.detail.params'
  | 'schema.detail.externalRefs'
  | 'schema.detail.eventFilter'
  | 'schema.detail.computation'
  | 'schema.detail.aggregation'
  | 'schema.detail.caliberVariants'
  | 'schema.detail.host'
  | 'schema.detail.hostTable'
  | 'schema.detail.hostEvent'
  | 'schema.detail.viewInGraph'

export const zh: Record<SemanticLayerKey, string> = {
  'title': '语义层',
  'loading': '加载中…',
  'error': '错误',
  'presenter.search.title': '搜索结果',
  'presenter.search.noResults': '无匹配资产',
  'presenter.search.hit': '个资产',
  'presenter.definition.title': '资产定义',
  'presenter.definition.notFound': '未找到资产',
  'presenter.definition.fields': '字段',
  'presenter.definition.relations': '关系',
  'presenter.coverage.title': '覆盖统计',
  'presenter.coverage.total': '总计',
  'presenter.coverage.confirmed': '已确认',
  'presenter.coverage.draft': '草稿',
  'presenter.coverage.domains': '域',
  'presenter.relations.title': '关系发现',
  'presenter.relations.added': '新增关系',
  'presenter.relations.noChange': '无变化',
  'evidence.placeholder': '证据面板将在全部基建就绪后启用',
  'evidence.coverage.title': '覆盖率',
  'evidence.coverage.empty': '暂无覆盖数据',
  'evidence.coverage.total': '总计',
  'evidence.coverage.tables': '表',
  'evidence.coverage.events': '事件',
  'evidence.coverage.metrics': '指标',
  'evidence.coverage.confirmed': '已确认',
  'evidence.coverage.draft': '草稿',
  'evidence.eval.title': 'Eval 结果',
  'evidence.eval.noResults': '暂无 eval 运行记录',
  'evidence.eval.pass': '通过',
  'evidence.eval.fail': '失败',
  'evidence.eval.error': '错误',
  'evidence.eval.passRate': '通过率',
  'evidence.eval.more': '条更多',
  'evidence.eval.trigger': '触发 Eval',
  'evidence.eval.running': '运行中…',
  'evidence.eval.lastRun': '上次运行',
  'evidence.eval.complete': 'Eval 完成',
  'evidence.eval.notConfigured': 'Eval 未配置',
  'evidence.eval.failed': 'Eval 失败',
  'evidence.eval.reportMode': '仅报告模式',
  'evidence.evalDelta.title': 'Eval 对比',
  'evidence.evalDelta.empty': '暂无对比数据（需至少两次运行）',
  'evidence.evalDelta.comparing': '对比',
  'evidence.evalDelta.improved': '提升',
  'evidence.evalDelta.regressed': '下降',
  'evidence.evalDelta.unchanged': '不变',
  'evidence.evalDelta.more': '条更多',
  'evidence.gap.title': '覆盖缺口',
  'evidence.gap.empty': '选择资产查看覆盖缺口',
  'evidence.gap.noGaps': '无覆盖缺口',
  'evidence.gap.from': '从',
  'evidence.gap.more': '条更多',
  'schema.domains': '所有域',
  'schema.search.placeholder': '搜索资产…',
  'schema.tab.tables': '表',
  'schema.tab.events': '事件',
  'schema.tab.metrics': '指标',
  'schema.detail.empty': '未找到定义',
  'schema.detail.columns': '字段',
  'schema.detail.col.name': '名称',
  'schema.detail.col.type': '类型',
  'schema.detail.col.comment': '注释',
  'schema.detail.col.role': '角色',
  'schema.detail.col.description': '描述',
  'schema.detail.metrics': '指标',
  'schema.detail.dimensionRefs': '维度引用',
  'schema.detail.partitions': '分区',
  'schema.detail.params': '参数字段',
  'schema.detail.externalRefs': '外部引用',
  'schema.detail.eventFilter': '事件过滤',
  'schema.detail.computation': '计算逻辑',
  'schema.detail.aggregation': '聚合方式',
  'schema.detail.caliberVariants': '口径变体',
  'schema.detail.host': '宿主',
  'schema.detail.hostTable': '宿主表',
  'schema.detail.hostEvent': '宿主事件',
  'schema.detail.viewInGraph': '在知识图谱中查看',
}

export const en: Record<SemanticLayerKey, string> = {
  'title': 'Semantic Layer',
  'loading': 'Loading…',
  'error': 'Error',
  'presenter.search.title': 'Search Results',
  'presenter.search.noResults': 'No matching assets',
  'presenter.search.hit': 'assets',
  'presenter.definition.title': 'Asset Definition',
  'presenter.definition.notFound': 'Asset not found',
  'presenter.definition.fields': 'Fields',
  'presenter.definition.relations': 'Relations',
  'presenter.coverage.title': 'Coverage Stats',
  'presenter.coverage.total': 'Total',
  'presenter.coverage.confirmed': 'Confirmed',
  'presenter.coverage.draft': 'Draft',
  'presenter.coverage.domains': 'Domains',
  'presenter.relations.title': 'Relations Discovery',
  'presenter.relations.added': 'added relations',
  'presenter.relations.noChange': 'No change',
  'evidence.placeholder': 'Evidence panel will activate when infrastructure is ready',
  'evidence.coverage.title': 'Coverage',
  'evidence.coverage.empty': 'No coverage data yet',
  'evidence.coverage.total': 'Total',
  'evidence.coverage.tables': 'Tables',
  'evidence.coverage.events': 'Events',
  'evidence.coverage.metrics': 'Metrics',
  'evidence.coverage.confirmed': 'confirmed',
  'evidence.coverage.draft': 'draft',
  'evidence.eval.title': 'Eval Results',
  'evidence.eval.noResults': 'No eval runs recorded',
  'evidence.eval.pass': 'pass',
  'evidence.eval.fail': 'fail',
  'evidence.eval.error': 'error',
  'evidence.eval.passRate': 'pass rate',
  'evidence.eval.more': 'more',
  'evidence.eval.trigger': 'Trigger Eval',
  'evidence.eval.running': 'Running…',
  'evidence.eval.lastRun': 'Last run',
  'evidence.eval.complete': 'Eval complete',
  'evidence.eval.notConfigured': 'Eval not configured',
  'evidence.eval.failed': 'Eval failed',
  'evidence.eval.reportMode': 'Report mode only',
  'evidence.evalDelta.title': 'Eval Delta',
  'evidence.evalDelta.empty': 'No delta available (needs at least two runs)',
  'evidence.evalDelta.comparing': 'Comparing',
  'evidence.evalDelta.improved': 'improved',
  'evidence.evalDelta.regressed': 'regressed',
  'evidence.evalDelta.unchanged': 'unchanged',
  'evidence.evalDelta.more': 'more',
  'evidence.gap.title': 'Coverage Gaps',
  'evidence.gap.empty': 'Select an asset to view coverage gaps',
  'evidence.gap.noGaps': 'No coverage gaps',
  'evidence.gap.from': 'From',
  'evidence.gap.more': 'more',
  'schema.domains': 'All Domains',
  'schema.search.placeholder': 'Search assets…',
  'schema.tab.tables': 'Tables',
  'schema.tab.events': 'Events',
  'schema.tab.metrics': 'Metrics',
  'schema.detail.empty': 'Definition not found',
  'schema.detail.columns': 'Columns',
  'schema.detail.col.name': 'Name',
  'schema.detail.col.type': 'Type',
  'schema.detail.col.comment': 'Comment',
  'schema.detail.col.role': 'Role',
  'schema.detail.col.description': 'Description',
  'schema.detail.metrics': 'Metrics',
  'schema.detail.dimensionRefs': 'Dimension Refs',
  'schema.detail.partitions': 'Partitions',
  'schema.detail.params': 'Parameters',
  'schema.detail.externalRefs': 'External Refs',
  'schema.detail.eventFilter': 'Event Filter',
  'schema.detail.computation': 'Computation',
  'schema.detail.aggregation': 'Aggregation',
  'schema.detail.caliberVariants': 'Caliber Variants',
  'schema.detail.host': 'Host',
  'schema.detail.hostTable': 'Host Table',
  'schema.detail.hostEvent': 'Host Event',
  'schema.detail.viewInGraph': 'View in Knowledge Graph',
}
