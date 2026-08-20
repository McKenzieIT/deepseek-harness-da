// P13 prototype — 薄 regex 守卫 + 轻量 JSON path 解析（替 sqlglot AST critic）。
//
// 方案 1（薄 regex）：ds 分区必带 / SELECT * 告警 / 表名∈候选源（字符串匹配）
// 方案 4（轻量 JSON path 解析）：GET_JSON_OBJECT $.a.b.c 取叶子段∈event_params
// 挂 agent/turn-stopping 填 P7 sql_syntax_gate 槽（PHASE_CONFIGS generation gate=sql_syntax_gate），
// 返 { passed, reason, findings }，passed 对齐 GateResult（phases.py:33）。
// 判罚（与 RBI 同向）：表名∉候选/字段∉params=error→fail；SELECT */缺分区=warning→pass+reason；解析失败=fail-open→pass。
// F2 同源：critic 检查的 SQL = exec ctx.query.execute 收到的 SQL（中间无 tools/post-execute 改写）。
// 守卫数据从 P6 substrate（params_fields/partitions）+ 检索结果（候选表名）拿，不从 conventions。
// 残余风险（执行反馈兜底，research 笔记 §4）：动态拼接 GET_JSON_OBJECT 路径漏判 / 静默 NULL SQL /
// regex 子句边界弱（CTE/子查询 SELECT * 也命中）—— 均由执行反馈兜底。

import { PARTITION_COLUMNS, GateResult, CriticFinding } from './types.mjs';

// 剥围栏 + 取 SQL 候选（复刻 RBI gates.py:53 extract_sql_candidate：被评审的 SQL 恒等于被执行的）。
export function extractSqlCandidate(phaseOutput) {
  if (!phaseOutput) return null;
  const m = phaseOutput.match(/```sql\s*([\s\S]*?)```/i) || phaseOutput.match(/```([\s\S]*?)```/);
  let sql = m ? m[1] : phaseOutput;
  sql = sql.trim();
  if (!sql || !/\bselect\b/i.test(sql)) return null;
  return sql.replace(/\s+/g, ' ').trim();
}

// 方案 4：GET_JSON_OBJECT 字面量 path 取叶子段（对齐 sql_critic.py:481 last-key）。
export function extractJsonPaths(sql) {
  const paths = [];
  const re = /GET_JSON_OBJECT\s*\(\s*[^,]+,\s*'([^']+)'\s*\)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const path = m[1];
    const segs = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
    const leaf = segs.length ? segs[segs.length - 1] : null;
    paths.push({ path, leaf, segs });
  }
  return paths;
}

// 从 FROM/JOIN 提表名（去 db. 前缀；不匹配子查询括号——( 非 [A-Za-z_]）。
export function extractTableNames(sql) {
  const tables = new Set();
  const re = /(?:\bFROM\b|\bJOIN\b)\s+([A-Za-z_][\w.]*)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    tables.add(m[1].toLowerCase().replace(/^.*\./, ''));
  }
  return tables;
}

// 分区列检查（sql_evaluator.py:ast_has_partition_filter regex fallback 语义）。
export function hasPartitionFilter(sql, partitionCols) {
  const cols = [...new Set([...partitionCols, ...PARTITION_COLUMNS])];
  const escaped = cols.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\bWHERE\\b[\\s\\S]*\\b(${escaped})\\b`, 'i').test(sql);
}

// SELECT * 告警（去聚合函数 * 后查 SELECT *，避免 COUNT(*) 误判——sql_evaluator.py 注释同问题）。
export function hasSelectStar(sql) {
  const cleaned = sql.replace(/\w+\s*\(\s*\*\s*\)/gi, ''); // 去 COUNT(*)/SUM(*) 等
  return /\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(cleaned);
}

// 主 critic：跑方案 1+4 四检查 + 判罚映射。
export function critiqueSql(sql, ctx) {
  const findings = [];
  if (!sql) {
    return {
      passed: true,
      reason: 'no sql candidate (fail-open)',
      findings: [new CriticFinding('no_sql', 'warning', 'phase 最终文本无 SQL 候选，fail-open 放行')],
    };
  }
  // 方案 1a：表名∈候选源
  for (const t of extractTableNames(sql)) {
    if (!ctx.candidateTables.has(t)) {
      findings.push(new CriticFinding('table_not_in_candidates', 'error', `表 '${t}' ∉ search_data_sources 检索候选`));
    }
  }
  // 方案 1b：ds 分区必带（仅分区表；partitionCols 空=非分区 DIM 不带 ds）
  if (ctx.partitionCols.size > 0 && !hasPartitionFilter(sql, ctx.partitionCols)) {
    findings.push(new CriticFinding('missing_partition_filter', 'warning', '缺分区过滤（ds/dt），可能全表扫'));
  }
  // 方案 1c：SELECT * 告警
  if (hasSelectStar(sql)) {
    findings.push(new CriticFinding('select_star', 'warning', 'SELECT * 不鼓励，显式列枚举'));
  }
  // 方案 4：GET_JSON_OBJECT 字段∈event_params
  for (const p of extractJsonPaths(sql)) {
    if (p.leaf && ctx.eventParams.size > 0 && !ctx.eventParams.has(p.leaf.toLowerCase())) {
      findings.push(
        new CriticFinding('json_field_not_in_params', 'error', `GET_JSON_OBJECT path '${p.path}' 叶子段 '${p.leaf}' ∉ event_params`),
      );
    }
  }
  // 判罚映射（与 RBI 同向：列∉语义层=error；SELECT */缺分区=warning；解析失败=fail-open）
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  if (errors.length) return { passed: false, reason: errors.map((e) => e.message).join('; '), findings };
  if (warnings.length) return { passed: true, reason: 'warnings: ' + warnings.map((w) => w.rule).join(','), findings };
  return { passed: true, reason: null, findings };
}

// 适配 P7 sql_syntax_gate 槽：返 GateResult（对齐 phases.py:33 GateResult dataclass）。
// 挂 agent/turn-stopping（p7-four-phase-fit-to-da.md:286）：查 phase 最终文本。
export function sqlSyntaxGate(phaseOutput, ctx) {
  const sql = extractSqlCandidate(phaseOutput);
  if (!sql) return GateResult.fail('phase 最终文本无 SQL 候选');
  const r = critiqueSql(sql, ctx);
  return r.passed ? GateResult.pass() : GateResult.fail(r.reason);
}
