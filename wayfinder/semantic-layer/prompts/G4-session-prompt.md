# G4 — Web UI v1 功能范围与交互设计决策

## 背景

R6 调研已完成（见 `research/r6-web-ui-implementation.md`），给定了语义层 Web UI 在 dsh 插件化架构下的技术实现路径。关键技术结论（作为本决策的技术约束输入）：

- **UI 插件模式成熟可直接套用**：新增 `ui-semantic-layer` 包，遵循 `src/client/index.ts → ctx.slots.register` 脚手架，无基建前置。
- **Host↔Client 通信**：需新增一个 `SchemaGateway extends TypertRemoteService`（范本 = `PluginInventoryGateway`），将 `ctx.schema` 的只读方法投影为 Remote。这是唯一需新写的「基建」代码，属既有 pattern 重复，非架构创新。
- **检索后端**：`tool-search-data-sources` 的 `Bm25Linker`（host 内存）可直接包进 `SchemaGateway.search()` Remote 暴露，单次 RPC + 内存检索远低于 Cmd+K 的 <100ms 阈值，**无需独立 UI 搜索后端**。
- **图谱可视化**：仓库无任何项目包直接依赖 React Flow/D3/Cytoscape。推荐 React Flow（`@xyflow/react`），但 map 已将「关系图谱可视化」列为 Ontology Phase 4 = **当前 Out of scope**，故血缘图若进 v1 需引入新依赖。
- **R5 推荐方案全部技术可行，无架构阻塞**。唯一外部阻塞 = 「新鲜度监控」依赖 live-ODPS provider（P6b Q3 deferred）。

G4 是 **grilling（HITL）** ticket：需与用户对话，逐一敲定 v1 的功能范围、交互、优先级。本 session 用 `/grilling` + `/domain-modeling` 推进，**一次只问一个问题**。

## 工作流（Wayfinder: Work through the map）

1. **加载 map**：`wayfinder/semantic-layer/map.md`（低分辨率视图）。确认 Destination（Web UI 可管理 = 浏览/搜索 + 编辑 + scope 管理 + 质量监控）。
2. **认领 G4**：将 G4 标记为 in-progress（本 tracker 是本地 markdown，无需 assign，但 status 改为 in-progress）。
3. **逐项 grilling**：就下方 6 个待决策点与用户对话，用 `/domain-modeling` 记录敲定的领域语言/决策。一次一问，不要批量。
4. **记录决议**：在 G4 ticket 写 Resolution 注释 → close（Status: Closed）→ 在 map 的 Decisions-so-far 追加 G4 一行索引。
5. **毕业 fog**：G4 决策后，map 的「Not yet specified」中「Web UI 实现阶段的具体 ticket」应可拆分为实际实现 ticket（如 v1-a 只读浏览、v1-b 编辑等 task ticket）——按决策结果创建并 wire blocking 边；若某部分仍不够 sharp 则留在 fog。

## 6 个待决策点（逐一 grilling）

每个点已附 R6 调研给出的技术约束，供用户决策时参考。

### Q1. v1 功能范围

R5 调研了 6 类能力：浏览/搜索、编辑、scope 管理、质量监控、血缘图、指标预览。

- **最小可用 = 浏览 + 搜索**？还是必须含编辑才有实际价值（当前定义只能改 YAML）？
- R6 增量交付建议：v1-a 只读浏览+搜索+详情（M）→ v1-b 编辑（M）→ v2 质量监控/血缘图（S~M）。
- R6 技术约束：血缘图建议划出 v1（需引入 React Flow + map Phase 4 = Out of scope）；新鲜度监控划出 v1（依赖 live-ODPS provider deferred）；指标预览可复用 P4 的 `execute_metric` tool。
- 待决策：v1 边界画在哪？v1-a 是否包含编辑，还是 v1 = 只读、编辑进 v1-b？

### Q2. 三栏 vs 两栏

R5 推荐三栏（导航 + 列表 + 详情抽屉）。

- R6 技术约束：三栏在 dsh 现有 Web 壳有两种落地形态——
  - **形态 A**：sidebar 内嵌管理面板（占用 `sidebar.settings` 或新增 `sidebar.<section>` slot），零布局改动，但受 sidebar 宽度约束，不适合复杂三栏。
  - **形态 B**：全屏顶层页（扩 `ui-layout` SlotMap 声明一个顶层 `semantic-layer` slot + view-mode 切换器），适合完整三栏，但需小改 `ui-layout` 包。
- 待决策：v1 走哪种形态？还是用路由页面/弹窗代替抽屉？

### Q3. 资产分类主轴

R5 提两种：Domain-first（顶层按 domains 分组）vs Kind-first（tables → events → metrics）。

- R6 技术约束：scope = 纯 namespace（P1 决策），`ctx.scopes.listScopes()` 提供 domain 划分；Kind-first 退为 filter 天然支持（registry 的 event/table/metric 三 plugin 结构）。
- 待决策：左侧导航主轴用哪种？另一种退为 filter 还是二级分组？

### Q4. 搜索体验

- R6 技术约束：复用 `Bm25Linker`（host 内存经 `SchemaGateway.search()` Remote 暴露），<100ms 满足，**无需独立 UI 搜索后端**。路径 A（host 侧搜索）推荐 v1；路径 B（client 自建索引）不必要。
- 待决策：Cmd+K 全局搜索 vs 页内搜索框？faceted filter（按 kind/domain/status）做不做？

### Q5. 编辑权限模型

- 项目处于开发期、无用户系统（map Notes）。
- R6 技术约束：`ctx.schema.updateTableMeta`/`syncWrite` 已走 Tier-2 audit（D5 不可关），无需新建审计路径。
- 待决策：谁能编辑（开发期 = 所有人）？编辑走 Tier-2 audit（已有基建）还是 Git PR 流？是否需要 draft/publish 工作流，还是直接写 + audit？

### Q6. 质量监控的 v1 形态

- 覆盖率：基于 `confirmation.status` 字段（draft/confirmed），本地可算。
- 数据新鲜度：需 ODPS 查询，当前 `freshness` 字段为空 → 依赖 live-ODPS provider（deferred）。
- R6 技术约束：覆盖率 = 纯聚合（`getCoverageStats()`），无新数据源，S 工作量；新鲜度 = L 且外部阻塞。
- 待决策：v1 只做覆盖率（本地可算），新鲜度延后？覆盖率以什么形态呈现（概览 KPI 卡 / 资产级 badge / 两者）？

## 上下文

- Map 决策：Web UI 核心场景 = 浏览/搜索 + 编辑 + scope 管理 + 质量监控
- R5 完整调研：三栏布局 + Domain 导航 + 多视图切换 + 详情抽屉
- 无兼容负担、无用户 → 可大胆设计，不需要渐进式改造
- 当前数据量：K11 scope = 321 tables + 445 events + 3916 metrics

## 参考文件

| 文件 | 用途 |
|------|------|
| wayfinder/semantic-layer/tickets/G4-web-ui-scope-and-interaction.md | ticket 全文 |
| wayfinder/semantic-layer/research/r6-web-ui-implementation.md | R6 技术调研（可行性前提） |
| wayfinder/semantic-layer/research/r5-web-ui-semantic-layer.md | R5 UI 设计调研（需求侧） |
| wayfinder/semantic-layer/map.md | map 索引 + Decisions-so-far |
| packages/client/ui-settings/src/client/index.ts | mirror + 转发事件模式范本 |
| packages/host/plugin-inventory/src/index.ts | SchemaGateway 范本（TypertRemoteService + @Remote） |
| packages/client/ui-workspace/src/client/index.ts | UI 插件 slot 注册范本 |
| packages/client/ui-layout/src/client/index.ts | 布局 slot 树（三栏形态 B 扩展点） |

## 验收标准

- [ ] G4 的 6 个决策点逐一与用户敲定（grilling 记录可追溯）
- [ ] G4 ticket Resolution 注释写入 → Status: Closed
- [ ] map Decisions-so-far 追加 G4 一行索引
- [ ] map Not yet specified 的「Web UI 实现阶段的具体 ticket」按 G4 决策毕业为实际实现 ticket（创建 + wire blocking），或明确留在 fog 并说明原因
- [ ] 若 G4 决策使某 ticket 越过 Destination，则 rule out of scope（非 resolve on route）

## 注意

- G4 是 HITL ticket，**必须与用户对话**，agent 不得替用户回答自己的 grilling 问题。
- 一次只问一个决策点，等用户回答再进下一个。
- R6 的技术结论是约束输入，不是替用户做决定——用户可基于约束选择任何方向（包括「推翻 R6 建议」）。
