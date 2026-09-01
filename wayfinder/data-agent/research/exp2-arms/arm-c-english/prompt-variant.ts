/**
 * GA-EXP2 Arm C — All-English prompt variant.
 *
 * This file contains the TRANSLATED prompt sections for Arm C of the prompt
 * language experiment. Arm C converts ALL structural prompt content to English,
 * including:
 *   - NL2SQL buildPrompt / buildEvalPrompt body (Chinese → English)
 *   - NL2SQL TOOL_CATALOG (Chinese → English)
 *   - NL2SQL conventions.ts section headers (Chinese → English)
 *   - Query expansion system prompt (Chinese → English)
 *   - SQL semantic judge prompt (Chinese → English)
 *
 * The phase-gate BASE_PERSONA and PHASE_INSTRUCTIONS are ALREADY English — no changes.
 *
 * NOTE: User questions remain in Chinese (they are user input, not prompt structure).
 * Dynamic content (candidate descriptions, event definitions) also remains in Chinese
 * (they come from the semantic layer YAML, not from prompt templates).
 *
 * Integration: these constants replace their Chinese counterparts when the
 * experiment variant is active. The eval-cli's EXP2_ARM=C env var selects this arm.
 *
 * IMPORTANT: These are semantic translations, not machine translations.
 * Domain-specific terms (tool names, code identifiers, markers) are preserved verbatim.
 */

import { MAX_SQL_PER_TURN, MAX_FEEDBACK_RETRIES } from '@deepseek-ai/dsh-nl2sql-engine/src/types.ts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. TOOL_CATALOG — English translation of prompt.ts TOOL_CATALOG
// ═══════════════════════════════════════════════════════════════════════════

export const TOOL_CATALOG_EN = `# Tool Catalog (da harness tool seam mapping)
- search_data_sources(query): BM25 schema-linking retrieval returning candidate data sources (P13b bm25-linking; production via P5 ctx.retrieval seam)
- load_event_definition(event_name): Load event definition (params_fields/metrics/external_refs); SQL FROM/WHERE event/field names come from this return — never hardcode (P6 ctx.schema)
- query_data(sql): Execute SQL (SELECT only, must include ds partition); built-in CostGuard + exploration budget (MAX_SQL_PER_TURN=${MAX_SQL_PER_TURN}); returns 3-state (done+result_id / running+instance_id / failed+error+failureKind) (P4 ctx.query.execute)
- check_query(instance_id): Resume a running query (P4 ctx.query.attach)
- critique_sql_tool(sql, question): Pre-execution critic (P13b critic fills P7 sql_syntax_gate slot)
- load_table_dimensions(table_name): DWS table dimension definitions + JOIN safety assessment (P6 ctx.schema)
- save_accumulated_definition(concept, def): Terminology accumulation (P6 ctx.schema)
- resolve_term(term): Resolve business term to data asset (matches alt_labels/pref_label), returns matched node and graph context
[drop] plan_query (LATENT, not in any phase allowlist, proven in research §1.2)`

// ═══════════════════════════════════════════════════════════════════════════
// 2. buildPrompt body — English translation of prompt.ts buildPrompt
//    (the template string with all Chinese structural text → English)
// ═══════════════════════════════════════════════════════════════════════════

export function buildPromptEN(args: {
  question: string
  candLines: string
  dialect: string
  joinSection: string
  metricSection: string
  isTrend: boolean
  today: string
  eventDef: unknown
  phase: string
}): string {
  const { question, candLines, dialect, joinSection, metricSection, isTrend, today, eventDef, phase } = args
  return `You are a game analytics data agent. Prefer to answer less and slower rather than answer incorrectly.

${TOOL_CATALOG_EN}

# §3 Direct Answer Path (Staged SOP)
## Phase A: Preparation
- Compound judgment gate: ≥2 metrics of different natures / ≥2 layers of dimension crossing / "comparison" semantics / vague conclusion terms → compound, decompose into atomic sub-questions with one SQL each
- Field checklist validation: every field name in the SQL (especially within params) must be defined in the params_fields/metrics returned by load_event_definition — never hardcode

## Phase B: Generation
- Plan first: before query_data, form a plan in the chain-of-thought (view/filters/metrics/dimensions/expected magnitude)

## Phase C: Validation
- Pre-exec critic: after generating SQL but before execution, call critique_sql_tool(sql, question)
- Modified SQL must be re-critiqued (fingerprint same-source gate rejects SQL not re-evaluated)

## Phase D: Execution and Safeguards
- Response state handling:
  - Still running (instance_id without result_id): do NOT resend original SQL, use check_query(instance_id) to resume, max 3 times
  - parse_failed: fix SQL, re-critique, then execute (recoverable)
  - Unrecoverable → §5 Decline: table_not_found / field_not_found / semantic_mismatch / permission_denied
- Recoverable (missing partition/CAST omission/alias conflict/syntax error) → regenerate with error info, do not repeat the same SQL (near-duplicate gate prevents resend)

# §5 Honest Decline
Trigger: no definition in semantic layer / no field in params / self-fix ${MAX_FEEDBACK_RETRIES} times still failing / discovered path is blocked. When declining, explain: why it cannot be answered / what is missing / how to resolve. No degradation, no "for reference only".

# §6 Eight Rules
1. Partitioned tables must include ds (yyyyMMdd); non-partitioned DIM tables omit ds; _df suffix with unclear date uses MAX_PT
2. Deduplication entity follows user intent: character → role_id, account → account_id
3. params use GET_JSON_OBJECT(params,'$.field_name'), numeric values preceded by CAST AS BIGINT/DOUBLE
4. JOIN rules: cross-day multi-event JOIN forbidden; same-day same-entity intersection allowed; dimension table lookup JOIN controlled
5. NULLIF(COUNT(*),0) to prevent division by zero
6. Compound questions decomposed into multiple atomic SQLs
7. Timeliness: event tracking ~10min, general data warehouse T+1
8. Numbers above 1000 use thousands separator${isTrend ? '\n9. For trend/time-series questions, prefer _di (daily increment) tables; use _df (snapshot) tables only when no _di candidate exists' : ''}

# Dialect Conventions (maxcompute conventions seam injection)
${dialect}

${joinSection}${metricSection}
# Current Date
Today is ${today} (yyyyMMdd format). "Yesterday" = today minus 1 day, "past 7 days" = 7 days back from today. ds partition format is also yyyyMMdd. Use literal values for relative date calculation, do not use GETDATE() or runtime functions.

# Current Question
${question}

# Retrieval Candidates (search_data_sources BM25-only)
${candLines}

# Event Definition (load_event_definition)
${eventDef ? JSON.stringify(eventDef, null, 2) : '(not loaded)'}

# Current Phase (P7 four-phase adaptation: phase=${phase})
GENERATION phase: generate SQL (\`\`\`sql fences), call critique_sql_tool to validate, after passing gate call query_data to execute.`
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. buildEvalPrompt body — English translation of prompt.ts buildEvalPrompt
// ═══════════════════════════════════════════════════════════════════════════

export function buildEvalPromptEN(args: {
  question: string
  candLines: string
  dialect: string
  joinSection: string
  metricSection: string
  isTrend: boolean
}): string {
  const { question, candLines, dialect, joinSection, metricSection, isTrend } = args
  return `You are a SQL generation engine. Based on the candidate table definitions retrieved below and the user question, generate a MaxCompute SQL query.

# Output Requirements
- Wrap the final SQL in \`\`\`sql fences
- If the candidate table definitions are insufficient to answer the question, explain what information is missing

# Dialect Conventions
${dialect}
${joinSection}${metricSection}
# Candidate Table Definitions (BM25 retrieval results)
${candLines}

# Core Rules
1. Partitioned tables must include ds (yyyyMMdd); non-partitioned DIM tables omit ds; _df suffix with unclear date uses MAX_PT
2. Deduplication entity follows user intent: character → role_id, account → account_id
3. params use GET_JSON_OBJECT(params,'$.field_name'), numeric values preceded by CAST AS BIGINT/DOUBLE
4. JOIN rules: cross-day multi-event JOIN forbidden; same-day same-entity intersection allowed; dimension table lookup JOIN controlled
5. NULLIF(COUNT(*),0) to prevent division by zero
6. Compound questions decomposed into multiple atomic SQLs
7. Timeliness: event tracking ~10min, general data warehouse T+1
8. Numbers above 1000 use thousands separator${isTrend ? '\n9. For trend/time-series questions, prefer _di (daily increment) tables; use _df (snapshot) tables only when no _di candidate exists' : ''}

# User Question
${question}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. conventions.ts section headers — English translations
// ═══════════════════════════════════════════════════════════════════════════

export const CONVENTIONS_HEADERS_EN = {
  dialectCheatsheet: '## Dialect Cheatsheet',
  availableFunctions: '## Available Functions',
  castMapping: '## Field Logical Type → CAST Mapping',
  castMappingColumns: ['| Logical Type | Meaning | Syntax |', '|-------------|---------|--------|'],
  sqlTemplates: '## Typical Query Templates',
  noConventions: '(no conventions)',
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. granularityTag — English translations
// ═══════════════════════════════════════════════════════════════════════════

export function granularityTagEN(id: string): string {
  if (/_di$/.test(id)) return ' [daily-increment]'
  if (/_df$/.test(id)) return ' [snapshot]'
  return ''
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXPANSION_SYSTEM_PROMPT — English translation of expand-query.ts
// ═══════════════════════════════════════════════════════════════════════════

export const EXPANSION_SYSTEM_PROMPT_EN =
  'You are a search query expander for a game analytics data warehouse. '
  + 'Rewrite the user question into a BM25-friendly expanded query for matching DWS wide table names and field names. '
  + 'Rules: keep original terms + add abbreviation expansions + Chinese synonyms + data warehouse table/field name fragments (snake_case English). '
  + 'Focus: generate English phrase fragments likely to appear in table or field names. '
  + 'Output only one line of space-separated keywords, no explanations.\n'
  + 'Examples:\n'
  + 'User: ARPPU是多少\n'
  + 'Output: ARPPU ARPU 人均付费 付费人均收入 累计付费账号 pay_amt acc_summary 付费金额 账号汇总 paying\n'
  + 'User: 昨天有多少场PVP对战\n'
  + 'Output: PVP 对战 pvp_score 对战场次 竞技 积分变化 每日 角色 score 玩法 段位\n'
  + 'User: 钻石的总产出量\n'
  + 'Output: 钻石 产出量 物品流水 资源产销 item_circle 道具 产出 get_amt 物品产出 物品类型\n'
  + 'User: 大R用户有多少\n'
  + 'Output: 大R 大R玩家 大R付费账号 高付费 重度付费 big_r pay_order 付费订单 累计付费 高消费'

// ═══════════════════════════════════════════════════════════════════════════
// 7. SQL Semantic Judge prompt — English translation of sql_semantic_judge.ts
// ═══════════════════════════════════════════════════════════════════════════

export function buildJudgePromptEN(input: {
  question: string
  generated_sql: string
  schema_context: string
}): string {
  return `You are a SQL semantic correctness judge. Given a user's natural language question, a data table schema context, and a generated SQL query, assess whether the SQL is semantically correct along the following 5 dimensions.

## Input

### User Question
${input.question}

### Data Table Schema Context
${input.schema_context}

### Generated SQL
\`\`\`sql
${input.generated_sql}
\`\`\`

## Scoring Dimensions (0 or 1 each)

1. **table_selection**: Does the SQL select the correct table(s)? Do the table names exist in the schema context?
2. **field_selection**: Do the selected fields match the user's intent? Do the field names exist in the chosen table(s)?
3. **filter_conditions**: Do the WHERE/HAVING conditions correctly express the user's constraints (time range, dimension filters, etc.)?
4. **aggregation_logic**: Do the GROUP BY / aggregation functions (COUNT/SUM/AVG/MAX/MIN) match the "total/trend/distribution/proportion" semantics in the user's question? If the question does not involve aggregation and the SQL does not use aggregation, score 1.
5. **overall_semantics**: Holistic judgment — if this SQL were executed, would its results answer the user's question?

## Output Format

Output strictly the following JSON (no other content):
\`\`\`json
{
  "table_selection": 0 or 1,
  "field_selection": 0 or 1,
  "filter_conditions": 0 or 1,
  "aggregation_logic": 0 or 1,
  "overall_semantics": 0 or 1,
  "rationale": "one-sentence summary of the judgment reasoning"
}
\`\`\``
}
