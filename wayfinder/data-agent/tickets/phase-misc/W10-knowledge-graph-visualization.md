# W10 — Context Layer 关系视图可视化（全屏管理界面 + @antv/g6 语义缩放）

**Type**: grilling → prototype → task
**Phase**: misc（管理 UI 核心）
**Status**: implemented 2026-08-27（设计 resolved + 基础代码落地 + 全屏管理 UI 组装完成 + 全屏集成方案 research resolved + 全屏集成实现完成 commit 7858252b30）
**Blocked by**: 无（W8 resolved 2026-08-27，evidence RPC 已接通）

## Question

RelationGraph 是 server-only 内存邻接表（~800 nodes, ~2k-4k edges），无序列化、无可视化。需设计 Context Layer 关系视图可视化，使用户可以：
- 浏览 data assets 的关系拓扑
- 按 domain 聚类理解大局
- 按 focus node drill-in 理解局部
- 叠加 eval evidence（pass/fail 热力）识别薄弱区域
- 发现问题后通过可收缩 LLM 对话面板让 agent 调用工具修正

## Resolution

### 概念框架

采用 2026 行业共识的 **Context Layer** 统一框架：
- **语义层**（asset 内部结构：columns/metrics/granularity）= 结构视角 → SchemaExplorer (W9)
- **知识图谱**（asset 间关系网络：joins/derived_from/related_to）= 关系视角 → 本组件
- 两者合一 = agent 的 Context Layer（认知底座）
- Ontology 边类型应设计为**可扩展**（不限于当前 3 种），参考 Palantir 四层模型（semantic/kinetic/permission/lineage）

### D3. 层级定位 → 图谱是 Context Layer 的关系视角，高于 SchemaExplorer

图谱不是 SchemaExplorer 的附属功能，而是比它更高层级的"全局理解"入口。SchemaExplorer 是"放大镜"（看单个资产细节），图谱是"地图"（看全局关系和结构）。Ontology 的本质是关系网络，图谱直接体现 agent 认知的核心。

### D4. 物理位置 → 全屏画布，独立插件入口，内含可收缩 LLM 对话面板

- 作为独立 **Mode 3 Repository Package** 插件实现
- 提供独立入口打开**全屏管理界面**（非侧边栏）
- 布局：大面积画布 + 可收缩的 LLM 对话面板
- 与取数模式（data query session）明确分离，是独立的管理交互场景
- 用户通过可视化发现问题 → 在对话面板让 agent 调用工具修正（非 UI 直接编辑）

### D1. 布局策略 → 语义缩放（Semantic Zoom）三级 LOD

单一连续画布，通过缩放级别自动控制细节层次（Shneiderman 法则："Overview first, zoom and filter, then details on demand"）：

| 缩放级别 | 看到什么 | G6 实现 |
|---------|----------|---------|
| 远景（zoom 0.3-0.5） | 10 个 domain 色块（collapsed combo），边缘显示 combo 间关系密度 | Combo collapsed + inter-combo aggregate edges |
| 中景（zoom 0.5-1.0） | Combo 展开，节点以 kind 着色小圆点显示（无 label） | Combo expanded + LOD: label hidden |
| 近景（zoom 1.0+） | 完整节点细节——名称、kind badge、pass rate 色环、confirmation icon | Full LOD detail |

交互增强：
- 双击 combo → zoom-to-fit 该 domain
- 双击节点 → 居中 + 展开 N-hop 邻居 + 高亮路径
- 侧面板联动 → 点选节点时显示详情

可选血缘 DAG 视图（左→右分层）留给 v1+。

### D2. 交互范围 → LLM 无法替代的视觉操作进 v1

**原则**：能通过 tool 让 LLM 做的都不做 UI；LLM 无法替代或过于复杂的放 v1。

v1 交互（视觉/空间，不可对话替代）：
- Zoom / Pan（语义缩放三级 LOD）
- 点击节点 → 详情面板
- 双击 combo/节点 → 自动聚焦
- Domain filter toolbar（toggle chips）
- Minimap
- 搜索定位（输入名称 → focus + highlight）
- Evidence overlay（常驻 + 可切换诊断模式）

不做（LLM tool 完成）：
- 编辑/增删关系、资产
- 路径高亮查询（v1+ 考虑可视化）
- 拖拽重布局、右键菜单编辑

### D5. 性能策略 → Canvas 2D 默认，无需额外优化

- G6 v5 Canvas 2D 渲染 5000 节点以下无压力
- 语义缩放 + combo collapse 进一步减少可见图形数量
- Metric 节点默认隐藏（toggle 展开到 ~3000+ 时 LOD 已处理）
- 未来 5000+ 再评估 WebGL

### D6. Evidence overlay → 边框 + badge 常驻，可切换填色诊断模式

- **常态**：kind 着色（dws 蓝/dim 绿/event 橙/metric 紫）为主信息，边框粗细/颜色 + badge 标记 pass rate
- **诊断模式**：toggle 切换为填色模式（红/黄/绿），kind 信息让位，全局扫描薄弱区域
- **Combo 折叠时**：combo 边框颜色反映该 domain 内最差 pass rate（domain 级预警）
- 数据源：evidence-query `assetHealth(id)` per node

## 已确认决策（保留历史）

- **库**：@antv/g6 v5
- **API 粒度**：Server 裁剪 `getGraphData({domain?, focus?, depth?})`
- **Metric 节点**：默认隐藏，toggle 展示

## 设计方向（基于 resolution 更新）

### Server: getGraphData

SchemaGateway 新增 `@Remote getGraphData(opts?)`:
```ts
interface GraphDataOpts {
  domain?: string       // 只返回该 domain 相关节点
  focus?: string        // 以该 asset 为中心
  depth?: number        // BFS 跳数（默认 2）
  includeMetrics?: boolean  // 是否含 metric 节点（默认 false）
}
interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
interface GraphNode {
  id: string
  kind: 'dws' | 'dim' | 'event' | 'metric'
  label: string
  domains: string[]
  granularity?: string
  confirmationStatus?: string
  evalPassRate?: number  // 从 evidence-query 注入
}
interface GraphEdge {
  source: string
  target: string
  type: string          // 可扩展（不再限于 3 种固定类型）
  on?: string
  derivation?: string
}
```

### Client: ContextLayerGraph 组件（原 KnowledgeGraph → 重命名）

- `@antv/g6` v5 Graph instance
- **布局**：combo = domain，语义缩放三级 LOD
- **节点**：形状/颜色 by kind，边框/badge by eval pass rate
- **边**：样式 by type（可扩展）
- **交互**：zoom/pan/LOD + click detail + double-click focus + domain filter + minimap + search
- **全屏管理界面**：独立入口，可收缩 LLM 对话面板
- **诊断模式**：toggle evidence overlay 填色

## 文件（更新）

- `packages/client/ui-context-layer/` — 新插件包（Mode 3 Repository Package）
- `packages/client/ui-context-layer/src/client/ContextLayerGraph.tsx` — 主组件
- `packages/client/ui-context-layer/src/client/graph-layout.ts` — g6 布局配置（语义缩放阈值）
- `packages/client/ui-context-layer/src/client/graph-styles.ts` — 节点/边样式 + evidence overlay
- `packages/data/schema-gateway/src/index.ts` — 新增 `getGraphData`

## 全屏集成方案（Research resolved 2026-08-27）

### 问题

W10 设计要求"独立入口打开全屏管理界面"，但 harness slot 系统只覆盖 panel/sidebar（`sidebar` / `conversation` / `details` / `details.aux` / `shell.overlay`），没有全屏视图先例。W9 SchemaExplorer 的 `onNavigateToGraph` noop callback 需路由到本组件全屏视图，但无跨插件视图切换模式可参考。

### Research 发现

1. **Harness 无原生全屏视图机制**：`root` slot 被 `AppFrame`（三列 grid）独占且文档明确禁止注册；`ctx.layout` 只提供 `toggleSidebar/openDetails/closeDetails`——无 view-mode 切换。

2. **`shell.overlay` 是正确的扩展点**：
   - `kind: 'list'`, `scope: 'root'` — additive，不替换任何已有 UI
   - 当前**零占用者**（`replaceRisk: 'none'`）
   - CSS: `position: absolute; inset: 0; z-index: 20`; `pointer-events: none`（click-through，条目自行 opt-in）
   - 官方文档："This is the additive seat for a frame-wide surface of your own"

3. **跨插件通信 = cordis 标准 service provision**：`ctx.layout`（ui-layout）、`ctx.managementSession`（management-session）均为先例——`ctx.reflect.provide(name, instance)` + `declare module '@deepseek-ai/cordis'` 在 Context 上声明服务 face。

### 方案：`shell.overlay` + `ctx.contextLayer` service（100% additive，零 core 改动）

**Step 1**: `ui-context-layer` 提供 `ctx.contextLayer` 服务

```ts
// declare module '@deepseek-ai/cordis'
interface Context {
  contextLayer: IContextLayer
}

interface IContextLayer {
  open(focusNode?: string): void
  close(): void
  readonly isOpen: boolean
  readonly focusNode: string | undefined
}
```

**Step 2**: `ui-context-layer` 注册 `shell.overlay` entry

```ts
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'context-layer-fullscreen', order: 1000 },
  ContextLayerOverlay,  // position: fixed; inset: 0; pointer-events: all; z-index: 30
))
```

- `ContextLayerOverlay`: 读 `ctx.contextLayer.isOpen`，为 `false` 时返回 `null`（零开销）
- 为 `true` 时渲染 viewport 大小容器 + `ContextLayerView`（已有组件，flex: 1 填满）
- 打开时创建 management session (`ctx.managementSession.create()`)
- 关闭时销毁 management session

**Step 3**: `ui-semantic-layer` 消费 `ctx.contextLayer` 实现跨插件导航

```ts
// wiring.tsx — SemanticLayerSchemaExplorer 注入
const contextLayer = ctx.get('contextLayer') as IContextLayer | undefined
// 传递 onNavigateToGraph:
<SchemaExplorer
  client={schemaClient}
  t={tAny}
  onNavigateToGraph={contextLayer ? (assetId) => contextLayer.open(assetId) : undefined}
/>
```

### 为什么选 shell.overlay 而非新 slot type

| 选项 | 改动范围 | additive-only? |
|------|---------|----------------|
| (A) `shell.overlay` fullscreen entry | ui-context-layer only | ✅ 完全 additive |
| (B) 新 `shell.page` slot + AppFrame 条件渲染 | 修改 ui-layout | ❌ 改 core |
| (C) `ctx.layout.setMode('page')` | 修改 ui-layout service | ❌ 改 core |

A 是唯一符合 additive-only 原则的方案。`shell.overlay` 的 z-index: 20 已在所有列之上；fullscreen entry 使用 `position: fixed`（脱离 overlay layer 的 absolute 定位，直接挂 viewport）+ `z-index: 30` 确保覆盖。

### reachabilityDelta tool 状态（附带 grilling 项 resolved）

W11 D6 决策列出 `reachabilityDelta` 为管理工具。经验证：
- `packages/data/tool-reachability-delta/` 已完整实现（model-facing tool，8+ tests）
- `apps/cli/config/agent-presets/semantic-layer-management/agent.cordis.yml` 已注册（`- id: tool-reachability-delta`）
- 它是 **agent tool**（非纯 client RPC）——接受 ProposedRelation，返回 ReachabilityDeltaResult，供 agent 在提议添加关系前评估影响
- 无需额外操作，preset 已就位

## 关联

- [W8 Evidence RPC](W8-evidence-rpc-gateway.md) — evidence overlay 数据源
- [W9 Schema Browser](W9-schema-browser-ui.md) — Context Layer 结构视角（互补）+ onNavigateToGraph 消费方
- [W11 Graph Edit](W11-graph-edit-enrichment.md) — 对话式修正能力（blocked by W10）
- [schema-gateway](../../packages/data/schema-gateway/) — 服务端 API 所在
- [nl2sql-engine/ontology.ts](../../packages/data/nl2sql-engine/src/ontology.ts) — 引擎侧 graph 消费参照
- [Context Layer 2026 consensus](../../research/) — Forrester/Databricks/Atlan/OpenMetadata 行业共识
