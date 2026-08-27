/**
 * `suggest.followups` namespace dictionaries: the follow-up list copy —
 * caption, list aria, send hint, expired hint, and the error box lines.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'caption': '继续追问',
  'listAria': '后续建议列表',
  'send': '发送',
  'sendAria': '发送后续查询:{label}',
  'expired': '该建议来自上一轮,已过期',
  'error': '后续建议生成失败',
  'errorHint': '可直接在下方输入框继续提问',
} satisfies Record<string, string>

/** The suggest.followups namespace key union. */
export type FollowupKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'caption': 'Follow up',
  'listAria': 'Follow-up suggestions',
  'send': 'Send',
  'sendAria': 'Send follow-up query: {label}',
  'expired': 'This suggestion is from a previous turn and has expired',
  'error': 'Failed to build follow-up suggestions',
  'errorHint': 'You can still type your next question below',
} satisfies Record<FollowupKey, string>
