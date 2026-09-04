/**
 * `present.table` namespace dictionaries: the table card copy — row count,
 * export actions, SQL disclosure, chart toolbar (R4: 9 types + show-values /
 * data-only toggles), sort affordances, and the expired / mismatched / error
 * banners plus the chart-type degradation reasons.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rows': '行',
  'downloadCsv': '下载 CSV',
  'copyMd': '复制 MD',
  'copied': '已复制',
  'viewSql': '查看 SQL',
  'expired': '数据已过期',
  'retry': '重试',
  'mismatch': '未找到 result_id 对应的查询结果',
  'mismatchHint': '该结果可能来自较早的查询,或已被会话清理',
  'error': '表格展示失败',
  'kpiSampleNote': 'KPI 基于截断样本计算,非全量结果',
  'chartGroup': '图表类型',
  'chartLine': '折线',
  'chartBar': '柱状',
  'chartArea': '面积',
  'chartHbar': '横柱',
  'chartScatter': '散点',
  'chartDoughnut': '环形',
  'chartBubble': '气泡',
  'chartRadar': '雷达',
  'chartPolarArea': '极坐标',
  'chartLabels': '显示数值',
  'chartData': '仅数据',
  'degradeScatter': '散点图需至少 2 个数值列,已降级为柱状图',
  'degradeDoughnut': '环形图需不超过 8 个类别,已降级为柱状图',
  'degradeLineDate': '折线/面积图需 x 轴为日期,已降级为柱状图',
  'degradeBubble': '气泡图需至少 3 个数值列,已降级为柱状图',
  'degradeRadar': '雷达/极坐标图需实体×N 指标形态,已降级为柱状图',
  'sortAria': '按此列排序',
  'tableAria': '数据表',
} satisfies Record<string, string>

/** The present.table namespace key union. */
export type TableKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'rows': 'rows',
  'downloadCsv': 'Download CSV',
  'copyMd': 'Copy MD',
  'copied': 'Copied',
  'viewSql': 'View SQL',
  'expired': 'Data expired',
  'retry': 'Retry',
  'mismatch': 'No query result matches this result_id',
  'mismatchHint': 'The result may come from an earlier query or has been evicted',
  'error': 'Failed to present the table',
  'kpiSampleNote': 'KPIs are computed on a truncated sample, not the full result',
  'chartGroup': 'Chart type',
  'chartLine': 'Line',
  'chartBar': 'Bar',
  'chartArea': 'Area',
  'chartHbar': 'H-Bar',
  'chartScatter': 'Scatter',
  'chartDoughnut': 'Doughnut',
  'chartBubble': 'Bubble',
  'chartRadar': 'Radar',
  'chartPolarArea': 'Polar',
  'chartLabels': 'Show values',
  'chartData': 'Data only',
  'degradeScatter': 'Scatter needs ≥2 numeric columns; degraded to bar',
  'degradeDoughnut': 'Doughnut needs ≤8 classes; degraded to bar',
  'degradeLineDate': 'Line/area needs a date x-axis; degraded to bar',
  'degradeBubble': 'Bubble needs ≥3 numeric columns; degraded to bar',
  'degradeRadar': 'Radar/polarArea needs an entity × N-metric shape; degraded to bar',
  'sortAria': 'Sort by this column',
  'tableAria': 'Data table',
} satisfies Record<TableKey, string>
