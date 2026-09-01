/**
 * `present.decomposition` namespace dictionaries: the query-understanding
 * card copy — card title, confidence badge, metrics caption, lineage labels,
 * low-confidence warning, and the error box lines.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'cardTitle': '查询理解',
  'confidence': '置信度 {value}',
  'confidenceLow': '置信度 {value} · 请确认',
  'metricsCaption': '将计算 · {count} 项',
  'timeLabel': '时间',
  'dimensionLabel': '维度',
  'filterLabel': '筛选',
  'sourceLabel': '来源',
  'warning': '理解可能不准确，建议补充口径后重新提问',
  'error': '查询理解失败',
  'errorHint': '可在下方输入框补充口径后重新提问',
} satisfies Record<string, string>

/** The present.decomposition namespace key union. */
export type DecompositionKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'cardTitle': 'Query understanding',
  'confidence': 'Confidence {value}',
  'confidenceLow': 'Confidence {value} · please verify',
  'metricsCaption': 'To compute · {count} metric(s)',
  'timeLabel': 'Time',
  'dimensionLabel': 'By',
  'filterLabel': 'Filters',
  'sourceLabel': 'Source',
  'warning': 'The interpretation may be inaccurate — consider restating the query',
  'error': 'Failed to present the query understanding',
  'errorHint': 'You can rephrase the query below and ask again',
} satisfies Record<DecompositionKey, string>
