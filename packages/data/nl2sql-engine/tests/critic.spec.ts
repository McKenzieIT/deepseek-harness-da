/**
 * extractSqlCandidate — the `--` line-comment strip must be string-literal-aware
 * (nl2sql-3). The prior inline strip truncated a SQL string
 * literal containing `--` (e.g. `'a--b'`, `'-- dash'`) from the `--` to
 * end-of-line, corrupting the SQL the critic + executor receive. The shared
 * `stripLineComments` helper skips over single-quoted string literals (with
 * `''` escape) so `--` inside a literal is preserved.
 */
import { describe, expect, it } from 'vitest'
import { extractSqlCandidate, looksLikeToolCall } from '../src/critic.ts'

describe('extractSqlCandidate — string-literal-aware -- strip (nl2sql-3)', () => {
  it('preserves -- inside a single-quoted string literal (not truncated to EOL)', () => {
    const out = extractSqlCandidate("```sql\nSELECT '-- dash' AS d FROM t\n```")
    expect(out).toContain("'-- dash'")
  })

  it("preserves -- in 'a--b' (no truncation from -- to end-of-line)", () => {
    const out = extractSqlCandidate("```sql\nSELECT 1 FROM t WHERE x = 'a--b'\n```")
    expect(out).toContain("'a--b'")
  })

  it('strips a real -- line comment outside any string literal', () => {
    const out = extractSqlCandidate('```sql\nSELECT 1 -- real comment\nFROM t\n```')
    expect(out).not.toContain('real comment')
    expect(out).toContain('SELECT 1')
  })

  it("handles '' escape: -- after an escaped quote inside a string is preserved", () => {
    // 'a''--b' is a single string literal a'--b; the -- is inside, must be kept.
    const out = extractSqlCandidate("```sql\nSELECT 1 FROM t WHERE x = 'a''--b'\n```")
    expect(out).toContain("'a''--b'")
  })
})

describe('looksLikeToolCall (CL-23 / CL-19 formats)', () => {
  // CL-19 observed the emission format varying run-to-run on qwen3.7-max, so
  // every shape it recorded is pinned here.
  it.each([
    ['<call>search_schema</call>', 'XML <call>'],
    ['<tool name="get_definition"/>', 'XML <tool>'],
    ['{"name": "search_schema", "arguments": {}}', 'JSON {"name":}'],
    ['{"tool_calls": [{"function": {"name": "x"}}]}', 'JSON {"tool_calls":}'],
    ['call:default_api:search_schema({"q":"dau"})', 'call: prefix (default_api)'],
    ['call:func{"name":"x"}', 'call: prefix (func)'],
    // Found live 2026-09-04 on voice_017 (qwen3.7-max); absent from CL-19's list.
    ['call\n{"name": "load_event_definition", "arguments": {}}', 'call + newline + JSON'],
    ['call {"name":"x"}', 'call + space + JSON'],
    ['search_schema({"query": "留存"})', 'bare function application'],
  ])('detects %s — %s', (text) => {
    expect(looksLikeToolCall(text)).toBe(true)
  })

  it.each([
    ['SELECT ds, COUNT(*) FROM t WHERE ds = \'20260903\'', 'plain SELECT'],
    ['WITH a AS (SELECT 1) SELECT * FROM a', 'CTE'],
    ['无法回答这个问题，因为缺少明确的指标口径。', 'a prose decline'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['-- comment\nSELECT 1', 'comment then SQL'],
  ])('does not flag %s — %s', (text) => {
    expect(looksLikeToolCall(text)).toBe(false)
  })

  it('does not flag SQL that merely contains a parenthesised call', () => {
    expect(looksLikeToolCall('SELECT MAX_PT(\'t\') FROM t')).toBe(false)
  })
})
