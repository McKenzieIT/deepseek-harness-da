/**
 * `present.table` namespace dictionaries: the table card copy — row count,
 * export actions, SQL disclosure, chart toolbar, sort affordances, and the
 * expired / mismatched / error banners.
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
  'chartOff': '隐藏图表',
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
  'chartOff': 'Hide chart',
  'sortAria': 'Sort by this column',
  'tableAria': 'Data table',
} satisfies Record<TableKey, string>
