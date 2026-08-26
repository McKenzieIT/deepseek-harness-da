/**
 * Pre-execute SQL normalization for MaxCompute. Deterministic rewrites that fix
 * common LLM SQL generation mistakes before ODPS execution:
 *
 * 1. Strip reasoning/thinking comments (LLM leakage into SQL output)
 * 2. Rewrite non-MaxCompute functions to MaxCompute equivalents
 * 3. Basic syntax fixups (TOP N → LIMIT N, etc.)
 *
 * This is NOT a parser — it's a set of targeted regex rewrites for the most
 * common failure modes observed in eval runs. It runs at the query-provider
 * layer (not the prompt layer) so it's deterministic and dialect-aware.
 */

/**
 * Reasoning-leak comment patterns. LLM thinking models emit SQL-style comments
 * that contain reasoning text rather than legitimate schema/hint annotations.
 * Match: `-- Wait, ...`, `-- 注意...`, `-- Let me...`, `-- Actually...` etc.
 */
const REASONING_COMMENT_RE = /^--\s*(Wait|Note|Actually|Let me|Hmm|思考|注意|这里|其实|等等|首先|然后|接下来|但是|不对|所以|因此|看来|需要)[^\n]*$/gm

/**
 * Fenced code block markers that LLM sometimes wraps SQL in.
 * Match: ```sql, ```, etc.
 */
const FENCED_BLOCK_RE = /^```(?:sql|SQL)?\s*$/gm

/**
 * Function rewrites: source dialect → MaxCompute equivalent.
 * Each entry: [pattern, replacement] where replacement is string or replacer fn.
 */
const FUNCTION_REWRITES: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  // MySQL/ANSI NOW() → MaxCompute GETDATE()
  [/\bNOW\s*\(\s*\)/gi, 'GETDATE()'],
  // CURRENT_TIMESTAMP (no parens, ANSI) → GETDATE()
  [/\bCURRENT_TIMESTAMP\b(?!\s*\()/gi, 'GETDATE()'],
  // MySQL CURDATE() → MaxCompute TO_CHAR(GETDATE(), 'yyyyMMdd')
  [/\bCURDATE\s*\(\s*\)/gi, "TO_CHAR(GETDATE(), 'yyyyMMdd')"],
  // SQL Server DATEDIFF(unit, d1, d2) → MaxCompute DATEDIFF(d1, d2, 'unit')
  // d1/d2 use (?:[^(),]*|\([^()]*\))* to handle nested parens (e.g. GETDATE())
  [new RegExp(
    '\\bDATEDIFF\\s*\\(\\s*' +
    '(day|dd|d|month|mm|m|year|yy|y|hour|hh|h|minute|mi|n|second|ss|s)' +
    '\\s*,\\s*((?:[^(),]*|\\([^()]*\\))*)\\s*,\\s*((?:[^(),]*|\\([^()]*\\))*)\\s*\\)',
    'gi',
  ),
  (_match, unit, d1, d2) => {
    const unitMap: Record<string, string> = {
      day: 'dd', dd: 'dd', d: 'dd',
      month: 'mm', mm: 'mm', m: 'mm',
      year: 'yyyy', yy: 'yyyy', y: 'yyyy',
      hour: 'hh', hh: 'hh', h: 'hh',
      minute: 'mi', mi: 'mi', n: 'mi',
      second: 'ss', ss: 'ss', s: 'ss',
    }
    const mcUnit = unitMap[unit.toLowerCase()] ?? 'dd'
    return `DATEDIFF(${d1.trim()}, ${d2.trim()}, '${mcUnit}')`
  }],
  // MySQL DATE_SUB(date, INTERVAL n DAY) → DATEADD(date, -n, 'dd')
  [/\bDATE_SUB\s*\(\s*((?:[^(),]*|\([^()]*\))*)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR)\s*\)/gi,
    (_match, date, n, unit) => {
      const unitMap: Record<string, string> = { day: 'dd', month: 'mm', year: 'yyyy', hour: 'hh' }
      return `DATEADD(${date.trim()}, -${n}, '${unitMap[unit.toLowerCase()] ?? 'dd'}')`
    }],
  // MySQL DATE_ADD(date, INTERVAL n DAY) → DATEADD(date, n, 'dd')
  [/\bDATE_ADD\s*\(\s*((?:[^(),]*|\([^()]*\))*)\s*,\s*INTERVAL\s+(\d+)\s+(DAY|MONTH|YEAR|HOUR)\s*\)/gi,
    (_match, date, n, unit) => {
      const unitMap: Record<string, string> = { day: 'dd', month: 'mm', year: 'yyyy', hour: 'hh' }
      return `DATEADD(${date.trim()}, ${n}, '${unitMap[unit.toLowerCase()] ?? 'dd'}')`
    }],
  // SQL Server ISNULL(x, y) → MaxCompute NVL(x, y) (COALESCE also works but NVL is idiomatic)
  [/\bISNULL\s*\(/gi, 'NVL('],
  // MySQL IFNULL(x, y) → NVL(x, y)
  [/\bIFNULL\s*\(/gi, 'NVL('],
  // MySQL LIMIT offset, count → MaxCompute doesn't support offset in basic LIMIT
  // (leave as-is — MaxCompute does support LIMIT n, just not LIMIT offset,n in all modes)
  // MySQL STR_TO_DATE → TO_DATE
  [/\bSTR_TO_DATE\s*\(/gi, 'TO_DATE('],
  // MySQL DATE_FORMAT → TO_CHAR
  [/\bDATE_FORMAT\s*\(/gi, 'TO_CHAR('],
]

/**
 * TOP N (SQL Server) → LIMIT N rewrite.
 * Match: SELECT TOP 10 ... → SELECT ... LIMIT 10
 */
function rewriteTopN(sql: string): string {
  const topMatch = sql.match(/^(\s*SELECT)\s+TOP\s+(\d+)\b/i)
  if (!topMatch) return sql
  const n = topMatch[2]
  // Remove TOP N from SELECT, append LIMIT N at the end (before trailing semicolon)
  let result = sql.replace(/^(\s*SELECT)\s+TOP\s+\d+\b/i, '$1')
  // Only append LIMIT if not already present
  if (!/\bLIMIT\s+\d+/i.test(result)) {
    result = result.replace(/;?\s*$/, ` LIMIT ${n}`)
  }
  return result
}

/**
 * Normalize SQL for MaxCompute execution. Deterministic, no external deps.
 * Returns the cleaned SQL string. Never throws — worst case returns input unchanged.
 */
export function normalizeForMaxCompute(sql: string): string {
  if (!sql || typeof sql !== 'string') return sql

  let result = sql

  // 1. Strip fenced code block markers
  result = result.replace(FENCED_BLOCK_RE, '')

  // 2. Strip reasoning comments (preserve legitimate SQL comments like -- partition hint)
  result = result.replace(REASONING_COMMENT_RE, '')

  // 3. Function rewrites
  for (const [pattern, replacement] of FUNCTION_REWRITES) {
    result = result.replace(pattern, replacement as string)
  }

  // 4. TOP N → LIMIT N
  result = rewriteTopN(result)

  // 5. Clean up: collapse multiple blank lines, trim
  result = result.replace(/\n{3,}/g, '\n\n').trim()

  return result
}
