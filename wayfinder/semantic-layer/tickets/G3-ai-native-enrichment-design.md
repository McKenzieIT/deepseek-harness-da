# G3 — AI-Native Enrichment 工作流设计

**Type**: grilling
**Status**: Resolved (2026-08-22)
**Claimed by**: wayfinder session (Phase 0)
**Blocked by**: —

## Question

RBI 源仓库的 322 tables + 453 events 均没有 `dimension_refs`/`external_refs` 声明。Relations 需要从零发现。设计 LLM 辅助的关系发现 + 语义丰富化工作流。

## Resolution

### 1. 关系发现信号：两轮策略

- **第一轮 — 确定性（无 LLM）**：对 26 个有明确 primary_key 声明的 DIM 表，做列名精确匹配（DWS 的 `foo_id` ↔ DIM PK `foo_id`）。产出高精度种子集。
- **第二轮 — LLM 辅助**：对每个 DWS 表，将其列清单 + description + 全部 DIM 表清单（表名 + PK + description）喂给 LLM，综合所有信号（命名约定、description 引用、列语义）一次性输出 `dimension_refs` 建议。
- **不做置信度分级**：所有结果统一直接写入（见决策 3）。

### 2. 触发机制：批量 + 自动触发

- **初始批量**：对已有 321 表全量跑一轮（一次性动作）。
- **自动触发**：语义层定义变更后自动触发关系发现。这是 dsh-data-agent 的**核心能力**，不是可选 hook。
- 实现为 Service 层 write-path 后置 hook：任何通过 `ctx.schema` 写入的定义，写完自动跑 `discoverRelationsFor(def, allDims)`。

### 3. 审批流程：直接写入

- LLM 推断结果直接写入 YAML `dimension_refs`/`external_refs`，无 pending 队列。
- 理由：当前无用户、无兼容负担；错误 join 在 NL2SQL eval 中会被暴露，然后修正。
- 等项目有用户后再加审批门控。

### 4. 实现载体：Service 方法 + Agent Tool

- **Service 方法**：`ctx.schema.discoverRelations(scope?: string[])` — 底层实现，on-write hook 调用。
- **Agent Tool**：暴露给 LLM agent，使其可自主判断何时跑 enrichment。
- **不单独做 CLI**：无消费者，后续需要时可通过 agent tool 包装暴露。

### 5. K11 优先级：DWS 优先

- **第一轮**：全量 162 个 DWS 表 → DIM 关系发现（`dimension_refs`）。成本可控（~162 次 LLM 调用）。
- **第二轮**：453 events 的 `external_refs`。
- DIM→DIM 关系优先级低，暂不处理。

### 6. Metrics 种子：机械提取 + LLM 补充

- **Phase 1 — 机械提取**：遍历所有表的 `metrics:` 块（302 表，约 1000-1500 条），每个 entry 生成独立 metric YAML 文件。确定性转换，不需要 LLM。每个 metric 天然关联源表（`derived_from` 关系自动成立）。
- **Phase 2 — LLM 发现**：后续让 LLM 分析业务场景，发现跨表复合指标（如"付费率 = 付费UV / 活跃UV"）。

### 架构推论

- enrichment 核心函数：`discoverRelationsFor(targetDef, dimInventory) → DimensionRef[]`
- on-write hook 嵌入 `ctx.schema` write 路径
- 批量初始化 = 循环调用同一 Service 方法
- metrics 提取是独立确定性步骤，可与关系发现并行

## Phase 1 Implementation（2026-08-22）

落地于 `packages/data/semantic-layer/` + 新 tool 包，全套件 126 测试绿：

- **B1/B2** `src/enrichment.ts`：`discoverRelationsFor`（确定性 PK 名轮 + 注入式 `llmCall` LLM 轮 + `mergeRefs` 按 `dim_table` 去重并集 join_keys）+ `enrichAllDwsTables`（`tables?` 过滤，`writeTable(raw+refs)` 保留物理类型）。`llmCall` 注入式，substrate 不引 `dsh-llm`（保持 zod+js-yaml 依赖洁净）。
- **B3** `ctx.schema.discoverRelations(opts)` + `setLlmCall` + `autoEnrich` 配置；`syncWrite`/`updateTableMeta` 写后自动触发（best-effort，substrate `writeTable` 不递归）。
- **B4** `packages/data/tool-discover-relations/`：`discover_relations` agent tool（`defineTool`，probe `ctx.schema`，`tables?` 过滤，路径穿越守卫，not-mounted 回退）。
- **B5** `src/metrics.ts`：`extractMetricsFromTables` → 3916 个 `MetricDefinition`（`derived_from → source`，`<source>__<key>` 命名）。
- **B6 K11 真值种子**：本环境无 LLM key，用会话 subagent 充当 `llmCall` 跑全部 162 DWS → **126 表得 225 个 dimension_refs**（34 个 DIM）。详见 [dws-dim-discovery-report](../research/dws-dim-discovery-report.md)。

**遗留**：生产 `llmCall` 接线（`makeLlmCall(ctx.llm)` 工厂）、多替代 FK 表示精化、events `external_refs`（G3 第二轮）——见报告 §7 建议，作为 fog 待后续 ticket 化。
