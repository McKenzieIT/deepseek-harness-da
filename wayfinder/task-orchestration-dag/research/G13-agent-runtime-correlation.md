# G13 — AI agent/runtime 任务执行关联模型调研

> 调研截止与访问日期：2026-09-12。仅采用官方文档、官方源码或规范；源码引用固定到调研时的提交。

## 短结论

DSH 不应从当前 Agent、父子 Session、调用栈或 trace 树反推 Task 因果关系。最稳妥且仍然简单的模型是：Task Graph Service 在派发前持久创建 `ExecutionAttempt`，随后由 executor adapter 把实际产生的 Agent、skill、tool call、subagent run、workflow run 和外部操作标识写成显式关联记录；trace 只作为可观测性引用，永远不能授权执行、完成或重试。

业界可复用的关键分层是 Temporal 的“业务标识 / 一次执行 / 内部重试尝试”分离、LangGraph 的“持久线程与 checkpoint / 单次 run / node attempt”分离，以及 Claude Code 的“可写 Task 列表与独立 executor 标识”分离。OpenAI Agents SDK 和 AutoGen 则反向证明：即使 run items、message IDs、agent lineage 和完整 traces 很丰富，也仍不等于可写、可审计的任务状态。

推荐 G13 采用“精简 execution envelope + append-only explicit link records”的组合，不增设独立 Execution Ledger。语义重试创建新的 DSH `ExecutionAttemptId`；同一 executor 调用内部的传输或节点重试保留原 Attempt，只记录 native attempt ordinal。取消请求、取消确认和未知外部结果必须是不同状态。

## 判定口径

| 概念 | 本文判定 |
|---|---|
| Task identity | 用户或规划器可持续引用、修改依赖和状态的工作项标识；不能只是一次模型调用、span 或队列任务。 |
| ExecutionAttempt | Task 经准入后的一次具体执行承诺。改变执行输入、executor、claim，或在未知外部结果后重新执行，均创建新 Attempt。 |
| Native attempt | 某 executor 内部对同一已准入操作的传输、模型请求、节点或 Activity 重试；除非 DSH 明确升级为语义重试，否则不新建 DSH Attempt。 |
| Authoritative state | 恢复、调度、准入和状态转换读取的正式状态；缺失时系统不得用日志推导后继续。 |
| Observational trace | 用于诊断、计量和展示的记录；允许关闭、丢失、延迟导出或采样，因此不能承担业务授权。 |

## 统一对比

### 身份、执行尝试与重试

| 系统 | Task identity 是否持久 | 一次执行如何标识 | 工具与子代理如何关联 | retry 语义 | 对 DSH 的结论 |
|---|---|---|---|---|---|
| **OpenAI Agents SDK** | SDK 文档把一次 `Runner` run 定义为一个 application-level turn；持久连续性由应用历史、SDK Session、Conversation 或 `previous_response_id` 承担，没有内建的可写 Task/DAG 实体。[^oa-running] | 高层结果提供 `last_response_id`、`last_agent`、`interruptions` 和可序列化 state；丰富 run items 记录 tool、handoff 和 approval 边界，但没有业务 `TaskId` 或独立 `ExecutionAttemptId`。[^oa-results] | run item 带产生它的 Agent；tool call/output 以 provider `call_id` 对接，handoff item 记录 source/target agent。trace 用 span parent 关系呈现 model、tool、handoff 和 guardrail 活动。[^oa-observability][^oa-items] | Runner-managed model retry 是 opt-in，策略看到 `attempt`，但该计数是模型请求重试，不会形成新的业务任务 Attempt；审批暂停后从同一 state 恢复，官方明确称其仍是同一 run。[^oa-retry][^oa-approval] | 把 `call_id`、handoff 或 span 作为 Attempt 的外部引用；不要把 run、trace 或内部 retry ordinal 当 Task/Attempt。 |
| **Claude Code Tasks / Agent Teams / Subagents / Hooks** | Agent Teams 的共享任务列表有 `task_id`、三态、依赖和认领；任务目录持久保存在 `~/.claude/tasks/{session-derived-name}/`，恢复 Session 后继续使用。[^claude-teams] | 官方任务事件只有 `task_id`，没有 execution-attempt 字段。teammate/subagent 有 `agent_id`，工具调用有 `tool_use_id`，但三者的 hook schema 没有共同的 Attempt ID。[^claude-hooks] | 所有 hook 共享 `session_id`，新版本还可共享当前 `prompt_id`；Task、Subagent 和 Tool 各自事件分别携带 `task_id`、`agent_id`、`tool_use_id`。这支持同一 Session 内观察，却没有声明哪次 subagent/tool call 执行哪一个 Task。[^claude-hooks] | 文档描述 API 请求可在同一 teammate 中等待并重试，也建议失败后启动 replacement teammate；任务列表本身没有 attempt 序号或 retry-of 关系。[^claude-teams] | 这是“有任务权威、缺尝试关联”的直接样本。Task owner/teammate 与实际执行因果必须显式绑定。 |
| **LangGraph** | checkpointer 按 `thread_id` 保存每个 superstep 的图状态；checkpoint ID 标识线程内状态点，pending writes 避免恢复时重跑同一步已成功节点。图状态可以承载业务任务，但默认 Pregel task 是执行器内部节点任务。[^lg-checkpoint] | LangGraph Platform 有独立 `run_id`；每个 Pregel task 有 `id`、`name`、`path`、error、interrupts 和 result。Interrupt 也有可直接恢复的 ID。[^lg-types][^lg-run] | 子图通过 checkpoint namespace 和 task ID 形成执行路径；stream `tasks` 事件公开节点 task start/result，适合观察节点执行。[^lg-types] | `run_with_retry` 对同一个 `PregelExecutableTask` 循环，保持 `task.id`，只增加 `node_attempt`；成功前清除前一轮 writes。retry 因此是同一节点执行单元内的 native attempt，不是新的业务任务。[^lg-retry] | 可借鉴 `thread / run / node task / node_attempt` 四层，而不能把 Pregel task ID 直接映射为 Plan Task ID。 |
| **Microsoft AutoGen Core / AgentChat** | `AgentId(type,key)` 持久标识 runtime 内 agent；runtime/team 可显式 `save_state` / `load_state`，但 `TaskRunner.run(task=...)` 的 task 是输入内容，`TaskResult` 只有 messages 与 stop reason，没有 Task ID。[^ag-agent][^ag-task][^ag-state] | runtime message 可带唯一 `message_id`，缺省生成 UUID；AgentChat message/event 也有自己的 ID。没有统一的 execution-attempt 实体。[^ag-message] | `MessageContext` 关联 sender、topic、RPC 标志、cancellation token 和 message ID；模型 tool request/result 使用 call ID。它们形成消息与调用链，而非任务归属。[^ag-message][^ag-tool] | TaskRunner 是有状态的，后续 `run()` 可继续当前 task；重调 `run`、模型客户端重试或消息重投没有统一的业务 Attempt 编号。[^ag-task] | adapter 可以消费 AgentId、message ID、tool call ID；Task/Attempt 仍须由 DSH 生成并持久化。 |
| **Temporal** | `Workflow ID` 是应用定义、可承载业务含义的稳定标识；同一执行链的各 run 共享 Workflow ID，而每个 run 有唯一系统 `Run ID`。Event History 是恢复与继续执行所依赖的持久事实。[^temporal-ids][^temporal-history] | `Activity ID` 标识一个 Activity Execution；一次 Activity Execution 由一串 Activity Task Executions 组成，每个 Activity Task 运行一次 attempt。异步完成可用唯一 Task Token 定位具体 Activity Task Execution。[^temporal-activity][^temporal-task] | Workflow/child workflow/Activity 由历史事件显式关联；外部系统通过 Signal、Update 或 Task Token 回填结果。Signal 是异步写，Update 是可等待结果的 tracked write。[^temporal-message][^temporal-activity] | Activity retry 创建新的 Activity Task Execution，但保留同一 Activity Execution/Activity ID；Workflow retry 则创建新 Run ID。[^temporal-retry][^temporal-ids] | 最接近 G13 所需的分层：稳定业务 ID、语义执行 ID、内部 attempt ordinal 和显式外部完成句柄分开。 |

### 人工介入、取消与权威性

| 系统 | 人工介入与取消记录 | 权威状态 | trace 的地位 |
|---|---|---|---|
| **OpenAI Agents SDK** | 敏感 tool call 先形成 interruption；应用审批或拒绝后，从序列化 state 恢复同一 run。流式 run 中止后，也应从 state 恢复未完成 turn，而不是新开 turn。[^oa-running][^oa-approval] | `RunState` 对该 SDK run 的暂停点、审批决定和恢复有效；它不是跨任务的 Plan DAG。 | 官方把 tracing 定位为调试 model/tool/handoff/approval 的端到端记录；trace 属于观测面。[^oa-observability] 因其可按 run 控制且与审批 state 分离，本文判定其不能作业务授权。 |
| **Claude Code** | `TaskCreated` 与 `TaskCompleted` hook 可阻止创建或完成；权限由 PermissionRequest/permission mode 决定。teammate shutdown 是请求—接受/拒绝流程。官方还明确：agent 间消息不能代替用户批准，也不能转交被拒绝的动作来绕过权限。[^claude-hooks][^claude-teams] | 共享任务列表是可写任务状态；Task hook 是状态转换的同步门点。官方同时承认任务状态可能滞后，工作已完成而 task 未标记，说明执行观察与任务状态仍是两套事实。[^claude-teams] | hook/transcript 是生命周期观察和策略接入面；transcript 还可能落后于内存会话。只有 Task 服务写入的状态和权限系统的决策可作权威。[^claude-hooks] |
| **LangGraph** | Interrupt ID 可用于恢复；Platform run 有 pending/running/error/success/timeout/interrupted 状态，并可按 `(thread_id, run_id)` 取消，选择 interrupt 或 rollback。[^lg-types][^lg-run] | checkpoint、pending writes 与状态版本决定恢复后继续哪些节点，因此是 graph execution 权威；业务 Task 只有显式建模进 graph state 后才具备同等地位。 | `tasks`/`debug` stream 是投影和观察输出，不能替代 checkpoint。retry 观察中的 node attempt 也不改变业务状态所有权。 |
| **AutoGen** | `CancellationToken` 取消已链接的进程内 Future；团队 pause/resume 由 agent 自己实现。团队状态可保存，但运行中保存可能不一致，runtime state 还明确不保存 subscription state。[^ag-cancel][^ag-state] | 应用保存的 agent/team state 对会话连续性有效，但框架未定义持久 Task/Attempt 状态机或 durable cancellation record。 | OpenTelemetry 可禁用为 NoOp provider，明确用于把 telemetry 发往观测后端；只能是 observational trace。[^ag-telemetry] |
| **Temporal** | cancel 与 terminate 是不同操作，取消请求会写入 `WorkflowExecutionCancelRequested`，由 Workflow 获得清理机会；Activity 是否已造成外部效果可能在 worker 崩溃或超时后未知，重试依赖幂等设计。[^temporal-cancel][^temporal-activity] | Temporal Service 追加的 Event History 驱动恢复；Activity scheduled/started/completed/failed/cancelled 等是正式执行事实。Principal Attribution 由服务依据已认证 caller 写入，客户端不能伪造。[^temporal-history] | 指标和 trace 可解释运行，但调度、恢复、身份归因和取消以 Event History 与服务授权为准。 |

## 哪些只是 trace，哪些具有可写权威状态

| 分类 | 系统与限制 |
|---|---|
| **只有 observational trace，不能提供任务权威** | OpenAI tracing、AutoGen OpenTelemetry。两者都记录执行活动，但控制和恢复分别依赖 RunState/Session 或应用保存的 component state；关闭 trace 不应改变业务结果。[^oa-observability][^ag-telemetry] |
| **有 authoritative writable task state，但缺少 Attempt 关联** | Claude Code shared task list。它持久化 task identity、状态和依赖，并允许 hook 阻止创建/完成；但 tool/subagent hook 没有 `task_id`，任务状态也可能落后于真实工作。[^claude-teams][^claude-hooks] |
| **有 authoritative writable execution state，不自动等于业务 Plan DAG** | LangGraph checkpoint/state 与 Temporal Event History。前者权威地恢复图执行，后者权威地恢复 Workflow Execution；只有应用显式把业务 Task/依赖写入这些状态时，它们才同时成为计划权威。[^lg-checkpoint][^temporal-history] |
| **有可恢复状态但没有框架级任务实体** | OpenAI `RunState` 与 AutoGen agent/team state。它们适合恢复一次 run 或会话组件，不足以回答“哪个 Task 的第几次 Attempt 因何被准入、由谁执行、何时完成”。[^oa-results][^ag-task][^ag-state] |

## 不能从 Agent、lineage 或 trace 自动推断 Task causality 的反例

| 反例 | 错误推断 | 实际歧义与后果 |
|---|---|---|
| 一个 Agent 连续处理多个 ready Tasks | “当前 Agent 的所有 tool calls 都属于当前 Task。” | OpenAI 的一个 run 可以经历多个工具和 handoff；AutoGen 的同一 stateful runner 后续调用继续既有状态；Claude teammate 也会完成一个 task 后自领下一个。Agent identity 只说明执行者，不能划分 Task。[^oa-running][^ag-task][^claude-teams] |
| 一个 Task 同时使用主 Agent、subagent 和 workflow | “父子 Session 树就是 Task 树。” | Claude hooks 的 Task、Subagent、Tool 各有独立 ID，只有共同 session/prompt；DSH 当前 subagent lineage 也只证明派生关系。一次 Task 可含多个子执行，一次子执行也可服务诊断、验证或修复而非主交付。[^claude-hooks] |
| 内部 retry 与语义 retry 混淆 | “出现第二个 span/请求就是第二个 Task Attempt”，或“同一 node task ID 表示没有 retry。” | LangGraph 保持同一 task ID 并递增 `node_attempt`；Temporal Activity retry 新建 Activity Task Execution，但仍属于同一 Activity Execution；OpenAI 模型请求 retry 也只是 runtime 内部计数。三者证明 Attempt 层级必须由拥有业务语义的系统定义。[^lg-retry][^temporal-task][^oa-retry] |
| approval resume 被当成新工作 | “暂停后恢复生成了新调用，所以应创建新 Attempt。” | OpenAI 明确要求从 state 恢复同一 run；LangGraph interrupt ID 恢复同一图执行。若批准的是原来同一待执行动作，应保持原 Attempt，只追加 hold/decision/resume 事实。[^oa-approval][^lg-types] |
| cancel 请求被当成已取消 | “已发 cancel，因此外部动作没有发生。” | Temporal 明确区分取消请求、Activity 接收取消和最终关闭；worker 可能在外部效果后崩溃，服务只能等待 timeout 再 retry。DSH 若没有确认结果，必须落为 `unknown` 或 `cancelling`，不能自动标记 `cancelled`。[^temporal-cancel][^temporal-activity] |
| span parent 或时间邻近被当成授权 | “这个 tool span 位于 Task span 下，因此有权执行并可据此完成 Task。” | OpenAI trace 用于调试；Claude 权限由独立 PermissionRequest/permission rules 决定；Temporal 的 actor attribution 由服务认证身份写入历史。层级与时间只能解释观察，不能替代 claim、revision fence、permission decision 或 completion verdict。[^oa-observability][^claude-hooks][^temporal-history] |
| 相同 native ID 在不同生命周期层复用 | “稳定 ID 就是业务 Task ID。” | Temporal Workflow ID 跨多个 Run ID 保持不变，Activity ID 跨内部 attempts 保持不变；LangGraph task ID 跨 node retries 保持不变。ID 的稳定性必须连同其作用域和生命周期解释。[^temporal-ids][^temporal-task][^lg-retry] |

## DSH 简化候选

| 候选 | 最小机制 | 复杂度 | 回放与崩溃恢复 | 跨进程适配 | 用户可解释性 | 结论 |
|---|---|---:|---|---|---|---|
| **A. 仅 execution envelope** | 准入时生成 `ExecutionAttemptId`，把 `{taskId, attemptId, attemptNo, planRevision, claimId, actor, executorKind, parentAttemptId?, groupId?}` 注入当前执行上下文；tool/subagent/workflow 从上下文读取。 | 低 | 单进程同步路径清晰；若进程在 native executor 已启动、返回 native ID 前崩溃，无法证明是否派发成功。 | 只有 executor 能透传 metadata 时可靠；旧 provider、外部服务或独立 worker 容易丢关联。 | 简单，但会出现“Attempt 有运行、没有可点击 native 对象”的空洞。 | 可作基础，不能单独完成 G13。 |
| **B. 仅 explicit link records** | Task Graph Service 接收 `AttemptLinked` 命令，持久记录 `{attemptId, relation, nativeKind, nativeId, parentBindingId?, source, authority}`；允许 native ID 产生后再绑定。 | 中 | append-only 记录适合 replay，并可表达一对多、多阶段和晚到结果；若派发前无 envelope，仍有“先产生外部效果、后建立关联”的窗口。 | 对不能修改的 executor 最友好；adapter 观察 start/result 后提交 link。 | UI 可列出“此 Attempt 启动了哪些执行”，并区分 causal 与 inferred。 | 必要，但最好与 A 组合。 |
| **C. adapter-owned correlation** | 每个 adapter 自己保存 `attemptId ↔ native IDs`，Plan DAG 只存一个 adapter handle。 | 表面低、总量高 | 每种 adapter 的恢复、去重、迁移和缺失数据语义不同；中心回放必须查询多个状态源。 | 本地实现容易，跨进程时需要额外数据库或 RPC；adapter 消失会使历史不可解释。 | 用户需理解各 executor 的映射规则，错误和冲突难统一说明。 | 不应作为权威模型；adapter 只负责提取和提交关联。 |

## 对 DSH 的独立推荐

采用 **A + B 的最小组合**，并保持 [G12](../tickets/G12-task-graph-authority.md) 已确定的单一 Task Graph 权威：

1. **准入是第一个持久 commit point。** Task Graph Service 在任何模型、tool、subagent、workflow 或外部调用前 append-and-flush `attempt/admitted`；事件至少固定 `taskId`、`attemptId`、Task/Plan revision、claim、actor、executor kind、`attemptNo`，以及可选 `parentAttemptId` / `attemptGroupId`。派发只接受这个 envelope，不能从 ambient current Agent 猜测。[^temporal-ids][^lg-run]
2. **关联是独立的 append-only record。** native ID 出现后，adapter 提交 `attempt/link-added`，由 Task Graph Service 校验并持久化。link 至少含 `bindingId`、`attemptId`、`relation`、`nativeKind`、`nativeId`、adapter identity、scope，以及 `authority: causal | observational`。同一 Attempt 可关联多个 tool calls、subagent runs 和 workflow runs；一个 native run 只有在 executor 明确声明共享时才可关联多个 Attempts。[^claude-hooks][^oa-results]
3. **跨进程使用预分配 dispatch identity。** 派发前生成 `dispatchId`，能透传的 executor 把它放入 request metadata；不能透传的 adapter 在本地用 `dispatchId` 等待 native ID，再提交 link。若崩溃发生在“外部已接收、native ID 未持久化”之间，Attempt 进入 `unknown`，由 adapter 对账，不得直接重试有副作用的动作。[^temporal-activity]
4. **区分 DSH semantic retry 与 native retry。** 更换输入、executor、claim，显式修复后重做，或未知外部结果后重新承担风险，均新建 Attempt，并记录 `retryOfAttemptId`。同一已准入调用内的网络重试、模型请求重试、LangGraph node attempt 或 Temporal Activity Task attempt 保留原 DSH Attempt，只在 observation 中记录 `nativeAttemptOrdinal`。这保持用户看到的“第几次做这项任务”稳定，同时不丢底层诊断。[^lg-retry][^temporal-retry][^oa-retry]
5. **父子关系必须显式。** subagent/workflow/tool 默认是一个 Attempt 的 execution binding，不自动成为 child Attempt。只有 Task Graph Service 为另一个 Task 完成独立准入时，才创建 `parentAttemptId` 或 Attempt Group membership。Session lineage、Agent owner、span parent、prompt ID、时间邻近和文本相似度只可生成 `authority: observational` 的 UI 建议。[^claude-hooks][^oa-observability]
6. **人工介入与取消分阶段记录。** `hold/requested`、`hold/resolved`、`cancel/requested`、`cancel/acknowledged` 和最终 `attempt/settled` 分开。恢复同一已批准动作沿用原 Attempt；取消未确认或外部副作用不明时，结局为 `unknown`，不能折叠成 `cancelled` 或 `failed`。[^oa-approval][^lg-types][^temporal-cancel]
7. **授权不读取 trace。** admission、tool guard、completion 和 retry 只读取 Task Graph projection、claim、revision fence、permission/approval decision 与 verifier verdict。trace/span ID、Session lineage 和 adapter observation 仅作为链接、诊断和展示输入。即使 trace 被关闭、延迟、裁剪或缺失，权威状态机仍须给出相同决策。[^oa-observability][^claude-hooks][^temporal-history]

该方案只增加一个轻量 envelope 和一种通用 link record，不复制 subagent、workflow、skill 或 tool 的内部状态机，也不需要独立 Execution Ledger。它同时覆盖本地调用、worker thread、远程 executor、人工等待和外部未知结果，是 G13 后续 G14 持久事件与 G17 adapter 设计的最小共同协议。

## 一手资料

[^oa-running]: OpenAI, [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents), 访问 2026-09-12。
[^oa-results]: OpenAI, [Results and state](https://developers.openai.com/api/docs/guides/agents/results), 访问 2026-09-12。
[^oa-approval]: OpenAI, [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals), 访问 2026-09-12。
[^oa-observability]: OpenAI, [Integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability)；[Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)，访问 2026-09-12。
[^oa-items]: OpenAI Agents SDK Python 官方源码，[`items.py`](https://github.com/openai/openai-agents-python/blob/fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292/src/agents/items.py#L97-L106) 、[tool call identifiers](https://github.com/openai/openai-agents-python/blob/fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292/src/agents/items.py#L383-L460) 与 [handoff item definitions](https://github.com/openai/openai-agents-python/blob/fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292/src/agents/items.py#L300-L322)，提交 `fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292`，访问 2026-09-12。
[^oa-retry]: OpenAI Agents SDK Python 官方源码文档，[Runner-managed retries](https://github.com/openai/openai-agents-python/blob/fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292/docs/models/index.md#L510-L568)，提交 `fbd2dbcaaf74a2c447c6d3fa9d5645d83fd7e292`，访问 2026-09-12。
[^claude-teams]: Anthropic, [Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams#assign-and-claim-tasks)，特别是 “Assign and claim tasks”“Architecture”“Permissions”“Limitations”，访问 2026-09-12。
[^claude-hooks]: Anthropic, [Hooks reference](https://code.claude.com/docs/en/hooks)，特别是 “Common input fields”“PreToolUse input”“PermissionRequest input”“SubagentStart input”“SubagentStop input”“TaskCreated input”“TaskCompleted input”，访问 2026-09-12。
[^lg-checkpoint]: LangChain, LangGraph 官方源码，[checkpoint README](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/checkpoint/README.md#L17-L69)，提交 `e539ac122f4126f6dd850581c1494948cf620e31`，访问 2026-09-12。
[^lg-types]: LangChain, LangGraph 官方源码，[stream task payloads](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/langgraph/langgraph/types.py#L122-L136)；[`Interrupt` 与 `PregelTask`](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/langgraph/langgraph/types.py#L573-L646)，访问 2026-09-12。
[^lg-retry]: LangChain, LangGraph 官方源码，[`run_with_retry`](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/langgraph/langgraph/pregel/_retry.py#L573-L680)，提交 `e539ac122f4126f6dd850581c1494948cf620e31`，访问 2026-09-12。
[^lg-run]: LangChain, LangGraph SDK 官方源码，[Run schema](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/sdk-py/langgraph_sdk/schema.py#L363-L380) 与 [cancel API](https://github.com/langchain-ai/langgraph/blob/e539ac122f4126f6dd850581c1494948cf620e31/libs/sdk-py/langgraph_sdk/_sync/runs.py#L925-L979)，访问 2026-09-12。
[^ag-agent]: Microsoft, AutoGen 官方源码，[`AgentId`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/_agent_id.py#L12-L68)，提交 `027ecf0a379bcc1d09956d46d12d44a3ad9cee14`，访问 2026-09-12。
[^ag-task]: Microsoft, AutoGen 官方源码，[`TaskResult` 与 `TaskRunner`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-agentchat/src/autogen_agentchat/base/_task.py#L9-L64)，访问 2026-09-12。
[^ag-message]: Microsoft, AutoGen 官方源码，[`MessageContext`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/_message_context.py#L8-L14) 与 [runtime message ID generation](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py#L332-L385)，访问 2026-09-12。
[^ag-tool]: Microsoft, AutoGen 官方源码，[model tool result `call_id`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/models/_types.py#L56-L77)，访问 2026-09-12。
[^ag-cancel]: Microsoft, AutoGen 官方源码，[`CancellationToken`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/_cancellation_token.py#L6-L46)，访问 2026-09-12。
[^ag-state]: Microsoft, AutoGen 官方源码，[runtime `save_state` / `load_state`](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-core/src/autogen_core/_agent_runtime.py#L217-L231)；[team state portability and consistency warning](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py#L748-L777)，访问 2026-09-12。
[^ag-telemetry]: Microsoft, AutoGen 官方文档，[OpenTelemetry](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/docs/src/user-guide/core-user-guide/framework/telemetry.md#L1-L16)，访问 2026-09-12。
[^temporal-ids]: Temporal, 官方文档源码，[Workflow ID and Run ID](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/workflow/workflow-execution/workflowid-runid.mdx#L19-L50)，提交 `13205cdb299b8ae88b77a7c7f16f0ccb8b526926`，访问 2026-09-12。
[^temporal-history]: Temporal, 官方文档源码，[Workflow Event History](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/workflow/workflow-execution/event.mdx#L25-L45) 与 [Principal Attribution](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/workflow/workflow-execution/event.mdx#L124-L153)，访问 2026-09-12。
[^temporal-activity]: Temporal, 官方文档源码，[Activity Execution、取消、Activity ID 与异步完成](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/activities/activity-execution.mdx#L23-L121)，访问 2026-09-12。
[^temporal-task]: Temporal, 官方文档源码，[Activity Task Execution](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/workers/tasks.mdx#L122-L145) 与 [Task Token](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/activities/activity-execution.mdx#L186-L190)，访问 2026-09-12。
[^temporal-retry]: Temporal, 官方文档源码，[Retry Policies](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/retry-policies.mdx#L126-L152) 与 [Maximum Attempts](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/retry-policies.mdx#L199-L209)，访问 2026-09-12。
[^temporal-message]: Temporal, 官方文档源码，[Signals, Queries, and Updates](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/encyclopedia/workflow-message-passing/workflow-message-passing.mdx#L16-L57)，访问 2026-09-12。
[^temporal-cancel]: Temporal, 官方文档源码，[Workflow cancellation](https://github.com/temporalio/documentation/blob/13205cdb299b8ae88b77a7c7f16f0ccb8b526926/docs/develop/python/workflows/cancellation.mdx#L20-L40)，访问 2026-09-12。
