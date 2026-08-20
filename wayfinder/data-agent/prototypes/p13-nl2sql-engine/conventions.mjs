// P13 prototype — 薄 maxcompute conventions（P4 conventions seam 早期切片）。
//
// 复刻自 reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/conventions.yaml。
// 生产化：packages/query/query-maxcompute/conventions.yaml + load_conventions loader
// （复刻 RBI conventions.py:32 load_conventions(engine_name) 读 engines/<name>/conventions.yaml
// 返 dict）。归 query 包（grilling 决策：P4/Q5 既定"QueryEngine 协议+每引擎 conventions.yaml"，
// 忠实 RBI rbi-query 包内多消费者）。
//
// 消费者（P13 侧）：nl2sql-engine prompt 方言 grounding（本文件 key_differences/functions/
// cast_map/sql_templates）。query 侧消费者（limits/guards.yaml/sqlglot_dialect-drop）留 P4b 生产。
//
// drop: sqlglot_dialect（P13 drop sqlglot）/ equivalences（首期单引擎）/ limits（query 侧 guard/cost
// 能力矩阵，P13 prototype 暂不消费——P7 D6 已采 PipelineConfig 默认覆盖 guard 等价）。
//
// prototype 无依赖：直接 export 对象（不用 .yaml + js-yaml parser，p7 先例"纯 node .mjs 无 node_modules"）。

export const MAXCOMPUTE_CONVENTIONS = Object.freeze({
  engine: 'maxcompute',
  key_differences: [
    "JSON 提取: GET_JSON_OBJECT(col, '$.path')",
    '日期分区: ds 字段格式 yyyyMMdd',
    '聚合: ARG_MAX(value, cmp) 取最大对应值',
    '类型: BIGINT / STRING / DOUBLE',
    '标识符: 反引号 `col`',
  ],
  functions: [
    { name: 'GET_JSON_OBJECT', signature: '(json_string, path) → string' },
    { name: 'ARG_MAX', signature: '(value, cmp) → value_type' },
    { name: 'TO_CHAR', signature: '(datetime, format) → string' },
    { name: 'GETDATE', signature: '() → datetime' },
    { name: 'DATEDIFF', signature: '(date1, date2, unit) → int' },
  ],
  cast_map: [
    { logical: 'int', meaning: '整数', cast: 'CAST(x AS BIGINT)' },
    { logical: 'decimal', meaning: '小数/定点', cast: 'CAST(x AS DOUBLE)' },
    { logical: 'string', meaning: '文本', cast: '默认，无需 CAST' },
    { logical: 'bool', meaning: '布尔', cast: "x = '1' 或 CAST(x AS BOOLEAN)" },
    { logical: 'datetime', meaning: '日期/时间', cast: "TO_DATE(x,'yyyyMMdd') / CAST(x AS DATETIME)" },
    { logical: 'json', meaning: '结构体/对象', cast: "嵌套 GET_JSON_OBJECT(params,'$.a.b')" },
  ],
  sql_templates: [
    {
      name: '基础聚合（UV + 次数）',
      sql: `SELECT COUNT(*) AS total_count, COUNT(DISTINCT role_id) AS role_uv
FROM <数据视图> WHERE event = '<事件名>' AND ds BETWEEN '20240601' AND '20240607'`,
    },
    {
      name: '多维分组',
      sql: `SELECT server_id, GET_JSON_OBJECT(params, '$.result') AS battle_result, COUNT(*) AS battle_count
FROM <数据视图> WHERE event = '<事件名>' AND ds = '20240601'
GROUP BY server_id, GET_JSON_OBJECT(params, '$.result')`,
    },
    {
      name: 'TOP N',
      sql: `SELECT GET_JSON_OBJECT(params, '$.coinType') AS coin_type,
       SUM(CAST(GET_JSON_OBJECT(params, '$.amount') AS BIGINT)) AS total_amount
FROM <数据视图> WHERE event = '<事件名>' AND ds BETWEEN '20240601' AND '20240607'
GROUP BY GET_JSON_OBJECT(params, '$.coinType') ORDER BY total_amount DESC LIMIT 10`,
    },
  ],
});

// load_conventions(engine) —— 复刻 RBI conventions.py:32 语义。prototype 单引擎；生产按 engine 路由。
export function loadConventions(engine = 'maxcompute') {
  if (engine === 'maxcompute') return MAXCOMPUTE_CONVENTIONS;
  return {};
}

// renderConventionsPrompt —— 复刻 RBI conventions.py:render_conventions_markdown 语义（渲染方言速查喂 prompt）。
// prototype 简化（不做 markdown 严格转义）。
export function renderConventionsPrompt(conv) {
  if (!conv) return '（无 conventions）';
  const lines = [];
  if (conv.key_differences?.length) {
    lines.push('## 方言速查');
    lines.push(...conv.key_differences.map((h) => `- ${h}`));
  }
  if (conv.functions?.length) {
    lines.push('## 可用函数');
    lines.push(...conv.functions.map((f) => `- \`${f.name}${f.signature}\``));
  }
  if (conv.cast_map?.length) {
    lines.push('## 字段逻辑类型 → CAST 映射');
    lines.push('| 逻辑类型 | 含义 | 写法 |');
    lines.push('|---------|------|------|');
    lines.push(...conv.cast_map.map((m) => `| \`${m.logical}\` | ${m.meaning} | ${m.cast} |`));
  }
  if (conv.sql_templates?.length) {
    lines.push('## 典型查询模板');
    for (const t of conv.sql_templates) {
      lines.push(`\n### ${t.name}`);
      lines.push('```sql');
      lines.push(t.sql.trim());
      lines.push('```');
    }
  }
  return lines.join('\n');
}
