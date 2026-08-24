# wayfinder:map — dsh-data-agent 语义层

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储。

## Destination

将 dsh-data-agent 的语义层从「代码存在但不可用」变为「端到端真正可用」：

1. **核心链路跑通**：用户自然语言提问 → 语义层提供足够上下文（检索 + 定义加载）→ NL2SQL 生成正确 SQL → 执行 → 返回结果。以全链路可用为验收标准。
2. **架构正确**：语义层是可扩展的数据源注册表（不锁死表+事件），与查询引擎解耦（provider 可插拔），per-scope namespace 隔离，定义存储在运行时可配置路径。
3. **Web UI 可管理**：通过 dsh 插件化机制提供管理界面（浏览/搜索、编辑、scope 管理、质量监控）。
4. **Ontology 决策落地**：完成知识图谱/ontology 调研，决定其在 data-agent 中的角色和实现方式，若决策为引入则实现之（限于 Phase 1-3；Phase 4 可视化+自动发现明确 out of scope）。
5. **管理 agent 证据闭环**（③-gated，v1 后展开）：管理 agent 可通过 eval 证据自校准朝 goal 推进（autonomous goal loop），实现语义层质量的自主持续改善。v1 阶段仅建证据基建+人驱管理面；③ 自驱循环在 v1 ①② 栈完成后作为本 map 的后续阶段展开。

前提：项目处于开发期、无用户、无兼容负担。任何不满足要求的现有代码可推翻重来。

### 验收假设（外部依赖）

Destination 第 1 条「全链路可用」的验收依赖以下外部系统在现有能力下能配合新语义层工作：

| 外部系统 | 假设 | 若不满足 |
|----------|------|----------|
| NL2SQL 引擎（`nl2sql-engine`） | 能消费 `registry.toPromptContext()` 产出的格式化文本作为上下文 | 本 map 修改格式化适配层（不改引擎核心逻辑） |
| Query engine（`ctx.query.execute`） | 能执行 NL2SQL 生成的 SQL 并返回结果 | 超出本 map 范围；需协调 data-agent map |
| dsh 插件化机制（Cordis + Client UI Slot） | 已就绪且支持新增管理 UI 插件 | R3/R6 已验证可行；若 upstream 变更需同步适配 |
| Eval 核心（`packages/eval/eval`） | 现有接口可被 W3 runner 调用而不改核心 | 2 wiring caveats（W3 已追踪）；若需改核心则与 data-agent map 协调 |

## Notes

- **域**：dsh-data-agent 语义层端到端可用 + Web UI 管理 + Ontology 知识图谱能力 + ③ 管理 agent 证据闭环。
- **③ 定义**：③ = 自驱循环阶段门禁。标记为 ③-gated 的 ticket/能力 在 v1 ①② 栈（W1-W5-full）完成后才展开。③ 的核心 = 管理 agent 用 eval 证据自校准朝 goal 推进的 autonomous loop。
- **每会话应查 skills**：`dsh-plugin-development`、`grilling` + `domain-modeling`、`research`、`prototype`。
- **术语约定**（消除漂移）：
  - **SchemaProvider**：代码中的接口名（PascalCase）。文中用「schema provider」指代概念时统一小写带空格。
  - **scope**：纯逻辑划分单元（用户自定义）。代码中 scope 内部通过文件系统目录实现隔离，但 scope ≠ namespace——scope 是业务概念，namespace 是隔离机制。
  - **定义（definition）**：本 map 中特指语义层中的数据源定义（`TableDefinition` / `EventDefinition` / `MetricDefinition`）。「定义版本管理」管理的是这些定义的变更历史，非 ontology 层概念。
- **常设原则**：
  - **不做过渡方案**：LLM 编码场景下，直接做目标架构，不分短/中/长期妥协。
  - **语义层不绑定特定查询引擎**：SchemaProvider 可插拔（`registerSchemaProvider` + `engineType` 路由）。
  - **scope = 纯逻辑划分**：用户自定义划分方式，文件系统目录作隔离实现。
  - **语义层默认空白**：由用户/管理员填充。
  - **数据源类型可扩展**：不锁死「表 + 事件」；新增 kind = 实现一个 `DataSourceKindPlugin`。
  - **无兼容负担（对外）**：对外部消费者（preset、bundle config、用户 YAML）无需保持向后兼容。对内部已验证代码（G1 已决定保留的基础设施），重构扩展而非无意义重写。
- **现有基础设施**（重构扩展，非推翻——G1 决策）：
  - `packages/data/semantic-layer/` — types.ts 保留，io.ts/index.ts 重构扩展
  - `packages/data/tool-load-{table,event}-definition/` — 通过 `registry.toPromptContext()` 格式化（格式契约 = 纯文本，NL2SQL 引擎直接消费）
  - `packages/data/tool-search-data-sources/` — 通过 `registry.toCorpusItem()` 聚合 corpus（格式契约 = `CorpusItem {id, description, metrics, payload}`）
  - bundle 已挂载 semantic-layer 但 semanticRoot 为空（P1 的 `dsh-scope-registry` 解决配置指向）

## Decisions so far

- 验收标准 = 全链路跑通（检索 → SQL → 执行 → 结果）
- 数据来源 = RBI 一次性手动导入 + 可插拔 schema provider 自动发现
- 配置 = per-scope 可配置路径，运行时目录
- scope = 纯 namespace
- Web UI 核心场景 = 浏览/搜索 + 编辑 + scope 管理 + 质量监控
- [R1 数据模型调研](research/r1-data-model-design.md) — 方案 B 推荐，per-kind plugin 保留类型安全 + 检索层已类型无关
- [R2 Ontology 调研](research/r2-ontology-comprehensive.md) — ontology = 语义层 + relations 声明 + in-memory 图；不引入独立系统
- [R3 Harness 插件化调研](research/r3-harness-plugin-system.md) — Cordis plugin 模型 + Client UI Slot 系统，新增插件有清晰 pattern
- [R4 Schema Provider 插件化调研](research/r4-schema-provider-plugin.md) — 对齐 LLM pattern：registerSchemaProvider + engineType 路由 + disposer
- [R5 Web UI 调研](research/r5-web-ui-semantic-layer.md) — 三栏布局 + Domain 导航 + 多视图切换 + 详情抽屉
- [G1 数据模型决策](tickets/G1-data-model-decision.md) — 方案 B（类型化可插拔 + 统一检索层）；`DataSourceKindPlugin<T>` 接口（toCorpusItem / toPromptContext / toCriticContext / relations）；现有 P6b 重构非推翻
- [G2 Ontology 角色决策](tickets/G2-ontology-role-decision.md) — 语义层关系扩展（非独立系统）；Level 2/2.5 双路径（路由由实验决定）；relations 三类型（joins/derived_from/related_to）；Metric = kind plugin（图节点）；计算规则 = SQL + metadata 混合；Phase 1-3 在本 map
- [P1 Per-scope 配置](tickets/P1-per-scope-config.md) — 双层 config：Cordis 静态指向 registry 文件路径（`registryPath`），`scopes.yaml` 运行时可变。新包 `dsh-scope-registry`（`ctx.scopes`）+ SemanticLayerService 动态解析 active scope
- [P2 关系声明 + In-Memory 图](tickets/P2-ontology-relations-graph.md) — DataSourceRegistry + 3 内置 kind plugins (event/table/metric) + RelationGraph (BFS join-path / getRelated / getDerived) + loadDefinitions 泛型加载器 + loadRetrievalCorpusFromRegistry + buildCriticFields 聚合。88 tests 全绿。
- [G3 AI-Native Enrichment 设计](tickets/G3-ai-native-enrichment-design.md) — 两轮发现（确定性 PK 匹配 + LLM 综合推断）；直接写入 + **eval-based confidence gate**（低/中/高风险分级：高风险变更若 eval pass_rate drop >5pp 则 auto-revert）；Service 方法 + Agent Tool；语义层变更后自动触发（核心能力）；DWS 优先 → events 第二轮；metrics 机械提取 + 后续 LLM 补充
- [T1 K11 迁移 + Enrichment](tickets/T1-seed-k11-definitions.md) — 321 tables + 453 events 已迁移；126 DWS 表 dimension_refs 已填充；3916 metrics 已提取；discoverRelations Service + on-write hook + tool-discover-relations 均已实现。⚠️ runtime-wiring 缺口：kind plugins 未注册进 registry、无 live RelationGraph、检索语料仅 events — P3/P4 前置补全见 Phase 2 prompt 的 Phase 1.5
- [T1 种子 K11 定义](tickets/T1-seed-k11-definitions.md) — 完整 RBI 迁移：321 表（162 DWS+159 DIM）+ 445 事件 + field_samples；schema 兼容全绿
- [DWS→DIM 发现前置报告](research/dws-dim-discovery-report.md) — Phase 1 用 subagent 充当 llmCall 跑 162 DWS：126 表得 225 refs（34 DIM）；enrichment.ts/hook/tool/metrics 全落地；生产化见 F1
- [P3 Ontology NL2SQL 集成](tickets/P3-ontology-nl2sql-integration.md) — 三机制落地：C1 join constraint 注入 prompt、C2 undeclared_join critic 警告、C3 graph-expanded recall（+1-hop DIM）；K11 对比实验 with-graph 100% vs without 20%（+80pp，structural scoring，scripted LLM caveat）
- [P4 指标计算引擎](tickets/P4-ontology-metric-engine.md) — eval 验收（5 cases Level 2.5 vs Level 2）+ 生产 tool `execute_metric`（UNDERSTANDING 阶段确定性执行，0 LLM 开销）；phase-gate 白名单 + agent prompt METRIC SHORTCUT；14 tool tests + 55 phase-gate tests + 139 semantic-layer tests 全绿
- [F1 DWS→DIM 发现正式化](tickets/F1-dws-dim-discovery-formalization.md) — enrichment-llm-wiring Cordis 插件接入 ctx.llm→ctx.schema；alternative FK 精化（多替代外键→独立 joins 边）；events deterministic external_refs 已填充（92/445）；188 tests 全绿
- [R6 Web UI 实现方案调研](research/r6-web-ui-implementation.md) — UI 插件 pattern 直接套用；需新增 `SchemaGateway`（TypertRemoteService）投影 ctx.schema（当前无 Remote 接口）；Bm25Linker 复用经 Remote 暴露；React Flow 推荐（无现成依赖，血缘图划出 v1）；R5 全部可行无架构阻塞；增量交付 v1-a 浏览→v1-b 编辑→v2 质量监控
- [G4 Web UI 范围与交互决策](tickets/G4-web-ui-scope-and-interaction.md) — Web UI=独立完整管理界面（非 CLI 补充）；语义层管理=一个 agent=**goal ⊕ eval/evidence 层**（eval 填 goal 留的完成证据缺口，桥接管理 agent(goal)/数据 agent(pipeline)）；v1=**B 布局**（资产为首+证据侧栏）+ domain-first nav + **tiered evidence**（per-mutation 结构性+per-batch 全量 eval）+ 直接写+Tier-2 audit；③ 自驱循环 deferred（同 map，W6，③-gated）；复用 `packages/eval/eval` 核心**不重构**，建 P11c runner/delta/case-port(C)/live-wiring；eval 跑全量；v1=①证据基建+②人驱管理面；毕业 W1-W6 实现票；**增量交付修订**：W5 拆为 W5-lite（仅←W1，资产能力完整交付）/ W5-full（←W1+W4，证据能力渐进亮起）；blocking 边：W1、W2 无前置（并行根）；W3←W2；W4←W1；**W5-lite←W1（可独立 ship）**；W5-full←W4；W6←W3+W4+W5-full+goal

## Not yet specified

- **SchemaProvider 路由冲突解决**：R4 确定了 `registerSchemaProvider` + `engineType` 路由的整体方案，但多 provider 注册时的优先级排序规则和冲突解决（同 engineType 多 provider 谁优先？）待实现时具体化
- **Terminology 挂载点**：全局注入（`ctx.terminology`）vs per-kind 构造参数。当前 `eventKindPlugin.toCorpusItem` 已接受 `terminology?` 参数，需统一为一种模式
- **定义版本管理**：数据源定义（TableDefinition/EventDefinition/MetricDefinition）的变更历史追踪方案。最小方案 = Tier-2 audit 已有 who/when/what；完整方案 = git-backed 或 append-only changelog
- **③ 自驱循环细节**（W6 ticket 框架已立，③-gated）：管理 agent preset 设计、no-progress block 阈值（连续 N 轮无改进的 N 取值）、eval→goal 反馈接线细节——v1 ①② 栈完成后填充
- **P11c runner/持久化的跨 map 归属**：`P11c` = eval batch runner + 结果持久化 + pass_at_k 报告的共享资产（原定义于 data-agent map P11 系列下，但 W3 同样需要）。data-agent map G1b（pipeline-vs-goal 实验）与本 map W3（证据引擎）共用同一 runner。归属策略 = 谁先建谁拥有，另一边复用接口

## Out of scope

- dsh↔RBI 持续同步功能
- NL2SQL 引擎本身改进
- Query engine 内部实现
- Intranet / access isolation
- Ontology Phase 4（关系图谱可视化 + 基于命名约定的关系自动发现）— 不在本 map 目标架构之内
- 数据新鲜度监控（依赖 live-ODPS provider，P6b Q3 deferred；G4 Q6 确认出 v1）
- always-on 自主守护/巡检（goal 非后台守护进程；"打开会话不开工"是有意安全设计；需 scheduler 超出 goal 设计；G4 ③ 边界确认）
