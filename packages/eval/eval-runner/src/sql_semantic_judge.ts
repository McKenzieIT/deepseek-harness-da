/**
 * SQL Semantic Judge: LLM-as-Judge for evaluating generated SQL correctness
 * without executing it. Scores along 5 dimensions: table selection, field
 * selection, filter conditions, aggregation logic, and overall semantics.
 *
 * @module @deepseek-ai/dsh-eval-runner/sql_semantic_judge
 */

import type { JudgeResult } from './types.ts'

/**
 * Input for the SQL semantic judge.
 */
export interface SqlJudgeInput {
  readonly question: string
  readonly generated_sql: string
  readonly schema_context: string
}

/**
 * Detailed per-dimension scores from the SQL semantic judge.
 */
export interface SqlJudgeDimensions {
  readonly table_selection: number
  readonly field_selection: number
  readonly filter_conditions: number
  readonly aggregation_logic: number
  readonly overall_semantics: number
}

/**
 * Extended judge result with per-dimension breakdown.
 */
export interface SqlJudgeResult extends JudgeResult {
  readonly dimensions?: SqlJudgeDimensions
}

/**
 * Abstract SQL semantic judge interface.
 */
export interface SqlSemanticJudge {
  judgeSql(input: SqlJudgeInput): Promise<SqlJudgeResult>
}

/**
 * LLM-backed implementation of the SQL semantic judge.
 */
export class LlmSqlSemanticJudge implements SqlSemanticJudge {
  private readonly buildPromptFn: (input: SqlJudgeInput) => string

  constructor(
    private readonly completeText: (prompt: string) => Promise<string>,
    buildPromptOverride?: (input: SqlJudgeInput) => string,
  ) {
    this.buildPromptFn = buildPromptOverride ?? buildJudgePrompt
  }

  async judgeSql(input: SqlJudgeInput): Promise<SqlJudgeResult> {
    if (!looksLikeSql(input.generated_sql)) {
      return { score: 0, rationale: 'Input is not SQL (no SQL keywords detected)' }
    }
    const prompt = this.buildPromptFn(input)
    try {
      const raw = await this.completeText(prompt)
      return parseJudgeResponse(raw)
    } catch (err) {
      return {
        score: 0,
        rationale: '',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

function buildJudgePrompt(input: SqlJudgeInput): string {
  return `你是一个 SQL 语义正确性评审 Judge。给定用户自然语言问题、数据表 schema 上下文、以及生成的 SQL，请从以下 5 个维度判断 SQL 是否语义正确。

## 输入

### 用户问题
${input.question}

### 数据表 Schema 上下文
${input.schema_context}

### 生成的 SQL
\`\`\`sql
${input.generated_sql}
\`\`\`

## 评分维度（每项 0 或 1）

1. **table_selection**: SQL 是否选择了正确的表？表名是否存在于 schema 上下文中？
2. **field_selection**: SELECT 的字段是否匹配用户意图？字段名是否存在于所选表中？
3. **filter_conditions**: WHERE/HAVING 条件是否正确表达了用户的约束（时间范围、维度过滤等）？
4. **aggregation_logic**: GROUP BY / 聚合函数（COUNT/SUM/AVG/MAX/MIN）是否匹配用户问题中的"总量/趋势/分布/占比"等语义？如果问题不涉及聚合，且 SQL 也未使用聚合，则给 1 分。
5. **overall_semantics**: 综合判断——如果实际执行该 SQL，其返回结果能否回答用户的问题？

## 输出格式

严格输出如下 JSON（不要输出其他内容）：
\`\`\`json
{
  "table_selection": 0或1,
  "field_selection": 0或1,
  "filter_conditions": 0或1,
  "aggregation_logic": 0或1,
  "overall_semantics": 0或1,
  "rationale": "一句话总结判断理由"
}
\`\`\``
}

function looksLikeSql(text: string): boolean {
  const trimmed = text.trim().toUpperCase()
  const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/
  return sqlKeywords.test(trimmed)
}

function parseJudgeResponse(raw: string): SqlJudgeResult {
  const jsonMatch = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
  if (!jsonMatch) {
    return { score: 0, rationale: `Failed to parse judge response: ${raw.slice(0, 200)}` }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const dimensions: SqlJudgeDimensions = {
      table_selection: toScore(parsed.table_selection),
      field_selection: toScore(parsed.field_selection),
      filter_conditions: toScore(parsed.filter_conditions),
      aggregation_logic: toScore(parsed.aggregation_logic),
      overall_semantics: toScore(parsed.overall_semantics),
    }
    const score = (
      dimensions.table_selection +
      dimensions.field_selection +
      dimensions.filter_conditions +
      dimensions.aggregation_logic +
      dimensions.overall_semantics
    ) / 5
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''
    return { score, rationale, dimensions }
  } catch {
    return { score: 0, rationale: `JSON parse error: ${raw.slice(0, 200)}` }
  }
}

function toScore(v: unknown): number {
  if (typeof v === 'number') return v >= 0.5 ? 1 : 0
  return 0
}
