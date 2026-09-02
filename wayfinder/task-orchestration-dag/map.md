# wayfinder:map — task-orchestration-dag

> local markdown tracker (wayfinder skill default). Sub-tickets in `tickets/`, research notes in `research/`. This map is an **index**, not storage — decision details live in their ticket / research note.

## Destination

A DAG-based task orchestration visualization system that upgrades the current flat `TodoItem` list into a rich, interactive graph. The system:

1. **Replaces the flat TodoPanel** with a collapsible sidebar DAG graph showing task nodes, their dependencies, and execution flow with animated flowing dashed lines between nodes.
2. **Integrates subagent and workflow nodes** into the same DAG — when subagents are spawned or new tasks are added mid-session, their nodes animate into the graph in real time.
3. **Works across all presets** — available wherever task orchestration is composed (standard, code, cordis, data-agent variants B/C, and future presets).
4. **Builds as a terminal state plugin** — disables `tool-todo` and replaces it with structured `dag_task_*` tools that provide IDs, dependencies, and multi-agent-ready fields, following the DSH plugin development patterns to avoid upstream merge conflicts.
5. **Prepares infrastructure** for dynamic multi-agent workflows — the DAG model and visualization provide the substrate on which future workflow DAGs, multi-agent coordination graphs, and dsh-data-agent's phase-aware planning can render.

The map is done when: every architectural decision is locked (data model, UI placement, rendering approach, preset integration, infra contracts), a spec exists for each component, and the work is ready to hand off to implementation sessions.

## Notes

- **Domain**: DSH plugin architecture (Cordis services, tools, session projections, slot-based UI)
- **Skills to consult**: `/dsh-plugin-development`, `/domain-modeling`, `/grilling`, `/prototype`
- **Upstream merge constraint**: DSH is in developer preview; frequent upstream merges expected. All work must follow dsh-plugin-development patterns — zero upstream package modifications, compose via bundle patch layers and presets.
- **Key packages (upstream, read-only)**:
  - `packages/todo/tool-todo/` — current flat todo system (`TodoItem { content, status }`) — **disabled by our plugin, not modified**
  - `packages/experimental/agent-team/` — DAG backend (`TeamTaskBoard`, `TeamTaskSnapshot` with `blockedBy[]`) — **reference only, not depended on**
  - `packages/client/ui-context-layer/` — existing G6 v5 graph component with animations
  - `packages/client/ui-conversation/src/client/skeleton/TodoPanel.tsx` — current flat TodoPanel/TodoDock — **loses data source when tool-todo is disabled**
  - `packages/client/ui-workflow-run/` — current workflow run panel (linear list, not DAG)
  - `packages/client/ui-layout/src/client/AppFrame.tsx` — three-column layout with sidebar/center/details
  - `packages/client/ui-slots/` — slot registry framework
  - `packages/preset/agent-presets/` — preset discovery and composition
  - `packages/subagent/subagent/` — `ctx.subagents` service with `listDescendants()`
  - `packages/workflow/workflow/` — `ctx.workflowEngine` service with lifecycle events
- **Key packages (new, our plugin)**:
  - `packages/dag/tool-dag-task/` — server-side tool plugin (dag_task_create/update/get/list + event listeners)
  - `packages/client/ui-task-dag/` — client-side DagModelService (Cordis) + `useDagModel()` Hook + G6 v5 dagre sidebar renderer
- **Standing principles**:
  - The DAG is **execution infrastructure**, not just a visualization layer — dsh-data-agent will use it as an orchestration substrate. Accuracy of task-agent relationships is a hard requirement.
  - The DAG data model is maintained by a **Cordis service (`DagModelService`)** with synchronous command API + event persistence. Read-write consistency is guaranteed within a session.
  - The DAG visualization is a **sidebar rendering concern** driven by `useDagModel()` React Hook — it does NOT use ConversationNodeDefinition.
  - **Zero upstream modifications** — extend via documented Cordis extension points only.
  - New session events must carry `ignorable: true` for persistence compatibility.
  - G6 v5 is already a project dependency with proven animation support — strongly prefer it over introducing a new graph library.
  - The user wants the panel to be **sidebar-positioned, click-to-expand/collapse** (not inline in the conversation or in the details column).
  - DAG state is **session-scoped** (consistent with Goal scope). UUID ids + sessionId fields pre-reserve cross-session extensibility.

## Ticket frontier

```
[✓] R1 agent-team maturity audit ──────┐
[✓] R3 subagent/workflow event surface ─┤
                                        ├──▶ [✓] G1 DAG data model decision ──┬──▶ [✓] G2 panel placement ──▶ G4 animation & edges ──▶ G8 Z enhancement
                                        │                                      │
[✓] R2 G6 dagre layout feasibility ────┘                                      ├──▶ [✓] G3 preset universality
                                                                               │
                                                                               └──▶ [✓] G5 dynamic insertion ──▶ [✓] G6 infra contracts ──┬──▶ G7 writeScopes detection
                                                                                                                │                          ├──▶ G9 team-task integration
                                                                                                                │                          └──▶ G10 subagent tree integration
                                                                                                                │
                                                                                                                └──▶ G11 view simplification strategies
```

**Frontier (unblocked, open):** G4 (grilling+prototype), G7 (task), G9 (task), G10 (task), G11 (task)
**Blocked:** G8 (by G4)
**Next tickets to resolve:** G4 (animation & edge design — 继承 G2 原型的动效/理解层基线), G7/G9/G10/G11

## Decisions so far

- [R1 agent-team maturity audit](research/R1-agent-team-maturity-audit.md) — package is architecturally solid (CAS, cycle detection, persistence); gaps for visualization (no node type, no timestamps, no display metadata) are solvable via `TeamTaskView` enrichment pattern; graduation requires accepting 4 event types as stable contracts.
- [R2 G6 dagre layout feasibility](research/R2-g6-dagre-layout-feasibility.md) — G6 v5.1.1 natively supports `antv-dagre` layout, `lineDashOffset` animation, and incremental layout via preset mechanism; no reason to build separate SVG+dagre stack.
- [R3 subagent/workflow event surface](research/R3-subagent-workflow-event-surface.md) — workflow events are well-persisted (4 `tool-workflow/*` types); subagent events are ephemeral in parent; **no task↔subagent linkage exists** — primary gap requiring a new correlation mechanism.
- [G1 DAG data model decision](tickets/G1-dag-data-model-decision.md) — **Option B-prime: terminal state plugin with composite projection**. Disables `tool-todo`, registers `dag_task_*` tools with structured DagTask model (id, revision, subject, status, blockedBy with cycle detection, ownerId, writeScopes). 5 node types (task, team-task, workflow-run, workflow-agent, subagent), 4 edge types (dependency, sequence, containment, spawning). Solves task↔subagent gap via `tools/pre-execute` interception. State display: Option Y (node+edge animation) now, Z as enhancement. Zero upstream modifications — all new code in plugin packages.
- [G3 preset universality strategy](tickets/G3-preset-universality-strategy.md) — **新建独立 Bundle（`packages/bundle/dag/`）+ 无条件注册 + 自然降级**。Bundle 的 `cordis.patch.yml` disable `tool-todo` + insert `tool-dag-task`；`ctx.tools.restrict()` 屏蔽 preset 级 `todo_write` 重挂。所有 preset 均可用 DAG 工具，节点类型随可用服务缩减（非禁用）。Phase-gate 集成（UNIVERSAL 白名单 + session events）归入 data-agent map [PG1](../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)。不创建新 preset，不 patch 现有 preset — profile 添加 bundle 即可。
- [G5 dynamic node insertion design](tickets/G5-dynamic-node-insertion-design.md) — **8 项决策 resolved。** DAG 定位为执行基底（D2）；DagModelService Cordis 服务 + React Hook（D1）；同步命令式 API + 事件持久化保证读写一致性（D3）；节点永久保留 + `viewFilter` 管道（D4）；rAF 合并突发事件（D5）；全量 dagre + `prevGraph` 排序稳定 + 结构/状态变更分离（D6）；V1 不设规模硬上限（D7）；session-scoped 持久性与 Goal 一致（D8）。新增 G11（视图简化策略）。
- [G6 infra contracts for dynamic workflows](tickets/G6-infra-contracts-for-dynamic-workflows.md) — **5 项基础设施契约 resolved。** 事件三层稳定性模型（稳定/半稳定/内部 + payload version 字段）（D1）；工具 API "只增不删不改名"、V1 不暴露 revision 和 action（D2）；多 Agent 不新建机制，靠数据模型预留 + Cordis 原生事件监听（D3）；DagModelService 暴露为 `ctx.dagModel` Cordis 服务契约（5 方法），工具 API 是薄壳（D4）；节点类型硬编码 5 种 + `DagNode.type` 为 string + 渲染 fallback，不建注册表（D5）。
- [G2 DAG panel placement and interaction](tickets/G2-dag-panel-placement-and-interaction.md) — **D 融合方案（用户确认 2026-09-02）**：dock 摘要条（`conversation.input.dock`，TodoPanel 后继，点名当前任务）+ 侧栏「任务编排」分区（迷你条 ⇄ 420 限高一瞥）+ ⛶ 弹出大视图（`shell.overlay`）三层结构；节点点击 → 容器内底部详情卡（点空白收起），hover → 上下游链路高亮。**否 details.aux**（aux 无页签机制、改上游有 merge 风险）。动效基线（WAAPI——`update*Data` 不重绘；节奏恒定 流动 2/1 cyc/s、呼吸、脉冲、完成路径转绿）与字号基线（134×38/13px）移交 G4。原型 + 像素级自验：[prototype/](prototype/)（commit 512b5e104b、bafa5414a8）；顺带发现上游两 bug → data-agent [W12](../data-agent/tickets/phase-misc/W12-contextlayer-node-click-dead.md)/[W13](../data-agent/tickets/phase-misc/W13-contextlayer-animations-no-repaint.md)。

## Not yet specified

- **Data-agent phase-gate integration**: The data-agent's four-phase pipeline (`dsh-phase-gate`) is an implicit DAG (Understanding → Generation → Execution → Interpretation). G3 grilling 发现 phase-gate 当前零 session events（移植遗留），无法作为 DAG 数据源。已在 data-agent map 开票：[PG1 Phase-gate session events 改造](../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)（grilling）+ [调研 note](../data-agent/research/phase-gate-session-events.md)。**本 map 中任何 phase 节点渲染工作依赖 PG1 resolved。** UNIVERSAL 工具白名单 `todo` → `dag_task_*` 也归入 PG1。
- **Goal-round-driver integration**: Goals have a linear phase state machine. Whether goal progression should appear in the DAG, and how, depends on the node taxonomy decision.
- **Cross-session DAG persistence**: G5 D8 confirmed DAG state is session-scoped (consistent with Goal, which is also session-scoped — verified from code). UUID ids + sessionId fields pre-reserve cross-session extensibility. G6 D2 决定 V1 不向 LLM 暴露 `expectedRevision`（单 Agent 无并发冲突），但 `revision` 字段保留在数据模型和事件中（G6 D1 稳定层），供未来多 Agent CAS 使用。Goal does NOT currently span sessions (`goal-round-driver` is same-session only).
- **dsh-data-agent DAG-aware planning**: G3 ✅ + G6 ✅ 现已解锁。data-agent 可通过 `ctx.dagModel.addTask()` 程序化 API（G6 D4）批量创建有依赖的任务链，不必走工具 API。具体的 data-agent 规划器集成设计归入 data-agent map——本 map 已提供所需的全部基础设施契约。
- **Multi-agent communication/mailbox**: Agent-to-agent messaging for coordination is a separate concern from the task DAG model. May require its own service when multi-agent arrives.

## Out of scope

- **Implementing the full multi-agent coordination protocol** — this map delivers the DAG visualization and data model infrastructure; the actual multi-agent negotiation, consensus, and dynamic workflow execution are future work that builds on what this map produces.
- **Rewriting the workflow engine** — the imperative `parallel()`/`pipeline()` JS script model stays; we add DAG visualization of its execution, not a declarative DAG-first workflow engine.
- **Mobile / responsive layout** — the three-column AppFrame's existing concession chain handles narrow viewports; the DAG panel follows the same rules, but mobile-specific optimization is out of scope.
- **Modifying upstream DSH packages** — all work is additive via plugin packages and bundle patch layers.
