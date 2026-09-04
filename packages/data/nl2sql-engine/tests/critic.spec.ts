/**
 * extractSqlCandidate — the `--` line-comment strip must be string-literal-aware
 * (nl2sql-3). The prior inline strip truncated a SQL string
 * literal containing `--` (e.g. `'a--b'`, `'-- dash'`) from the `--` to
 * end-of-line, corrupting the SQL the critic + executor receive. The shared
 * `stripLineComments` helper skips over single-quoted string literals (with
 * `''` escape) so `--` inside a literal is preserved.
 */
import { describe, expect, it } from 'vitest'
import { extractSqlCandidate } from '../src/critic.ts'

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
