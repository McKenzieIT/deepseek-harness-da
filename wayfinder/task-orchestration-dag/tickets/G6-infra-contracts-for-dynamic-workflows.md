# G6 — infrastructure contracts for dynamic workflows and multi-agent coordination

**Type**: grilling
**Status**: resolved
**Blocked by**: [G1 DAG data model decision](G1-dag-data-model-decision.md) ✅, [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)
**Blocks**: [G7 writeScopes conflict detection](G7-writescopes-conflict-detection.md), [G9 team-task integration](G9-team-task-upstream-integration.md), [G10 subagent tree integration](G10-subagent-tree-upstream-integration.md)

## Context from G1

G1 decided: the plugin owns its own event vocabulary (`dag/*` events, `ignorable: true`), DagTask data model (with ID, revision, blockedBy, ownerId, writeScopes), and correlation mechanism (`tools/pre-execute` interception). The architecture is a terminal state plugin that survives upstream merges.

The infra contracts question shifts from "what API does TeamTaskBoard expose" to "what extension points does the DAG plugin expose for future consumers."

## Context from G5

G5 resolved 8 项动态插入设计决策，其中以下对 G6 的基础设施契约设计有直接约束：

- **D1（视图模型通道）**：独立 Cordis 服务（`DagModelService`）+ `useDagModel()` React Hook。DAG 面板是侧边栏，不走 ConversationNodeDefinition。DagModelService 直接订阅 `dag/*` 事件维护响应式模型。
- **D2（DAG 角色定位：执行基底）**：**DAG 是 Harness 的基础设施层，不仅是展示层。** dsh-data-agent 将 DAG 作为编排替代 infra。关联准确性是硬需求（Agent 依据 DAG 做决策）。关联机制从 G1 的"时间启发式"升级为"task ownership"——`tools/pre-execute` 找当前 Agent 拥有的 in_progress task 进行关联。
- **D3（事件传播与一致性）**：同步命令式 API + 事件持久化的混合方案。工具 `execute()` 内直接调用 DagModelService 命令式 API（立即生效）+ `ctx.session.log()` 事件持久化。读写一致性是硬需求。内核是纯函数 `applyEvent(state, event) → state`，命令式和 replay 共用。
- **D8（持久性边界）**：Session-scoped，与 Goal 一致。跨 session 场景 V1 不支持，UUID id + sessionId 字段预留扩展。

**G5 D2 对 G6 的核心约束：** DAG 不是"仪表盘"，而是"执行状态的单一事实来源（SSOT）+ 主动关联引擎"。基础设施契约的设计必须反映这个定位——未来消费者不仅读取 DAG 来展示，还会依据 DAG 状态做编排决策。

## Question

What concrete interfaces, events, and extension points must the DAG plugin expose so that future systems (multi-agent coordination, data-agent planning, dynamic workflow orchestration) can plug into it?

**Sub-questions (refined by G1 + G5):**

1. **Session event contracts**: The `dag/*` events are the plugin's public API. Which events should be considered stable contracts that future consumers can depend on? G5 D2 将 DAG 定位为执行基底——生命周期事件（`task-create`/`task-update`）的消费者不仅是 UI，还有做编排决策的 Agent。关联事件（`subagent-linked`/`workflow-linked`）的关联机制已从 G1 时间启发式升级为 G5 D2 task ownership，但上游可能提供原生关联（G10 触发条件），mechanism 可变。

2. **Tool API stability**: The `dag_task_create`, `dag_task_update` tool schemas are model-facing. G5 D3 确认工具 `execute()` 直接调用 DagModelService 命令式 API——工具 API 是命令式 API 的薄壳，两层的参数结构天然对齐。

3. **Multi-agent extension point**: G5 D8 确认 V1 是 session-scoped。跨 session 共享状态不在 DAG 插件职责范围——未来由 agent-team 的 TeamTaskBoard（跨 session 共享）或 A2A 协议负责。DAG 插件在多 Agent 场景中的角色是 per-session SSOT + 关联引擎，不是跨 session 调度器。但 G5 D2 明确 DAG 是执行基底——`ownerId`/`writeScopes` 等字段在事件中完整携带，多 Agent 消费者可据此做决策。

4. **Data-agent planning integration**: G5 D3 已定义 DagModelService 的同步命令式 API。data-agent 规划器可通过 `dagModel.addTask(task)` 程序化操作，不必走工具 API 的字符串参数构造。问题变为：DagModelService 的命令式 API 是否应作为稳定的 Cordis 服务契约暴露。

5. **Visualization extension points**: G5 D1 确认渲染层完全解耦于数据层。节点类型扩展只影响渲染层（`viewFilter` 管道 + G6 v5 自定义节点），不影响 DagModelService 的数据契约。

## Design principle

**执行基底的最小稳定契约** — DAG 是执行状态 SSOT（G5 D2），其事件和 API 是未来编排消费者的数据源，稳定性承诺必须反映这个定位。同时遵循最小暴露原则：只承诺当前已确认的消费者需要的接口，不预设未知的编排协议。`ignorable: true` 信封保证旧版消费者的前向兼容。

## Resolution

五项基础设施契约决策 resolved via grilling session（2026-09-01），informed by G1 + G5 decisions + 2026 H2 前沿调研。

### D1：Session 事件三层稳定性模型

| 层级 | 事件 | 承诺 | 演进规则 |
|---|---|---|---|
| **稳定（Stable）** | `dag/task-create`, `dag/task-update` | payload schema 不破坏性变更 | 仅新增可选字段；payload 携带 `version: 1` |
| **半稳定（Semi-stable）** | `dag/subagent-linked`, `dag/workflow-linked` | 事件类型名和关联语义不变，payload 结构可随 version 升级变化 | 新版本可改字段；消费者按 `version` 分支处理 |
| **内部（Internal）** | 未来的可视化状态事件 | 无承诺 | 随时可变，不对外暴露 |

所有 `dag/*` 事件的 payload 携带 `version` 字段（与上游 `team/task` 的 `version: 1` 模式对齐），与信封层 `ignorable: true` 正交——`ignorable` 管"能不能跳过"，`version` 管"payload 怎么解析"。

半稳定层事件携带 `correlationSource` 字段（V1 值为 `'pre-execute-heuristic'`），标明关联来源。当上游提供原生关联（G10 触发条件）时，新 version 可将 `correlationSource` 改为 `'native'`。

**行业参考：** OpenTelemetry GenAI 语义约定截至 2026-08 仍处 Development 状态，无框架敢承诺 Stable——"采纳 + 版本化"是业界实际做法。arXiv 2608.23953 确认事件源日志是三大 harness 的收敛形态，dsh 是最强形式。

### D2：工具 API "只增不删不改名"

- `dag_task_create`：`subject`(必需)、`description?`、`blockedBy?`、`writeScopes?`
- `dag_task_update`：`taskId`(必需)、`status?`、`subject?`、`description?`、`blockedBy?`、`writeScopes?`
- `dag_task_get`：`taskId`(必需)
- `dag_task_list`：`status?` 过滤

V1 不向 LLM 暴露 `expectedRevision`（单 Agent 无并发冲突）和 `action` 枚举（status 字段比 action 枚举对 LLM 更自然）。工具名 `dag_task_*` 前缀承诺不变。未来只通过新增可选参数演进。

### D3：多 Agent 扩展——V1 不新建机制

靠已有预留：
- DagTask 数据模型字段：`ownerId`、`createdBy`、`writeScopes`、`revision`
- D1 稳定层事件完整携带 ownership 字段
- Cordis 原生事件监听（`ctx.on('dag/*', handler)`）

不建：
- 跨 session 事件总线（通信归 agent-team 邮箱/A2A）
- 共享任务存储（V1 session-scoped per G5 D8；跨 session 归 agent-team TeamTaskBoard via G9）
- 任务分配协商协议（编排逻辑归 agent-team claim/release）

**DAG 的多 Agent 角色定位（对齐 G5 D2）：** per-session 执行状态 SSOT + 主动关联引擎。是"数据库"（保证准确、一致、可查询），不是"应用逻辑"（决定谁做什么）。调度决策由上层（agent-team、data-agent 规划器）做出后写入 DAG。

### D4：DagModelService 暴露为 `ctx.dagModel` Cordis 服务契约

| 方法 | 语义 | 对应工具 |
|---|---|---|
| `addTask(task): DagTask` | 创建任务 | `dag_task_create` |
| `updateTask(taskId, changes): DagTask` | 更新任务 | `dag_task_update` |
| `getTask(taskId): DagTask \| null` | 查询单个 | `dag_task_get` |
| `listTasks(filter?): DagTask[]` | 列出任务 | `dag_task_list` |
| `snapshot(): DagSnapshot` | 只读快照 | 无（内部/渲染用） |

工具 API 是程序化 API 的薄壳。关联方法（`linkSubagent`/`linkWorkflow`）和内核纯函数（`applyEvent`）保持内部——关联机制是半稳定的（D1），不适合作为稳定服务契约。

稳定性承诺：与工具 API 同样的"只增不删不改名"。data-agent 规划器通过 `ctx.dagModel.addTask()` 批量创建有依赖的任务，不必走工具 API。

**行业参考：** 所有成熟框架（Conductor、LangGraph）以程序化 API 为核心，工具/REST API 是薄壳。

### D5：节点类型——V1 硬编码 + string type + 渲染 fallback

- `DagNode.type` 字段类型为 `string`（不限制枚举），数据层不拒绝未知类型
- V1 硬编码 5 种类型的渲染样式（task、team-task、workflow-run、workflow-agent、subagent）
- 渲染层遇到未知 `type` 时渲染为通用灰色矩形节点（显示 type 名），不报错
- 不建渲染注册表——等第二个渲染消费者出现时再提取接口
- `viewFilter` 管道（G5 D4）是天然扩展点
- 新类型通过 `applyEvent` 加 case + 渲染层加样式，不需要架构变更

## Industry references (2026 H2)

- **arXiv 2608.23953** (2026-08-25): "The Empire, Long Divided, Must Unite" — 三大 coding-agent harness 架构收敛研究。确认五个收敛元素（商品化循环、追加式可重放 session 记录、模型怪癖作为数据、上下文渐进展开、显式扩展接缝）。dsh 的事件源日志被评为最强形式。扩展接缝是收敛共识，分歧在组合风格。
- **OpenTelemetry GenAI Semantic Conventions** (2026-08): Agent span 类型（create_agent、invoke_agent、invoke_workflow、plan、execute_tool）仍处 Development 状态。v1.37 重写多轮对话记录。6月移入独立仓库独立版本化。"采纳 + 版本化"是业界做法。
- **Orkes Conductor** (2026): "Agents are workflows underneath"——Agent 编译为 workflow DAG，程序化 SDK 为主 API，REST/工具为薄壳。多 Agent = 父 Agent + 子 Agent 列表 + 策略字段。
- **Microsoft Conductor** (2026-08): YAML 定义 multi-agent workflow，确定性 Jinja2 路由，编排层不用 LLM。
- **MongoDB Agent Observability** (2026-08-25): Agent 可观测性 ≠ 请求监控——trace 是 parent-child span 树，与 DAG 节点层级对应。

## Upstream merge risk

Low for event contracts — they're our own namespace. Medium for tool API — if upstream introduces a competing structured task tool, we'll need to evaluate merging.
