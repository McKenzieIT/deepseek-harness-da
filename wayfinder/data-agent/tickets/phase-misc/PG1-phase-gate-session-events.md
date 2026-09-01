# PG1 — Phase-gate session events 改造

**Type**: grilling
**Status**: open
**Blocked by**: —
**Blocks**: —（task-orchestration-dag 的 phase 节点集成依赖本票）

## 来源

task-orchestration-dag G3 grilling（preset 通用性策略）中发现：phase-gate 当前零 session events，所有阶段状态为内存 ephemeral。这既是 DAG 展示 phase 节点的前置条件，也是 data-agent 自身演进（非线性管道、可观测性、session reload）的基础设施缺失。

调研详情见 [research/phase-gate-session-events.md](../../research/phase-gate-session-events.md)。

## Question

Phase-gate 应该发射哪些 session events，以什么 schema，在什么时机？

### 子问题

1. **Event 类型与粒度**：初步建议 4 类（`phase/advance`、`phase/fallback`、`phase/decline`、`phase/clarify`）。是否足够？是否需要更细粒度（如 `phase/gate-check` 记录每次 gate 判定）或更粗粒度（如只记录阶段开始/结束）？

2. **Schema 设计**：每个 event 携带什么数据？需要平衡信息丰富度（支撑 UI/分析/DAG）与 `ignorable: true` 的向后兼容约束。

3. **发射时机与控制流交互**：Phase-gate 当前通过 `agent/turn-stopping` 侧效应控制阶段转换。Session event 应该在侧效应前还是后发射？是否需要保证 event 与状态变更的原子性？

4. **Session projection 设计**：是否需要一个 `phaseState` session projection（类似 tool-todo 的 `todos` projection），让 UI 可以通过 fold 获取当前阶段状态？

5. **UNIVERSAL 工具白名单更新**：`todo` → `dag_task_create`/`dag_task_update`/`dag_task_get`/`dag_task_list`。是直接替换，还是同时保留 `todo`（过渡期兼容）？

6. **未来管道灵活性**：当前 event 设计是否应预留非线性管道的扩展空间（条件分支、并行阶段），还是先只覆盖当前线性四阶段？

## 上下文

- 当前 phase-gate 源码：`packages/data/phase-gate/src/`
- 调研 note：`research/phase-gate-session-events.md`
- 架构参考：`docs/architecture.md`（"Session events are durable facts"）
- tool-todo session event 参考：`todo/write` event + `todos` projection（`packages/todo/tool-todo/src/index.ts`）
- DAG 插件的 session events 参考：`dag/task-create`、`dag/task-update` 等（task-orchestration-dag G1 决策）
