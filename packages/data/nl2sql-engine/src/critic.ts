/**
 * P13b NL→SQL engine — the SQL critic (薄 regex 方案 1 + 轻量 JSON-path 方案 4,
 * replacing sqlglot AST — P13 grilling Q3; sqlglot has no TS equivalent + no
 * MaxCompute dialect, RBI uses `hive` proxy). Ported from
 * `prototypes/p13-nl2sql-engine/critic.mjs`.
 *
 * Hooks P7's `sql_syntax_gate` slot at `agent/turn-stopping` (P13b grilling Q2:
 * critic logic + `GateResult` live HERE in `packages/data/nl2sql-engine/`; P7b's
 * phase-gate slot delegates to `sqlSyntaxGate` / `critiqueSql`). F2 同源: the
 * SQL the critic checks = the SQL `ctx.query.execute` receives
 * (`extractSqlCandidate` single source, no `tools/post-execute` rewrite).
 *
 * Guard data comes from the P6 substrate (`params_fields`/`partitions`) +
 * retrieval results (candidate tables) — passed in via `CriticCtx`, NOT from
 * conventions. Residual risks (execution-feedback backstop, P13b grilling Q5):
 * dynamic `GET_JSON_OBJECT` path (static-unsolvable, eats first ODPS quota) /
 * silent NULL SQL (params-set wrong field → Tier1/2 answer-RAG evolution, out
 * of P13 scope) / regex clause boundary (fail-open) / self-correction limit
 * (`max_executions_per_turn=8` + `max_llm_calls_per_turn=60` → honest_decline).
 *
 * code-review-low fixes baked in:
 *  - #1 `hasPartitionFilter` greedy cross-statement/clause → scoped to the
 *    WHERE clause of each `;`-split statement.
 *  - #2 `hasSelectStar` missed `t.*` + `SELECT a, *` → parses the select list
 *    and detects `*` / `t.*` among the selected columns.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/critic
 */
import { PARTITION_COLUMNS, GateResult, CriticFinding, type CriticCtx } from './types.ts'

/** The critic verdict: pass/fail + reason + the findings that drove it. */
export interface CriticResult {
  readonly passed: boolean
  readonly reason: string | null
  readonly findings: readonly CriticFinding[]
}

/** A GET_JSON_OBJECT literal-path match: the raw path, its leaf segment, and the parsed segments. */
export interface JsonPathMatch {
  readonly path: string
  readonly leaf: string | null
  readonly segs: readonly string[]
}

/**
 * Strip the ```sql fence and extract the SQL candidate (mirror RBI gates.py:53 `extract_sql_candidate`).
 *
 * @param phaseOutput - The phase-final text (may contain a ```sql fence, raw SQL, or be empty).
 * @returns The normalized single-line SQL candidate, or null when no SELECT is present.
 */
export function extractSqlCandidate(phaseOutput: string | null | undefined): string | null {
  if (!phaseOutput) return null
  const m = phaseOutput.match(/```sql\s*([\s\S]*?)```/i) ?? phaseOutput.match(/```([\s\S]*?)```/)
  let sql = m?.[1] ?? phaseOutput
  // Strip `--` line comments BEFORE collapsing whitespace: the collapse turns
  // newlines into spaces, after which a `--[^\n]*` strip would run to
  // end-of-string and silently delete the rest of the SQL (D2-2). Stripping
  // here keeps comment semantics line-scoped and feeds the critic + executor
  // the same comment-free SQL (F2 same-source).
  sql = sql.replace(/--[^\n]*/g, '')
  sql = sql.trim()
  if (!sql || !/\bselect\b/i.test(sql)) return null
  return sql.replace(/\s+/g, ' ').trim()
}

/**
 * 方案 4: GET_JSON_OBJECT literal path → leaf segment (aligns sql_critic.py:481 last-key).
 *
 * @param sql - The SQL candidate to scan for GET_JSON_OBJECT calls.
 * @returns All literal-path GET_JSON_OBJECT matches found in the SQL.
 */
export function extractJsonPaths(sql: string): readonly JsonPathMatch[] {
  const paths: JsonPathMatch[] = []
  const re = /GET_JSON_OBJECT\s*\(\s*[^,]+,\s*'([^']+)'\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const path = m[1] ?? ''
    const segs = path.replace(/^\$\.?/, '').split('.').filter(Boolean)
    const leaf = segs.length > 0 ? (segs[segs.length - 1] ?? null) : null
    paths.push({ path, leaf, segs })
  }
  return paths
}

/**
 * FROM/JOIN table names (strip db. prefix). CTE definition names (`WITH name
 * AS (...)` / `, name AS (...)`) are excluded — a CTE alias is not a real
 * table and must not trigger `table_not_in_candidates` (D2-1). Residual:
 * comma-join/literal-FROM — fail-open + exec feedback.
 *
 * @param sql - The SQL candidate to scan for FROM/JOIN table references.
 * @returns The set of lowercased table names referenced (db. prefix stripped, CTE aliases excluded).
 */
export function extractTableNames(sql: string): Set<string> {
  const tables = new Set<string>()
  // CTE definition names: `name AS (` (WITH-clause and `, name AS (` multi-CTE).
  // A CTE alias referenced after FROM/JOIN is NOT a real table — skip it so the
  // critic does not false-positive table_not_in_candidates on valid CTE SQL.
  const cteNames = new Set<string>()
  const cteRe = /\b([A-Z_][A-Z0-9_]*)\s+AS\s*\(/gi
  let cteMatch: RegExpExecArray | null
  while ((cteMatch = cteRe.exec(sql)) !== null) {
    const cteName = cteMatch[1] ?? ''
    if (cteName) cteNames.add(cteName.toLowerCase())
  }
  // [A-Z_] (not [A-Za-z_]) + `i` flag — A-Z/a-z are duplicates under case-insensitive.
  const re = /\b(?:FROM|JOIN)\b\s+([A-Z_][A-Z0-9_.]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const captured = m[1] ?? ''
    const table = captured.toLowerCase().replace(/^.*\./, '')
    if (cteNames.has(table)) continue
    tables.add(table)
  }
  return tables
}

/** Split a select list on top-level commas (paren-aware). */
function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim().length > 0) parts.push(cur)
  return parts
}

/**
 * Partition-filter check (sql_evaluator.py `ast_has_partition_filter` regex
 * fallback semantics). code-review-low fix #1: scope to the WHERE clause of
 * each `;`-split statement — the P13 prototype's `WHERE[\s\S]*col` was greedy
 * across clauses (matched a `ds` in GROUP BY) and across statements.
 * Residual: a `;` inside a WHERE string literal splits mid-literal (the fragment
 * lacks WHERE → its `ds` is missed → false missing_partition_filter warning;
 * conservative — a warning, `passed:true`; rare; fail-open + execution-feedback backstop).
 *
 * @param sql - The SQL candidate to check for a partition-column filter.
 * @param partitionCols - The partition column names the SQL must filter on.
 * @returns True when any statement's WHERE clause references a partition column (or when no partition columns exist).
 */
export function hasPartitionFilter(sql: string, partitionCols: ReadonlySet<string>): boolean {
  const cols = new Set<string>([...partitionCols, ...PARTITION_COLUMNS].map(c => c.toLowerCase()))
  if (cols.size === 0) return true // non-partition DIM table — no ds required
  const statements = sql.split(/\s*;\s*/)
  for (const stmt of statements) {
    const whereMatch = stmt.match(/\bWHERE\b([\s\S]*?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|$)/i)
    if (!whereMatch) continue
    const whereClause = whereMatch[1] ?? ''
    for (const col of cols) {
      const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(whereClause)) return true
    }
  }
  return false
}

/**
 * SELECT * / t.* warning (sql_evaluator.py `ast_has_select_star` regex
 * fallback). code-review-low fix #2: the P13 prototype matched only
 * `SELECT *`/`SELECT DISTINCT *` (immediately after SELECT), missing `t.*`
 * and `SELECT a, *`. Now parses the select list (between SELECT and FROM) and
 * detects `*` or `t.*` among the selected columns. D2-4: bind to the
 * OUTERMOST (paren-depth-0) SELECT so a `SELECT *` inside a CTE body or
 * subquery does not false-positive the outer query.
 *
 * @param sql - The SQL candidate to check for a star select.
 * @returns True when the outer query's select list contains a bare `*` or `t.*` column.
 */
export function hasSelectStar(sql: string): boolean {
  const cleaned = sql.replace(/\w+\s*\(\s*\*\s*\)/gi, '') // strip COUNT(*)/SUM(*) etc.
  // Locate the outermost SELECT (paren depth 0). CTE bodies and subqueries sit
  // at depth >= 1; their `SELECT *` must not flag the outer query (D2-4).
  let depth = 0
  let outer = -1
  for (let i = 0; i + 6 <= cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0 && /^SELECT\b/i.test(cleaned.slice(i, i + 7))) { outer = i; break }
  }
  if (outer === -1) {
    // no top-level SELECT — fall back to the whole-tail check
    return /\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(cleaned)
  }
  const tail = cleaned.slice(outer)
  const selectMatch = tail.match(/^SELECT\s+(?:DISTINCT\s+)?([\s\S]*?)\bFROM\b/i)
  if (!selectMatch) {
    // no FROM — fall back to the whole-tail check
    return /\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(tail)
  }
  const selectList = selectMatch[1] ?? ''
  const items = splitTopLevelCommas(selectList)
  return items.some(item => /^\s*\*\s*$/.test(item) || /^\s*\w+\.\*\s*$/i.test(item))
}

/**
 * The critic: 方案 1 (regex guards: table ∈ candidates / ds-required / SELECT *)
 * + 方案 4 (GET_JSON_OBJECT leaf ∈ event_params), with error/warning/fail-open
 * verdicts aligned with RBI `sql_critic`/`sql_evaluator`. The engine's
 * self-correction loop calls this (it has the SQL + needs findings for
 * feedback); P7b's `sql_syntax_gate` slot calls `sqlSyntaxGate`.
 *
 * @param sql - The SQL candidate to critique (null/undefined → fail-open pass).
 * @param ctx - The critic guard context (candidate tables, event params, partition cols).
 * @returns The critic verdict (pass/fail + reason + findings).
 */
export function critiqueSql(sql: string | null | undefined, ctx: CriticCtx): CriticResult {
  const findings: CriticFinding[] = []
  if (!sql) {
    return {
      passed: true,
      reason: 'no sql candidate (fail-open)',
      findings: [new CriticFinding('no_sql', 'warning', 'phase 最终文本无 SQL 候选，fail-open 放行')],
    }
  }
  // 方案 1a: table ∈ candidate sources
  for (const t of extractTableNames(sql)) {
    if (!ctx.candidateTables.has(t)) {
      findings.push(new CriticFinding('table_not_in_candidates', 'error', `表 '${t}' ∉ search_data_sources 检索候选`))
    }
  }
  // 方案 1b: ds partition required (only for partition tables; empty partitionCols = non-partition DIM, no ds)
  if (ctx.partitionCols.size > 0 && !hasPartitionFilter(sql, ctx.partitionCols)) {
    findings.push(new CriticFinding('missing_partition_filter', 'warning', '缺分区过滤（ds/dt），可能全表扫'))
  }
  // 方案 1c: SELECT * warning
  if (hasSelectStar(sql)) {
    findings.push(new CriticFinding('select_star', 'warning', 'SELECT * 不鼓励，显式列枚举'))
  }
  // P3 C2: undeclared JOIN warning (only when a declared-join set is provided)
  if (ctx.declaredJoinPairs !== undefined && ctx.declaredJoinPairs.size > 0) {
    const tables = [...extractTableNames(sql)]
    if (tables.length >= 2) {
      for (let i = 0; i < tables.length; i++) {
        for (let j = i + 1; j < tables.length; j++) {
          const a = tables[i]
          const b = tables[j]
          if (a === undefined || b === undefined) continue
          const pair = [a, b].sort().join('|')
          if (!ctx.declaredJoinPairs.has(pair)) {
            findings.push(new CriticFinding('undeclared_join', 'warning', `⚠️ 未声明的 JOIN: ${a} ⟷ ${b}，可能 hallucination`))
          }
        }
      }
    }
  }
  // 方案 4: GET_JSON_OBJECT leaf ∈ event_params
  for (const p of extractJsonPaths(sql)) {
    if (p.leaf && ctx.eventParams.size > 0 && !ctx.eventParams.has(p.leaf.toLowerCase())) {
      findings.push(
        new CriticFinding('json_field_not_in_params', 'error', `GET_JSON_OBJECT path '${p.path}' 叶子段 '${p.leaf}' ∉ event_params`),
      )
    }
  }
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  if (errors.length > 0) return { passed: false, reason: errors.map(e => e.message).join('; '), findings }
  if (warnings.length > 0) return { passed: true, reason: 'warnings: ' + warnings.map(w => w.rule).join(','), findings }
  return { passed: true, reason: null, findings }
}

/**
 * Adapt to P7's `sql_syntax_gate` slot (aligns phases.py:33 GateResult). P7b's
 * phase-gate calls this at `agent/turn-stopping` with the phase-final text.
 *
 * @param phaseOutput - The phase-final text the gate inspects.
 * @param ctx - The critic guard context.
 * @returns The GateResult (pass when the critic passes, fail with reason otherwise).
 */
export function sqlSyntaxGate(phaseOutput: string, ctx: CriticCtx): GateResult {
  const sql = extractSqlCandidate(phaseOutput)
  if (!sql) return GateResult.fail('phase 最终文本无 SQL 候选')
  const r = critiqueSql(sql, ctx)
  return r.passed ? new GateResult(true, r.reason) : GateResult.fail(r.reason ?? 'critic fail')
}
