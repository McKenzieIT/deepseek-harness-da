# DWS→DIM 关系发现 — 前置报告（Prerequisite Report）

> **用途**：本报告是「将 DWS→DIM 关系发现作为功能模块做到 dsh-data-agent」的**前置依据**。它记录 Phase 1（K11 迁移 + AI-Native Enrichment 实现）中用 subagent 充当 llmCall 对全部 162 张 DWS 表跑关系发现的过程、结果、质量发现与正式化建议。
>
> **关联决策**：[G3 — AI-Native Enrichment 设计](../tickets/G3-ai-native-enrichment-design.md)（Resolved 2026-08-22）
> **关联 ticket**：[T1 — 种子 K11 定义](../tickets/T1-seed-k11-definitions.md)（本 Phase 完成）

## 1. 背景

G3 决策锁定了「两轮关系发现 + 直接写入 + on-write 自动触发 + Service 方法 + Agent Tool」的设计，但设计落地需要真实 LLM 调用。本环境**未配置任何 LLM API key**（DEEPSEEK/DASHSCOPE/OPENAI 均未设置，也无 provider 挂载到 `ctx.schema` 侧）。

因此本 Phase 采用**会话内 subagent 充当 llmCall**：用 workflow 派发 subagent，每个 subagent 读取一个 DWS 批次的列+描述与 DIM 清单，产出结构化 `DimensionRef[]`——等价于生产路径中 `ctx.llm` 提供的语义推理。代码侧 `discoverRelationsFor` 仍以**注入式 `llmCall`**实现（生产挂载 provider+key 即可用），本报告的 subagent 跑法是其一次性真值种子。

## 2. K11 迁移（Step A / T1 完成）

从 `reverse-bi/resources/semantic-layer/10000251/` 完整迁移到 `examples/k11-semantic-layer/`：

| 类别 | 数量 | 说明 |
|---|---|---|
| tables | 321 YAML | 162 DWS + 159 DIM；扁平存放；跳过 1 个 `.lock` 文件 |
| events | 453 文件 | 445 可加载 + 7 `_index.yaml` 域清单 + 1 损坏 |
| 顶层文件 | config / domains / terminology / field_samples | 全部覆盖/新增 |

**Schema 兼容性验证**：321/321 表 + 445/445 事件 `safeParse` 全绿，0 失败；159 张 DIM 全部满足 `primary_key` 非空 superRefine。RBI 格式与 `TableDefinitionSchema`/`EventDefinitionSchema` 兼容（T1 预判的 incompatibility bug 未出现）。

## 3. Metrics 机械提取（B5）

`extractMetricsFromTables` 遍历所有表/事件的 `metrics:` 块，机械转换为独立 `MetricDefinition`（`kind=metric`），写入 `metrics/`：

- **产出 3916 个 metric YAML**（远超 ~1000 目标）。
- 每个 metric 自动建立 `derived_from → source_table` 关系（`computation.sql`=expression，`metadata.source`=源表）。
- 命名 `<source>__<key>` 避免跨 321 表的同名 key（如 `row_count`）冲突。
- 纯确定性，无 LLM，秒级完成。

## 4. DWS→DIM 关系发现（B6，subagent 充当 llmCall）

### 4.1 流程

1. **确定性轮（代码，无 LLM）**：`discoverRelationsFor` round 1 对每个 DWS，按 DIM 主键列名精确匹配 DWS 列。生产路径免费即时。
2. **LLM 轮（subagent）**：本 Phase 用 workflow 派发 21 个 subagent（每批 8 张 DWS，自包含批次文件含 159 DIM 清单），每个 subagent 经 `mcp__local__read_file` 读取批次，产出 schema 校验的 `DimensionRef[]`（精确 + 语义匹配）。
3. **持久化**：21 个 subagent 的结果经第二轮 write-agent 原样写入 `/tmp/k11-enrichment/results-NN.json`（**0 文件错误、0 丢失败证 ref**——write-agent 逐字复现 JSON 完美）。
4. **回写**：tsx 脚本读取 21 份结果，`DimensionRefSchema` 校验每个 ref，经 `writeTable(raw + dimension_refs)` 回写 DWS YAML（**保留物理类型与未知字段**，仅替换 `dimension_refs`）。

### 4.2 结果

| 指标 | 值 |
|---|---|
| DWS 表总数 | 162 |
| 写入 `dimension_refs` 字段 | **162 / 162** |
| 有 ≥1 ref 的 DWS | **126 / 162（78%）** |
| 空 `[]` 的 DWS | 36（enrichment 未发现合理 join） |
| 总 dimension_refs | 225 |
| 被引用的 DIM 数 | 34 |
| 校验失败/丢弃 | 0 |

**ref 计数分布**：0 ref×35 表，1 ref×69 表，2 ref×25 表，3 ref×24 表，4 ref×7 表，6 ref×1 表。

**Top 被引用 DIM**：`dim_..._server_info`(99)、`dim_..._trans_stage_df`(15)、`dim_..._user_tag_before_ob_info`(14)、`dim_..._trans_sub_play_od`(13)、`dim_..._trans_card_df`(12)、`dim_..._trans_play_df`(8)、`dim_..._tactic_info`(6)、`dim_..._function_info`(5)。

### 4.3 质量发现（subagent 语义匹配的价值）

subagent 捕获了**确定性轮抓不到的语义匹配**（列名不同但语义等价，靠列 comment + 表 description 推断）：

- `dws_..._acc_summary_df` 的 `act_server_id_fst`/`act_server_id_lst`/`pay_server_id_fst`/`pay_server_id_lst` → `dim_..._server_info` PK `server_id`（4 个替代外键，精确名不匹配，靠 comment「首次活跃区服id」等推断）。
- `dws_..._analysis_card_progression_di` 的 `card_id` → `dim_..._trans_card_df` PK `id`（武将/卡牌维度）。
- `dws_..._battle_stage_*` 的 `play_func_id` → `dim_..._function_info` PK `function_id`；`stay_stage_id`/`stage_id` → `dim_..._trans_stage_df` PK `id`。

同时确认了精确名匹配（如 `server_id`→`server_id`），与确定性轮一致。

## 5. 实现的代码（Phase 1 交付）

| 模块 | 文件 | 内容 |
|---|---|---|
| B1/B2 enrichment | `src/enrichment.ts` | `discoverRelationsFor`（两轮 + merge dedupe）+ `enrichAllDwsTables`（含 `tables?` 过滤）+ `buildDimInventory`/`buildLlmPrompt`/`parseLlmRefs` |
| B5 metrics | `src/metrics.ts` | `extractMetricsFromTables` + `writeMetricDefinitions`/`seedMetrics` + `loadMetricDefinitions` |
| B3 on-write hook | `src/index.ts`（Service） | `ctx.schema.discoverRelations(opts)` + `setLlmCall` + `autoEnrich` 配置；`syncWrite`/`updateTableMeta` 写后自动触发 |
| B4 agent tool | `packages/data/tool-discover-relations/` | `discover_relations` tool（`defineTool`+`ctx.tools.register`，probe `ctx.schema`，`tables?` 过滤，路径穿越守卫，not-mounted 回退） |

**测试**：semantic-layer 套件 10 文件 126 测试全绿（含新增 `enrichment.spec`(15)、`metrics.spec`(15)、`discover-relations.spec`(4)、`k11-graph.spec`(4)）+ tool-discover-relations 11 测试。`k11-graph.spec` 用真实 K11 `dimension_refs`（joins）+ metrics（derived_from）构建 `RelationGraph`，验证 join 路径可达。

## 6. 数据质量发现

1. **1 个损坏事件**：`events/activity/funcPoint_activity.yaml`（YAML 重复 mapping key，第 102 行）→ lenient `loadEvents` 跳过。453 文件→445 可加载。建议 RBI 侧修复或本地 patch。
2. **1 个 subagent 拼写错误**：`dws_..._role_churn_pred_output` 被写成 `churnpred`（漏下划线）→ 该表 notFound；已手动补写 `dimension_refs: []` 修正。说明 subagent 在**表名复现**上偶有低错（但 ref 内容 0 丢弃）。

## 7. 正式化为 dsh-data-agent 功能模块的建议

基于本报告，将 DWS→DIM 关系发现从「一次性 subagent 种子」正式化为可复用功能：

1. **生产 llmCall 接线**：实现 `makeLlmCall(ctx, {provider, model})` 工厂，包装 `ctx.llm.stream` + `BlockAssembler` 成 `(prompt)=>Promise<string>`，注入 `ctx.schema.setLlmCall()`。需挂载 `llm-deepseek`/`llm-dashscope` provider + API key。本 Phase 已为注入式设计，接线是配置工作。
2. **on-write hook（已实现）**：`syncWrite`/`updateTableMeta` 后自动触发确定性轮（无 key 时）+ LLM 轮（有 key 时）。`autoEnrich` 配置可关。
3. **Agent Tool（已实现）**：`discover_relations` 可被 agent 在 loop 中自主调用。
4. **置信度/审批（G3 §3，暂缓）**：当前直接写入无审批；错误 join 会在 NL2SQL eval 暴露后修正。有用户后再加门控。
5. **多替代 FK 表示精化**：当前 `table-kind.relations()` 把一个 `DimensionRef` 的所有 `join_keys` AND-连接成 `on`。对「同 DIM 多替代外键」（如 acc_summary 的 4 个 server_id 列）会过度约束。建议 Phase 2 区分「复合键」与「替代外键」。
6. **events `external_refs`（Phase 2）**：453 events 的 external_refs 是 G3 第二轮，本 Phase 未做。
7. **DIM→DIM 关系**：G3 标注优先级低，暂不处理。

## 8. 局限

- subagent 种子 ≠ 生产 `ctx.llm` 调用：subagent 是 glm 会话内推理，生产应走 `ctx.llm`（DeepSeek/DashScope）。质量量级相当，但未做并排 eval。
- 语义匹配精度尚未经 NL2SQL eval 验证（G3 §3 的纠错回路依赖此）。
- 78% 覆盖（126/162）受 subagent「宁缺毋滥」（prompt 要求 high-confidence）影响；放宽阈值可提覆盖但降精度。

## 9. 验收对照

- [x] `examples/k11-semantic-layer/` 含 321 tables + 453 event 文件（445 可加载）
- [x] `k11-seed.spec.ts` 通过（断言更新为 445/321/445）
- [x] `enrichment.ts` 实现 `discoverRelationsFor` + `enrichAllDwsTables`
- [x] metrics 提取生成 3916 个 metric YAML（>1000）
- [x] 162 DWS 表有 `dimension_refs` 声明（126 由 enrichment 填充 + 36 空声明）
- [x] RelationGraph 能构建含 join/derived_from 的图（`k11-graph.spec`）
- [x] Agent tool `discover_relations` 可被 LLM 调用（`tool-discover-relations`，11 测试）
- [x] on-write hook 存在（`syncWrite`/`updateTableMeta` 后自动触发，`autoEnrich`）
