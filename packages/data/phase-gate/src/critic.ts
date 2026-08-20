/**
 * The GENERATION `sql_syntax_gate` critic — P13 decided form, replacing the
 * P7 sqlglot stub. Approach 1 (thin regex) + approach 4 (lightweight JSON
 * path parsing), NO `node-sql-parser` (left to P14+). Mounted at
 * `agent/turn-stopping` filling the `sql_syntax_gate` slot, returns a
 * `GateResult` aligned with rbi `phases.py:33`.
 *
 * F2 same-source: the SQL the critic inspects is the SQL `ctx.query.execute`
 * receives — `extractSqlCandidate` is the single extractor, with no
 * `tools/post-execute` rewrite in between (research
 * `p7-four-phase-fit-to-da.md` §3b).
 *
 * Critic guard data comes from per-agent STATE (captured by `tools/post-execute`
 * on `search_data_sources` / `load_event_definition` / `load_table_definition`),
 * NOT from `ctx.schema`/`ctx.retrieval` directly — self-contained, no P6/P5
 * package dependency. If a data set is empty (model didn't call the loader),
 * that check fail-opens (degrades to the remaining regex checks); the
 * execution-feedback loop (P13b) is the backstop for dynamic paths.
 *
 * Residual risks (execution-feedback backstop, research `p13-sql-critic-alternatives.md` §4):
 * dynamically-concatenated GET_JSON_OBJECT paths / silent-NULL SQL / regex
 * clause-boundary weakness (CTE / subquery SELECT * mis-hit) — all fail-open.
 * @module @deepseek-ai/dsh-phase-gate/critic
 */

import { GateResult, CriticFinding, type PhaseGateState } from './types.ts'

/** Partition columns checked when a table declares none of its own. */
const PARTITION_COLUMNS = ['ds', 'dt'] as const

/**
 * Strip fences + take the SQL candidate (mirrors rbi `gates.py:53`
 * `extract_sql_candidate`: the critiqued SQL is always the executed SQL).
 */
export function extractSqlCandidate(phaseOutput: string): string | null {
  if (!phaseOutput) return null
  const m = phaseOutput.match(/```sql\s*([\s\S]*?)```/i) ?? phaseOutput.match(/```([\s\S]*?)```/i)
  let sql = m?.[1] ?? phaseOutput
  sql = sql.trim()
  if (!sql || !/\bselect\b/i.test(sql)) return null
  return sql.replace(/\s+/g, ' ').trim()
}

interface JsonPathExtract { readonly path: string; readonly leaf: string | null; readonly segs: readonly string[] }

/** Approach 4: `GET_JSON_OBJECT $.a.b.c` leaf segment (aligned `sql_critic.py:481` last-key). */
export function extractJsonPaths(sql: string): JsonPathExtract[] {
  const paths: JsonPathExtract[] = []
  const re = /GET_JSON_OBJECT\s*\(\s*[^,]+,\s*'([^']+)'\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const path = m[1] ?? ''
    const segs = path.replace(/^\$\.?/, '').split('.').filter(Boolean)
    const leaf = segs.length ? (segs[segs.length - 1] ?? null) : null
    paths.push({ path, leaf, segs })
  }
  return paths
}

/** Extract table names from FROM/JOIN (strip db. prefix; skips subquery parens). */
export function extractTableNames(sql: string): Set<string> {
  const tables = new Set<string>()
  const re = /(?:\bFROM\b|\bJOIN\b)\s+([\w.]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    tables.add((m[1] ?? '').toLowerCase().replace(/^.*\./, ''))
  }
  return tables
}

/** Partition-filter check (`sql_evaluator.py` ast_has_partition_filter regex-fallback semantics). */
export function hasPartitionFilter(sql: string, partitionCols: ReadonlySet<string>): boolean {
  const cols = [...new Set([...partitionCols, ...PARTITION_COLUMNS])]
  const escaped = cols.map(c => c.replace(/[.*+?^${}()|\\]/g, '\\$&')).join('|')
  return new RegExp(`\\bWHERE\\b[\\s\\S]*\\b(${escaped})\\b`, 'i').test(sql)
}

/** SELECT * warning (strip aggregate `fn(*)` first to avoid COUNT(*) false-hit). */
export function hasSelectStar(sql: string): boolean {
  const cleaned = sql.replace(/\w+\s*\(\s*\*\s*\)/gi, '')
  return /\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(cleaned)
}

export interface CriticContext {
  readonly candidateTables: ReadonlySet<string>
  readonly eventParams: ReadonlySet<string>
  readonly partitionCols: ReadonlySet<string>
}

export interface CriticVerdict {
  readonly passed: boolean
  readonly reason: string | null
  readonly findings: readonly CriticFinding[]
}

/** Run approach 1 + 4 checks + map to verdict (error→fail, warning→pass+reason, none→pass). */
export function critiqueSql(sql: string | null, ctx: CriticContext): CriticVerdict {
  const findings: CriticFinding[] = []
  if (!sql) {
    return {
      passed: true,
      reason: 'no sql candidate (fail-open)',
      findings: [new CriticFinding('no_sql', 'warning', 'phase 最终文本无 SQL 候选，fail-open 放行')],
    }
  }
  // Approach 1a: table ∈ candidate sources (only if candidates were surfaced).
  if (ctx.candidateTables.size > 0) {
    for (const t of extractTableNames(sql)) {
      if (!ctx.candidateTables.has(t)) {
        findings.push(new CriticFinding('table_not_in_candidates', 'error', `表 '${t}' ∉ search_data_sources 检索候选`))
      }
    }
  }
  // Approach 1b: ds partition required (only for partitioned tables).
  if (ctx.partitionCols.size > 0 && !hasPartitionFilter(sql, ctx.partitionCols)) {
    findings.push(new CriticFinding('missing_partition_filter', 'warning', '缺分区过滤（ds/dt），可能全表扫'))
  }
  // Approach 1c: SELECT * warning.
  if (hasSelectStar(sql)) {
    findings.push(new CriticFinding('select_star', 'warning', 'SELECT * 不鼓励，显式列枚举'))
  }
  // Approach 4: GET_JSON_OBJECT field ∈ event_params (only if params were loaded).
  if (ctx.eventParams.size > 0) {
    for (const p of extractJsonPaths(sql)) {
      if (p.leaf && !ctx.eventParams.has(p.leaf.toLowerCase())) {
        findings.push(new CriticFinding('json_field_not_in_params', 'error', `GET_JSON_OBJECT path '${p.path}' 叶子段 '${p.leaf}' ∉ event_params`))
      }
    }
  }
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  if (errors.length) return { passed: false, reason: errors.map(e => e.message).join('; '), findings }
  if (warnings.length) return { passed: true, reason: `warnings: ${warnings.map(w => w.rule).join(',')}`, findings }
  return { passed: true, reason: null, findings }
}

/**
 * Adapt to the P7 `sql_syntax_gate` slot: return a `GateResult`. Mounted at
 * `agent/turn-stopping` (research `p7-four-phase-fit-to-da.md:286`): inspects
 * the phase's final assistant text.
 */
export function sqlSyntaxGate(phaseOutput: string, state: PhaseGateState): GateResult {
  const sql = extractSqlCandidate(phaseOutput)
  if (!sql) return GateResult.fail('phase 最终文本无 SQL 候选')
  const r = critiqueSql(sql, {
    candidateTables: state.candidate_tables,
    eventParams: state.event_params,
    partitionCols: state.partition_cols,
  })
  state.last_sql = sql // F2: same-source for EXECUTION query_data
  return r.passed ? new GateResult(true, r.reason) : GateResult.fail(r.reason ?? 'critic fail')
}
