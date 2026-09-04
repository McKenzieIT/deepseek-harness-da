/**
 * Postgres engine conventions loader — GA-GT2-D4 second-engine stub. Mirrors
 * the MaxCompute `loadConventions` seam (`@deepseek-ai/dsh-query-maxcompute/
 * src/conventions.ts`) but for a Postgres dialect.
 *
 * The YAML is inlined as a string below (single source of truth — no TS mirror
 * that can drift) because the built `lib/index.js` cannot read a runtime YAML
 * file: `conventions.yaml` is not a published `files` entry
 * (`expectedDshPackageFiles` is gate-hardcoded in `check-workspace-constraints`),
 * so a runtime `readFileSync` resolving via `import.meta.url` (the MaxCompute
 * pattern, which is vacuous there because maxcompute is src-only and never
 * builds a lib) would ENOENT from this package's built lib. Inlining makes the
 * built lib self-contained; `loadConventions` parses the inlined YAML once
 * (cached). See GA-QUERY-POSTGRES-impl-comply.
 *
 * Multi-consumer: the nl2sql-engine prompt dialect grounding
 * (key_differences/functions/cast_map/sql_templates) + the future query
 * guard/cost/dialect consumer. Single-engine (postgres) here; an unknown
 * engine yields an empty convention set so callers fail-open.
 *
 * D1 (GA-GT2-impl): the four convention *types* live in the abstract
 * `@deepseek-ai/dsh-query` package (`src/conventions.ts`) so consumers import
 * engine convention types from the abstract package, not a concrete provider.
 * This file re-exports them for backward compatibility with any consumer
 * importing from `@deepseek-ai/dsh-query-postgres/src/conventions`; the
 * YAML-loading *runtime* (`loadConventions` below) stays the Postgres
 * provider's concern.
 *
 * @module @deepseek-ai/dsh-query-postgres/src/conventions
 */
import { load as yamlLoad } from 'js-yaml'

import type { EngineConventions, ConventionFunction, ConventionCast, ConventionTemplate } from '@deepseek-ai/dsh-query'
export type { EngineConventions, ConventionFunction, ConventionCast, ConventionTemplate }

/**
 * The Postgres dialect convention set, inlined as YAML so the built lib is
 * self-contained (see module docstring). Edit this string + it is parsed once
 * (cached) at first call. YAML comments are preserved for readability and
 * ignored by `js-yaml`.
 */
const CONVENTIONS_YAML = `
# Postgres engine conventions — the GA-GT2-D4 second-engine stub.
#
# A coherent Postgres dialect convention set mirroring the MaxCompute
# \`conventions.yaml\` shape (engine/key_differences/functions/cast_map/
# sql_templates) to prove the abstract \`QueryEngine.getConventions()\` seam
# carries a second engine's conventions. This is a STUB (no real PG executor);
# the conventions are nonetheless a plausible Postgres dialect ($n placeholders,
# ::type casts, JSONB operators, DATE_TRUNC/NOW()/CURRENT_DATE, no ds partition
# filter, LIMIT/OFFSET).

engine: postgres

key_differences:
  - "JSON 提取: col->>'path' 或 col#>>'{a,b}' (操作符而非函数)"
  - "无 ds 分区字段: 用原生 DATE/TIMESTAMP 列 + 范围过滤 (BETWEEN / >=)"
  - "无 ARG_MAX: 用 DISTINCT ON (col) ... ORDER BY col DESC LIMIT 1 取最大对应值"
  - "类型: BIGINT / TEXT / DOUBLE PRECISION / NUMERIC / JSONB"
  - "标识符: 双引号 \\"col\\"; 字符串字面量单引号 'literal'"
  - "参数占位: $1/$2 位置参数 (prepared statement); 部分驱动支持 :param 命名"
  - "分页: LIMIT n OFFSET m (无 ROWNUM / 无 LIMIT n, m 合成)"

functions:
  - name: DATE_TRUNC
    signature: (unit, timestamp) → timestamp
  - name: NOW
    signature: () → timestamp
  - name: CURRENT_DATE
    signature: () → date
  - name: EXTRACT
    signature: (field FROM timestamp) → numeric
  - name: COALESCE
    signature: (val, ...) → first non-null
  - name: JSONB_ACCESS
    signature: "col->'key' (jsonb) / col->>'key' (text)"
  - name: STRING_AGG
    signature: (expr, delimiter) → text

cast_map:
  - { logical: int, meaning: 整数, cast: "x::BIGINT" }
  - { logical: decimal, meaning: 小数/定点, cast: "x::NUMERIC(18,2)" }
  - { logical: string, meaning: 文本, cast: "默认; 显式 x::TEXT" }
  - { logical: bool, meaning: 布尔, cast: "x::BOOLEAN" }
  - { logical: datetime, meaning: 日期/时间, cast: "x::TIMESTAMP 或 x::DATE" }
  - { logical: json, meaning: 结构体/对象, cast: "x::JSONB; 嵌套 col->'a'->>'b'" }

sql_templates:
  - name: 基础聚合（UV + 次数）
    sql: |
      SELECT COUNT(*) AS total_count, COUNT(DISTINCT role_id) AS role_uv
      FROM <数据视图> WHERE event = $1 AND created_at BETWEEN $2 AND $3
  - name: 多维分组
    sql: |
      SELECT server_id, params->>'result' AS battle_result, COUNT(*) AS battle_count
      FROM <数据视图> WHERE event = $1 AND created_at >= $2::date
      GROUP BY server_id, params->>'result'
  - name: TOP N
    sql: |
      SELECT params->>'coinType' AS coin_type,
             SUM((params->>'amount')::BIGINT) AS total_amount
      FROM <数据视图> WHERE event = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY params->>'coinType' ORDER BY total_amount DESC LIMIT 10
  - name: 取最大对应值（ARG_MAX 替代）
    sql: |
      SELECT DISTINCT ON (server_id) server_id, params->>'result' AS battle_result
      FROM <数据视图> WHERE event = $1
      ORDER BY server_id, created_at DESC
`

let cached: EngineConventions | undefined

/**
 * Load the per-engine conventions (RBI `conventions.py:32` semantics). Returns
 * an empty shape for an unknown engine so callers fail-open rather than throw.
 *
 * @param engine The engine name to load conventions for (default `'postgres'`); any other name yields an empty convention set.
 * @returns The cached `EngineConventions` for the requested engine (all arrays empty for unknown engines).
 */
export function loadConventions(engine = 'postgres'): EngineConventions {
  if (engine !== 'postgres') {
    return { engine, key_differences: [], functions: [], cast_map: [], sql_templates: [] }
  }
  if (cached === undefined) {
    cached = yamlLoad(CONVENTIONS_YAML) as EngineConventions
  }
  return cached
}
