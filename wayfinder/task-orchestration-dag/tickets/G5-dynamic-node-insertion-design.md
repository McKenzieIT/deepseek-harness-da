# G5 — dynamic node insertion and real-time DAG updates

**Type**: grilling
**Status**: resolved
**Blocked by**: [G1 DAG data model decision](G1-dag-data-model-decision.md) ✅
**Blocks**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md), [G11 view simplification strategies](G11-dag-view-simplification-strategies.md)

## Question

How should the DAG visualization handle dynamic node insertion, removal, and bulk updates in real time?

## Resolution

Eight decisions resolved via grilling session. The DAG is positioned as **execution infrastructure** (not just a visualization layer) — dsh-data-agent will use it as an orchestration substrate while DSH's native DAG capabilities mature.

### D1: DAG 视图模型更新通道 — Cordis 服务 + React Hook

**选项 B：独立 Cordis 服务（`DagModelService`）+ `useDagModel()` React Hook。**

不使用 ConversationNodeDefinition——DAG 面板是侧边栏，不是对话节点。DagModelService 直接订阅 `dag/*` 事件，维护响应式 DAG 模型状态。通过 React Hook 暴露给侧边栏 UI 组件。

理由：
- DAG 面板是侧边栏，用 ConversationNodeDefinition 驱动侧边栏在架构上是错位的
- 直接 Cordis 事件订阅给了对更新时机的完全控制权（对 D5 批处理关键）
- Session replay 通过服务初始化时遍历 `ctx.session.events` 重放历史实现

### D2: DAG 角色定位 — 执行基底

**DAG 是 Harness 的基础设施层，不仅是展示层。**

dsh-data-agent 在 DSH 原生 DAG 编排成熟前会把 DAG 作为编排替代 infra。这意味着：
- 关联准确性是硬需求（Agent 依据 DAG 做决策）
- 时间启发式关联不够——需要基于 task ownership 的确定性关联
- 用户无法修正关联——用户看到的是 Agent 行为的反映，不是自己的意图

**LLM 控制边界：** 4 个 CRUD 工具（`dag_task_create/update/get/list`）足够，不增加显式关联工具。关联机制从 G1 的"时间启发式"升级为"task ownership"——LLM 调用 `dag_task_update({ status: 'in_progress' })` 即为显式声明"我（或我即将 spawn 的 Agent）正在做这个 task"，`tools/pre-execute` 拦截器找到当前 Agent 拥有的 in_progress task 进行关联。

### D3: 事件传播与状态一致性 — 同步命令式 API + 事件持久化

**选项 C：混合方案。** 工具 `execute()` 内直接调用 DagModelService 命令式 API（状态立即更新），同时发射事件到持久化层和渲染层。

```
execute() {
  const task = createTask(args)
  dagModel.addTask(task)                                    // 命令式更新，立即生效
  ctx.session.log({ type: 'dag/task-create', data: task })  // 事件持久化
  return task
}
```

**一致性保证：** DagModelService 内部有一个纯函数 `applyEvent(state, event) → state`，命令式 API 构造事件后调用它，replay 也调用它。一个内核，两个入口——不会分叉。

理由：
- DAG 是 infra，读写一致性是硬需求——Agent 调用 `dag_task_create` 后立刻调用 `dag_task_list`，必须看到刚创建的 task
- 渲染层完全解耦——可按自己的节奏消费状态变更
- 符合 DSH 工具模式（`defineTool` 的 `execute()` 内做业务逻辑 + 持久化事件）
- 行业验证：Restate 的 journaling 模型与此方案高度一致

### D4: 节点完成后行为 — 永久保留 + viewFilter 管道

**数据层：选项 A——永久保留所有节点。** `dag_task_list` 支持 `status` 过滤参数，让 Agent 可以只看待办任务。

**渲染层：通过 `viewFilter(dagModel, viewMode)` 纯函数管道简化视图。** V1 只实现 `viewMode='all'`（全显示 + 状态样式区分），后续通过 G11 扩展。

```ts
const g6Data = viewFilter(dagModel.snapshot(), viewMode)  // viewMode 初始为 'all'
graph.setData(g6Data)
graph.render()
```

三种正交的视图简化策略（结构聚合/活跃视图过滤/完成子图折叠）已在 G11 中追踪。参考：Langfuse Agent Graph View (2026-07 beta) 的聚合模式/顺序模式双视图。

### D5: 突发事件处理 — rAF 合并 + 可选门控

**选项 B：requestAnimationFrame 合并。** DagModelService 状态变更时标记 dirty + `requestAnimationFrame`。rAF 回调中读取最新状态，做一次 `setData()` + `render()`。16ms 内的事件合并为一次 render。

`parallel(20)` 场景：20 个 `agent-start` 在 ~50ms 内发射 → 约 3-4 次 render，每次 5-7 个新节点。视觉效果是"快速展开"。

可选叙事门控层可叠加——面板折叠时跳过 G6 render，面板展开时用 rAF 保证实时性。

理由：
- DAG 是 infra，实时性重要——用户想看到 agent 逐步启动，不是 30 秒后突然冒出 20 个节点
- rAF 解决了真正的技术问题（render 竞态），延迟最多 16ms

### D6: 布局重算策略 — 全量 dagre + 排序稳定 + 结构/状态分离

**两层分离：**

- **结构变更**（增删节点/边）→ `setData()` + `render()` → 全量 dagre + `prevGraph` 排序稳定 + 动画过渡
- **状态变更**（颜色/样式）→ `updateNodeData()` → 零布局开销

```ts
layout: {
  type: 'antv-dagre',
  rankdir: 'TB',
  nodesep: 60,
  ranksep: 80,
  animation: true,
  prevGraph,  // antv-dagre 用 prevGraph 的 _order 稳定交叉最小化
}
```

**增量 dagre 的研究现状（已调研确认）：** 增量 Sugiyama 是活跃研究领域但实际未解决——层级分配（network-simplex）和交叉最小化（NP-hard）都是全局算法。最接近的工作（Domros & von Hanxleden 2021，ELK interactiveLayout）只约束了交叉最小化阶段。antv-dagre 的 `prevGraph` + `inheritOrder` 是排序保持启发式，不是真增量。

在 3-50 节点范围内全量 dagre 亚毫秒——性能不是瓶颈，视觉稳定性由 `prevGraph` + 动画过渡保证。

### D7: 规模上限与降级 — V1 不设硬上限 + 预留接口

**V1 目标规模 3-50 节点，不需要降级策略。**

分区：
- 正常（3-50）：无需干预
- 大型（50-200）：G11-S1 结构聚合自动降低可视节点数
- 异常（200+）：`viewFilter` 预留 `maxVisibleNodes` 接口，V1 不启用

G11（视图简化策略）是长期解法——结构聚合从根源上降低可视节点数。

### D8: DAG 状态持久性边界 — Session-scoped + UUID 预留

**V1：DAG 状态 session-scoped，与 Goal 作用域一致。**

- Session 内刷新/重连：DagModelService 通过事件 replay 重建状态
- Session 恢复（resume）：同上，重放全部 `dag/*` 历史事件
- 跨 session：V1 不支持

**已确认事实：** Goal 当前不跨 session（`goal-round-driver` 是 "Same-session" 驱动器，`GoalProjection` 在 `SessionProjectionMap` 中）。不存在"Goal 跨 session 了但 DAG 不跨 session"的不一致风险。

**预留：** `DagTask.id` 使用 UUID（全局唯一），事件格式包含 `sessionId` 字段。未来如果 Goal 支持跨 session，DagModelService 只需加载多个 session 的事件流，数据模型不需要改。跨 session 冲突解决（CAS revision）归入 G6。

## New tickets created

- [G11 — DAG view simplification strategies](G11-dag-view-simplification-strategies.md) — 三个正交的视图简化方向（结构聚合/活跃视图过滤/完成子图折叠），blocked by G5+G6

## Industry references (2026 H2 research)

- **Langfuse Agent Graph View** (2026-07 beta): 聚合模式 + 顺序模式双视图，最接近的已有实现参考
- **Flyte/Union** (2026-08): 为任意 Agent 框架提供持久化 DAG 执行包装层，验证了"DAG 作为 infra"定位
- **Restate**: 单二进制 journaling 模型，与 D3 的同步命令式 API + 事件持久化方案高度一致
- **Sayiir**: 2026 年新出的 graph-based continuation-driven workflow engine (Rust core + Node.js bindings)
- **ArXiv 2608.23953** (2026-08): "The Empire, Long Divided, Must Unite" — coding-agent harness 架构对比研究
- **Domros & von Hanxleden (2021)**: 增量 Sugiyama 交叉最小化约束，最接近的学术工作
- **van der Heijden et al. (2025, IEEE VIS)**: 明确指出增量 Sugiyama 是开放问题

## Upstream merge risk

Low — 所有决策均在新插件包（`tool-dag-task`、`ui-task-dag`）内部。唯一与上游的交互点是 `tools/pre-execute` 拦截器（Cordis 扩展点，非修改）和 `cordis.patch.yml` 禁用 `tool-todo`（已在 G1/G3 中验证为安全模式）。
