# T1 — 手动导入 RBI K11 语义层定义 + AI-Native Enrichment

**Type**: task
**Status**: Resolved (2026-08-22) — Phase 1 执行完成
**Blocked by**: G3（已 resolved）

## Resolution

### Step A — RBI K11 完整迁移 ✅
- 从 `/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer/10000251/` 完整复制
- 结果：**321 tables + 453 events**（精确匹配 RBI 源），覆盖了原 10t+12e 种子
- `domains.yaml`/`terminology.yaml`/`config.yaml` 一并迁移

### Step B — AI-Native Enrichment 实现 ✅（对齐 G3 决策）
- `enrichment.ts`：`discoverRelationsDeterministic`（Pass 1 确定性 PK 匹配）+ `discoverRelationsFor`（Pass 2 LLM 综合推断）+ `enrichAllDwsTables` + `buildLlmPrompt`/`parseLlmRefs`/`buildDimInventory`
- dimension_refs：**126 个 DWS 表**已填充（带 derivation 依据；非 162，因部分 DWS 无匹配 DIM）
- metrics 提取：**3916 个**独立 metric 文件（`extractMetricsFromTable/Event/Tables` + `seedMetrics` + `metrics.ts`），结构为 `computation.sql/metadata` + `relations: [derived_from]`
- Service 方法 `ctx.schema.discoverRelations()` + on-write hook `enrichOnWrite`（`autoEnrich` 默认 true，mergeExisting 保留人工 curated joins）
- agent tool：`packages/data/tool-discover-relations/`

### 未完成
- events external_refs 第二轮（G3 决策 5 明确为"第二轮" deferred，可后续补）

### ⚠️ 发现的 runtime-wiring 缺口（P3/P4 依赖）

P2 ticket 声称 `loadRetrievalCorpusFromRegistry + buildCriticFields 聚合，88 tests 全绿`，但实际**只到组件 + 单测级别，未接进 `SemanticLayerService` runtime**：

1. **3 个 kind plugins 未注册**：`eventKindPlugin`/`tableKindPlugin`/`metricKindPlugin` 在 runtime 从未被 `.register()` 进 `DataSourceRegistry` — registry 运行时是空壳
2. **无 live RelationGraph**：`RelationGraph` 类 + `findJoinPath`/`getRelated`/`getDerived` 方法存在，但 runtime 没有从 K11 dimension_refs 构建/暴露 graph 实例；`loadRetrievalCorpusFromRegistry` 函数根本不存在
3. **检索语料只有 events**：`SemanticLayerService.loadRetrievalCorpus()` 委托给 events-only 的 `loadRetrievalCorpusFromLayer` — tables 和 metrics 不在语料里

**影响**：P3 的 join-path 注入（需 live graph）和 P4 的"BM25 命中 metric corpus item"路由（需 metrics 进语料）都无法直接开工。Phase 2 prompt 已加入 **Phase 1.5 前置补全**步骤（注册 kinds + 构建/暴露 live graph + 扩展语料含 tables/metrics）来填这个缺口。

## Question (历史)

将 reverse-bi 中 K11 的 curated YAML 定义手动复制到运行时目录，验证当前链路；并基于 G3 决策实现 AI-Native enrichment 工作流。
