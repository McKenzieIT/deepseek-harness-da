/** Locale dictionaries for the semantic layer management UI. */

export type SemanticLayerKey =
  | 'title'
  | 'loading'
  | 'error'
  | 'presenter.running'
  | 'presenter.failed'
  | 'presenter.unavailable'
  | 'presenter.more'
  | 'presenter.search.title'
  | 'presenter.search.loading'
  | 'presenter.search.hits'
  | 'presenter.search.noResults'
  | 'presenter.search.hit'
  | 'presenter.definition.title'
  | 'presenter.definition.loading'
  | 'presenter.definition.asset'
  | 'presenter.definition.domainsLabel'
  | 'presenter.definition.columnsLabel'
  | 'presenter.definition.metricsLabel'
  | 'presenter.definition.relationsLabel'
  | 'presenter.definition.notFound'
  | 'presenter.definition.fields'
  | 'presenter.definition.relations'
  | 'presenter.coverage.title'
  | 'presenter.coverage.loading'
  | 'presenter.coverage.assets'
  | 'presenter.coverage.tables'
  | 'presenter.coverage.events'
  | 'presenter.coverage.metrics'
  | 'presenter.coverage.total'
  | 'presenter.coverage.confirmed'
  | 'presenter.coverage.draft'
  | 'presenter.coverage.domains'
  | 'presenter.relations.title'
  | 'presenter.relations.loading'
  | 'presenter.relations.summaryAdded'
  | 'presenter.relations.summaryEnriched'
  | 'presenter.relations.checkedNoNew'
  | 'presenter.relations.kindJoins'
  | 'presenter.relations.kindDerived'
  | 'presenter.relations.kindRelated'
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
  | 'evidence.eval.passCount'
  | 'evidence.eval.failCount'
  | 'evidence.eval.infraFailureCount'
  | 'evidence.eval.versus'
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
  | 'schema.search.noResults'
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

/** Translator passed through semantic-layer components and tool presenters. */
export type SemanticLayerTranslate = (key: SemanticLayerKey, params?: Record<string, unknown>) => string

/** zh */
export const zh: Record<SemanticLayerKey, string> = {
  'title': '语义层',
  'loading': '加载中…',
  'error': '错误',
  'presenter.running': '运行中',
  'presenter.failed': '失败',
  'presenter.unavailable': '不可用',
  'presenter.more': '另有 {count} 项',
  'presenter.search.title': '搜索语义层',
  'presenter.search.loading': '正在搜索语义层…',
  'presenter.search.hits': '{count} 个资产',
  'presenter.search.noResults': '无匹配资产',
  'presenter.search.hit': '个资产',
  'presenter.definition.title': '资产定义',
  'presenter.definition.loading': '正在加载资产定义…',
  'presenter.definition.asset': '资产',
  'presenter.definition.domainsLabel': '业务域',
  'presenter.definition.columnsLabel': '字段',
  'presenter.definition.metricsLabel': '指标',
  'presenter.definition.relationsLabel': '关系',
  'presenter.definition.notFound': '未找到资产',
  'presenter.definition.fields': '字段',
  'presenter.definition.relations': '关系',
  'presenter.coverage.title': '覆盖统计',
  'presenter.coverage.loading': '正在加载覆盖统计…',
  'presenter.coverage.assets': '{count} 个资产',
  'presenter.coverage.tables': '表',
  'presenter.coverage.events': '事件',
  'presenter.coverage.metrics': '指标',
  'presenter.coverage.total': '总计',
  'presenter.coverage.confirmed': '已确认',
  'presenter.coverage.draft': '草稿',
  'presenter.coverage.domains': '域',
  'presenter.relations.title': '关系发现',
  'presenter.relations.loading': '正在发现关系…',
  'presenter.relations.summaryAdded': '+{count} 条关系',
  'presenter.relations.summaryEnriched': '{count} 个资产已丰富',
  'presenter.relations.checkedNoNew': '已检查 {count} 个表，未发现新关系',
  'presenter.relations.kindJoins': '关联',
  'presenter.relations.kindDerived': '派生自',
  'presenter.relations.kindRelated': '相关',
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
  'evidence.eval.passCount': '{correct}/{total} 通过',
  'evidence.eval.failCount': ' · {count} 失败',
  'evidence.eval.infraFailureCount': ' · {count} 个基础设施失败',
  'evidence.eval.versus': '对比 {run}：',
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
  'schema.search.noResults': '无搜索结果',
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

/** en */
export const en: Record<SemanticLayerKey, string> = {
  'title': 'Semantic Layer',
  'loading': 'Loading…',
  'error': 'Error',
  'presenter.running': 'running',
  'presenter.failed': 'failed',
  'presenter.unavailable': 'unavailable',
  'presenter.more': '{count} more',
  'presenter.search.title': 'Search Schema',
  'presenter.search.loading': 'Searching schema…',
  'presenter.search.hits': '{count} assets',
  'presenter.search.noResults': 'No matching assets',
  'presenter.search.hit': 'assets',
  'presenter.definition.title': 'Asset Definition',
  'presenter.definition.loading': 'Loading definition…',
  'presenter.definition.asset': 'Asset',
  'presenter.definition.domainsLabel': 'domains',
  'presenter.definition.columnsLabel': 'columns',
  'presenter.definition.metricsLabel': 'metrics',
  'presenter.definition.relationsLabel': 'relations',
  'presenter.definition.notFound': 'Asset not found',
  'presenter.definition.fields': 'Fields',
  'presenter.definition.relations': 'Relations',
  'presenter.coverage.title': 'Coverage Statistics',
  'presenter.coverage.loading': 'Loading coverage…',
  'presenter.coverage.assets': '{count} assets',
  'presenter.coverage.tables': 'Tables',
  'presenter.coverage.events': 'Events',
  'presenter.coverage.metrics': 'Metrics',
  'presenter.coverage.total': 'Total',
  'presenter.coverage.confirmed': 'Confirmed',
  'presenter.coverage.draft': 'Draft',
  'presenter.coverage.domains': 'Domains',
  'presenter.relations.title': 'Discover Relations',
  'presenter.relations.loading': 'Discovering relations…',
  'presenter.relations.summaryAdded': '+{count} relations',
  'presenter.relations.summaryEnriched': '{count} enriched',
  'presenter.relations.checkedNoNew': '{count} tables checked, no new relations found',
  'presenter.relations.kindJoins': 'joins',
  'presenter.relations.kindDerived': 'derived_from',
  'presenter.relations.kindRelated': 'related_to',
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
  'evidence.eval.passCount': '{correct}/{total} passed',
  'evidence.eval.failCount': ' · {count} failed',
  'evidence.eval.infraFailureCount': ' · {count} infrastructure failures',
  'evidence.eval.versus': 'vs {run}:',
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
  'schema.search.noResults': 'No results',
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
