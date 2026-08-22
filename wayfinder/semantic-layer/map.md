# wayfinder:map — dsh-data-agent 语义层

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储。

## Destination

将 dsh-data-agent 的语义层从「代码存在但不可用」变为「端到端真正可用」：

1. **核心链路跑通**：用户自然语言提问 → 语义层提供足够上下文（检索 + 定义加载）→ NL2SQL 生成正确 SQL → 执行 → 返回结果。以全链路可用为验收标准。
2. **架构正确**：语义层是可扩展的数据源注册表（不锁死表+事件），与查询引擎解耦（provider 可插拔），per-scope namespace 隔离，定义存储在运行时可配置路径。
3. **Web UI 可管理**：通过 dsh 插件化机制提供管理界面（浏览/搜索、编辑、scope 管理、质量监控）。
4. **Ontology 决策落地**：完成知识图谱/ontology 调研，决定其在 data-agent 中的角色和实现方式，若决策为引入则实现之。

前提：项目处于开发期、无用户、无兼容负担。任何不满足要求的现有代码可推翻重来。

## Notes

- **域**：dsh-data-agent 语义层端到端可用 + Web UI 管理 + Ontology 知识图谱能力。
- **每会话应查 skills**：`dsh-plugin-development`、`grilling` + `domain-modeling`、`research`、`prototype`。
- **常设原则**：
  - **不做过渡方案**：LLM 编码场景下，直接做目标架构，不分短/中/长期妥协。
  - **语义层不绑定特定查询引擎**：schema provider 可插拔。
  - **scope = 纯 namespace**：用户自定义划分方式。
  - **语义层默认空白**：由用户/管理员填充。
  - **数据源类型可扩展**：不锁死「表 + 事件」。
  - **无兼容负担**：现有代码可推翻重来。
- **现有基础设施**（重构，非推翻——G1 决策）：
  - `packages/data/semantic-layer/` — types.ts 保留，io.ts/index.ts 重构扩展
  - `packages/data/tool-load-{table,event}-definition/` — 通过 registry.toPromptContext 格式化
  - `packages/data/tool-search-data-sources/` — 通过 registry.toCorpusItem 聚合 corpus
  - bundle 已挂载 semantic-layer 但 semanticRoot 为空

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
- [G3 AI-Native Enrichment 设计](tickets/G3-ai-native-enrichment-design.md) — 两轮发现（确定性 PK 匹配 + LLM 综合推断）；直接写入无审批；Service 方法 + Agent Tool；语义层变更后自动触发（核心能力）；DWS 优先 → events 第二轮；metrics 机械提取 + 后续 LLM 补充
- [T1 K11 迁移 + Enrichment](tickets/T1-seed-k11-definitions.md) — 321 tables + 453 events 已迁移；126 DWS 表 dimension_refs 已填充；3916 metrics 已提取；discoverRelations Service + on-write hook + tool-discover-relations 均已实现。⚠️ runtime-wiring 缺口：kind plugins 未注册进 registry、无 live RelationGraph、检索语料仅 events — P3/P4 前置补全见 Phase 2 prompt 的 Phase 1.5
- [T1 种子 K11 定义](tickets/T1-seed-k11-definitions.md) — 完整 RBI 迁移：321 表（162 DWS+159 DIM）+ 445 事件 + field_samples；schema 兼容全绿
- [DWS→DIM 发现前置报告](research/dws-dim-discovery-report.md) — Phase 1 用 subagent 充当 llmCall 跑 162 DWS：126 表得 225 refs（34 DIM）；enrichment.ts/hook/tool/metrics 全落地；生产化见 F1

## Not yet specified

- 质量监控具体实现
- 多 SchemaProvider 同时挂载的路由策略（R4 有方案，待实现时具体化）
- Terminology 在新 plugin 架构中的挂载点（全局 vs per-kind 注入参数）
- 定义版本管理

## Out of scope

- dsh↔RBI 持续同步功能
- NL2SQL 引擎本身改进
- Query engine 内部实现
- Intranet / access isolation
- Ontology Phase 4（关系图谱可视化 + 基于命名约定的关系自动发现）— 不在本 map 目标架构之内
