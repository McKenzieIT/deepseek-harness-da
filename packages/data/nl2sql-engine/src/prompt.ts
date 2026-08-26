/**
 * P13b NL→SQL engine — SQL-generation prompt (the GENERATION phase prompt
 * section content). Ported from `prototypes/p13-nl2sql-engine/prompt.mjs`,
 * which ports RBI `resources/prompts/v2-baseline.md` §3 staged SOP + §6 八规则
 * + §5 诚实拒答 + tool catalog + MAX_SQL_PER_TURN + P7 four-phase adaptation
 * + conventions dialect grounding.
 *
 * Production runtime is agent-loop-driven (P7): the agent LLM generates SQL
 * as text in GENERATION; P7b's phase-gate injects this section via
 * `ctx.systemPrompt.assemble` when phase=generation. This module EXPORTS the
 * section content; it does not call `ctx.systemPrompt` itself (that wiring is
 * P7b's — P13b grilling Q2/Q3 boundary).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/prompt
 */
import { MAX_SQL_PER_TURN, MAX_FEEDBACK_RETRIES } from './types.ts'
import { renderConventionsPrompt } from './conventions.ts'
import type { EngineConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'
import type { RetrievalHit } from './bm25-linking.ts'

function granularityTag(id: string): string {
  if (/_di$/.test(id)) return ' [日粒度]'
  if (/_df$/.test(id)) return ' [快照]'
  return ''
}

/** Minimal event-definition shape the prompt renders (full P6 zod schema arrives with P6b). */
export interface EventDefinitionLite {
  readonly params_fields?: Record<string, unknown>
  readonly partitions?: readonly { readonly name: string }[]
  readonly [k: string]: unknown
}

/** Arguments for building the SQL-generation prompt. */
export interface BuildPromptArgs {
  readonly question: string
  readonly candidates: readonly RetrievalHit[]
  readonly eventDef: EventDefinitionLite | null | undefined
  readonly conventions: EngineConventions | null | undefined
  readonly phase?: string
  /** P3 C1: declared JOIN constraints (graph-derived) injected as hard constraints. */
  readonly joinConstraints?: readonly string[] | undefined
  /** P4 D3: known metric definitions injected as context for mixed queries. */
  readonly metricContext?: string | undefined
  /** P14b: trend intent detected — enables rule 9 (granularity preference). */
  readonly isTrend?: boolean
  /** Reference date (yyyyMMdd) for relative date computation (yesterday, last 7 days). */
  readonly today?: string
}

const TOOL_CATALOG = `# 工具集（da harness tool seam 映射）
- search_data_sources(query): BM25 schema-linking 检索返候选数据源（P13b bm25-linking；production 经 P5 ctx.retrieval seam）
- load_event_definition(event_name): 加载事件定义（params_fields/metrics/external_refs）；SQL FROM/WHERE event/字段来自此返回不得硬编码（P6 ctx.schema）
- query_data(sql): 执行 SQL（仅 SELECT，必带 ds 分区）；内置 CostGuard+探索预算（MAX_SQL_PER_TURN=${MAX_SQL_PER_TURN}）；返 3-state（done+result_id / running+instance_id / failed+error+failureKind）（P4 ctx.query.execute）
- check_query(instance_id): 续取运行中查询（P4 ctx.query.attach）
- critique_sql_tool(sql, question): pre-exec critic（P13b critic 填 P7 sql_syntax_gate 槽）
- load_table_dimensions(table_name): DWS 表维表定义+JOIN 安全判定（P6 ctx.schema）
- save_accumulated_definition(concept, def): 术语沉淀（P6 ctx.schema）
- lookup_terminology(term): 术语查询
[drop] plan_query（LATENT，不在任何 phase allowlist，research §1.2 证）`

/**
 * Build the SQL-generation prompt (the GENERATION phase prompt section content):
 * staged SOP + tool catalog + conventions dialect grounding + candidates + question.
 *
 * @param args - The prompt-building arguments (question, candidates, event def, conventions, phase).
 * @returns The assembled prompt string.
 */
export function buildPrompt(args: BuildPromptArgs): string {
  const { question, candidates, eventDef, conventions, phase = 'generation', joinConstraints, metricContext, isTrend } = args
  const dialect = renderConventionsPrompt(conventions)
  const candLines =
    candidates && candidates.length > 0
      ? candidates
        .map(c => `- ${c.id}${granularityTag(c.id)}: ${c.payload?.description ?? c.id} (score=${Number(c.score).toFixed(3)})`)
        .join('\n')
      : '（无候选）'
  const joinSection = joinConstraints && joinConstraints.length > 0
    ? `\n# 已知 JOIN 关系（必须使用，勿自行推断 JOIN key）\n${joinConstraints.map(c => `- ${c}`).join('\n')}\n`
    : ''
  const metricSection = metricContext
    ? `\n# 已知指标定义（请基于此规则构建查询）\n${metricContext}\n`
    : ''
  return `你是游戏埋点数据分析 Agent。宁可少答慢答，不可错答。

${TOOL_CATALOG}

# §3 直答路径（staged SOP）
## 阶段 A 准备
- 复合判断门：≥2 不同性质指标 / ≥2 层维度交叉 / "对比"语义 / 模糊结论词 → 复合，拆原子子问题各一条 SQL
- 字段清单校验：SQL 每个字段名（尤其 params 内）须在 load_event_definition 返回的 params_fields/metrics 有定义，不得硬编码

## 阶段 B 生成
- 方案先行：query_data 前在思维链形成方案（视图/过滤/指标/维度/预期量级）

## 阶段 C 校验
- Pre-exec critic：生成 SQL 后执行前调 critique_sql_tool(sql, question)
- 改过 SQL 必须重新 critique（指纹同源门拒执未经重评的 SQL）

## 阶段 D 执行与防护
- 返回态处置：
  - 仍在运行（instance_id 无 result_id）：禁止重发原 SQL，改 check_query(instance_id) 续取，最多 3 次
  - parse_failed：修 SQL 重 critique 再执行（可修复）
  - 不可修复→§5 拒绝：TABLE_NOT_FOUND / FIELD_NOT_FOUND / SEMANTIC_MISMATCH / PERMISSION_DENIED
- 可修复（分区缺失/CAST 遗漏/别名冲突/语法错误）→ 带错误信息重新生成，不得重复相同 SQL（近重复门防重发）

# §5 诚实拒绝
触发：语义层无定义/params 无字段/自修 ${MAX_FEEDBACK_RETRIES} 次仍失败/发现路径走不通。拒时说明：为什么不能答/缺什么/怎么解决。不做降级，不给"仅供参考"。

# §6 八规则
1. 分区表必带 ds（yyyyMMdd）；非分区 DIM 不带 ds；_df 后缀日期不明用 MAX_PT
2. 去重主体由用户意图：角色→role_id，账号→account_id
3. params 用 GET_JSON_OBJECT(params,'$.字段')，数值前 CAST AS BIGINT/DOUBLE
4. JOIN 规则：跨日多事件 JOIN 禁；同日同主体交集许可；维表 lookup JOIN 受控
5. NULLIF(COUNT(*),0) 防除零
6. 复合问题拆多条原子 SQL
7. 时效：埋点 ~10min，通用数仓 T+1
8. 千位以上加千分位${isTrend ? '\n9. 趋势/时序类问题优先使用 _di（日粒度增量）表；_df（快照）表仅在无 _di 候选时使用' : ''}

# 方言规范（maxcompute conventions seam 注入）
${dialect}

${joinSection}${metricSection}
# 当前日期
今天是 ${args.today ?? '未知'}（yyyyMMdd 格式）。"昨天"= 今天-1 天，"过去7天"= 从今天往回7天。ds 分区格式同为 yyyyMMdd。计算相对日期时用字面值，不要用 GETDATE() 或运行时函数。

# 当前问题
${question}

# 检索候选（search_data_sources BM25-only）
${candLines}

# 事件定义（load_event_definition）
${eventDef ? JSON.stringify(eventDef, null, 2) : '（未加载）'}

# 当前阶段（P7 四阶段适配：phase=${phase}）
GENERATION 阶段：生成 SQL（\`\`\`sql 围栏），调 critique_sql_tool 校验，过 gate 后 query_data 执行。`
}

/** Arguments for building the eval-mode SQL-generation prompt. */
export interface BuildEvalPromptArgs {
  readonly question: string
  readonly candidates: readonly RetrievalHit[]
  readonly conventions: EngineConventions | null | undefined
  readonly joinConstraints?: readonly string[] | undefined
  readonly metricContext?: string | undefined
  /** P14b: trend intent detected — enables rule 9 (granularity preference). */
  readonly isTrend?: boolean
}

/**
 * Build a simplified eval-mode prompt focused on SQL generation quality.
 * No agent persona, no tool catalog, no multi-turn SOP — just the core
 * SQL generation task with schema context. The thinking model's reasoning
 * about these definitions provides diagnostic signal for semantic layer
 * optimization.
 */
export function buildEvalPrompt(args: BuildEvalPromptArgs): string {
  const { question, candidates, conventions, joinConstraints, metricContext, isTrend } = args
  const dialect = renderConventionsPrompt(conventions)
  const candLines =
    candidates && candidates.length > 0
      ? candidates
        .map(c => `- ${c.id}${granularityTag(c.id)}: ${c.payload?.description ?? c.id} (score=${Number(c.score).toFixed(3)})`)
        .join('\n')
      : '（无候选）'
  const joinSection = joinConstraints && joinConstraints.length > 0
    ? `\n# 已知 JOIN 关系（必须使用，勿自行推断 JOIN key）\n${joinConstraints.map(c => `- ${c}`).join('\n')}\n`
    : ''
  const metricSection = metricContext
    ? `\n# 已知指标定义（请基于此规则构建查询）\n${metricContext}\n`
    : ''
  return `你是 SQL 生成引擎。根据下方检索到的候选表定义和用户问题，生成一条 MaxCompute SQL。

# 输出要求
- 用 \`\`\`sql 围栏包裹最终 SQL
- 如果候选表定义不足以回答问题，说明缺少什么信息

# 方言规范
${dialect}
${joinSection}${metricSection}
# 候选表定义（BM25 检索结果）
${candLines}

# 核心规则
1. 分区表必带 ds（yyyyMMdd）；非分区 DIM 不带 ds；_df 后缀日期不明用 MAX_PT
2. 去重主体由用户意图：角色→role_id，账号→account_id
3. params 用 GET_JSON_OBJECT(params,'$.字段')，数值前 CAST AS BIGINT/DOUBLE
4. JOIN 规则：跨日多事件 JOIN 禁；同日同主体交集许可；维表 lookup JOIN 受控
5. NULLIF(COUNT(*),0) 防除零
6. 复合问题拆多条原子 SQL
7. 时效：埋点 ~10min，通用数仓 T+1
8. 千位以上加千分位${isTrend ? '\n9. 趋势/时序类问题优先使用 _di（日粒度增量）表；_df（快照）表仅在无 _di 候选时使用' : ''}

# 用户问题
${question}`
}
