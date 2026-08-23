# R6 — Web UI 实现方案技术调研

**Type**: research
**Status**: Closed
**Blocked by**: —
**Resolution**: 见 [research/r6-web-ui-implementation.md](../research/r6-web-ui-implementation.md)

## Question

在 dsh 插件化架构（Cordis + Client UI Slot 系统）下，语义层 Web UI 管理界面的技术实现路径是什么？

## 调研范围

1. **dsh Client UI Slot 系统的当前能力**：
   - R3 已调研 Cordis plugin + Client UI Slot pattern，但未深入前端具体如何注册一个完整的管理页面
   - 需明确：一个插件如何声明一个新的左侧导航项（route）+ 对应的页面组件？
   - 当前已有哪些 UI slot 类型（页面级、面板级、widget 级）？

2. **现有 Web UI 插件实例分析**：
   - 找到 1-2 个已实现的 dsh Web UI 插件（如 `dsh-client-ui-workspace`、`dsh-client-ui-conversation`），分析其结构
   - 目录结构、入口文件、slot 注册方式、数据获取模式（typert RPC / ctx service 调用 / REST API）

3. **语义层数据访问模式**：
   - Web UI 如何读取 `ctx.schema`（Service 在 host 侧运行，UI 在 client 侧渲染）？
   - 是否需要新增 typert RPC endpoint，还是通过现有的 API gateway 暴露？
   - 搜索/过滤的后端实现（BM25Linker 复用 vs 新建 API）

4. **图谱可视化技术选型**：
   - dsh 现有的前端依赖中是否已有图谱/DAG 库？
   - 若无，React Flow vs D3.js vs Cytoscape 在此场景的权衡

5. **增量交付策略**：
   - 最小可用 UI（只读浏览 + 搜索）vs 完整 UI（编辑 + 质量监控）的工作量差异
   - 是否可以分 plugin 交付（`dsh-client-ui-semantic-layer-browse` → `dsh-client-ui-semantic-layer-edit` → ...）

## 产出

一份技术方案文档，含：
- 推荐的插件结构（目录、入口、依赖）
- 数据流示意（host ↔ client 通信路径）
- 对 R5 推荐方案的可行性判断（哪些可直接落地、哪些需基建前置）
- 估计工作量分级（S/M/L per feature）

## Resolution（2026-08-23）

调研完成，文档写入 `research/r6-web-ui-implementation.md`。核心结论：

1. **UI 插件模式成熟可直接套用**：dsh Client UI Slot 系统对「新增完整管理页面」有清晰、反复验证的 pattern（ui-workspace/ui-settings/ui-sidebar 同构）。语义层 UI = 一个新 `ui-semantic-layer` 包，遵循 `src/client/index.ts → ctx.slots.register` 脚手架，无基建前置。

2. **Host↔Client RPC 路径明确**：`TypertRemoteService` + `@Remote()` 装饰器是标准通道，`dsh-typert-generator` 自动产出 client typed stub，`dsh-api-remotes` 装配挂载。**`ctx.schema` 当前无 Remote 接口**（仅 host 侧 tool 调用）——需新增一个 `SchemaGateway extends TypertRemoteService`，这是本方案唯一需新写的「基建」代码，属既有 pattern 的机械重复，非架构创新。范本 = `PluginInventoryGateway`。

3. **图谱可视化无现成依赖**：仓库内无任何项目包直接依赖 React Flow/D3/Cytoscape。推荐 **React Flow（`@xyflow/react`）**（React 原生、DAG 对口、~45KB）。但血缘图建议划出 v1（map 已将关系图谱可视化列为 Phase 4 = Out of scope），避免 v1 引入新依赖。

4. **检索后端可复用**：`tool-search-data-sources` 的 `Bm25Linker` 跑在 host 内存，直接包进 `SchemaGateway.search()` Remote 暴露，无需浏览器重建索引；单次 RPC + 内存检索远低于 Cmd+K 的 <100ms 阈值。

5. **R5 推荐方案全部技术可行，无架构阻塞**。唯一外部阻塞 = 「新鲜度监控」依赖 live-ODPS provider（P6b Q3 deferred），建议 G4 划出 v1。

6. **增量交付天然可行**：v1-a（只读浏览+搜索+详情，M）→ v1-b（编辑，M）→ v2（质量监控/血缘图，S~M），每段独立 plugin + 独立 Remote 方法集。

7. **三栏布局**在 dsh 壳有两种落地形态：形态 A（sidebar 内嵌，零前置）vs 形态 B（全屏顶层页，需小扩 `ui-layout` SlotMap + view-mode 切换）——是 G4「三栏 vs 两栏」决策的技术输入。

**给 G4**：G4 可据此进入功能范围/交互/优先级决策。G4 现已 unblocked。
