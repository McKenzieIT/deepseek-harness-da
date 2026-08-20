/**
 * P13b NL→SQL engine — conventions prompt rendering.
 *
 * The conventions DATA + `load_conventions` loader live in
 * `packages/query/query-maxcompute/` (F1: `.mjs` export → `conventions.yaml`
 * + loader, the P4 per-engine seam, mirror RBI `conventions.py:32`). This
 * module renders the loaded conventions into a prompt dialect-grounding
 * section (mirror RBI `conventions.py:render_conventions_markdown`) — the
 * nl2sql-engine consumes the loaded object; it does not own the loader.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/conventions
 */
import type { EngineConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'

/**
 * Render the loaded conventions as a markdown dialect cheatsheet for the
 * SQL-generation prompt. Null/empty → a placeholder (the prompt still runs).
 */
export function renderConventionsPrompt(conv: EngineConventions | null | undefined): string {
  if (!conv) return '（无 conventions）'
  const lines: string[] = []
  if (conv.key_differences.length > 0) {
    lines.push('## 方言速查')
    lines.push(...conv.key_differences.map(h => `- ${h}`))
  }
  if (conv.functions.length > 0) {
    lines.push('## 可用函数')
    lines.push(...conv.functions.map(f => `- \`${f.name}${f.signature}\``))
  }
  if (conv.cast_map.length > 0) {
    lines.push('## 字段逻辑类型 → CAST 映射')
    lines.push('| 逻辑类型 | 含义 | 写法 |')
    lines.push('|---------|------|------|')
    lines.push(...conv.cast_map.map(m => `| \`${m.logical}\` | ${m.meaning} | ${m.cast} |`))
  }
  if (conv.sql_templates.length > 0) {
    lines.push('## 典型查询模板')
    for (const t of conv.sql_templates) {
      lines.push(`\n### ${t.name}`)
      lines.push('```sql')
      lines.push(t.sql.trim())
      lines.push('```')
    }
  }
  return lines.join('\n')
}
