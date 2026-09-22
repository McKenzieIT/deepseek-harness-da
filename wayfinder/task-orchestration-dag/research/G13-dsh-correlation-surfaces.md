# G13 — DSH 权威执行关联面审计

审计基线：`8ccf93d2699260a9cd5d7763ea8d7ece9d8fa1ad`。范围仅包括当前仓库的公开类型、事件、服务和包文档；不把现有 Wayfinder 研究稿当作事实来源。

## 执行摘要

1. DSH 已有可复用、可写入持久引用的身份是 `SessionId`、`SessionSeq`、`MessageId`、`ToolCallId` 和 `WorkflowRunId`；Agent 的公开身份就是其 Session id。`SubagentRun.id` 对本地子 Agent 等于子 Session id，但远程 provider 只保证它在父命名空间内唯一。`packages/core/session/src/types.ts:16-40`；`packages/core/agent/src/types.ts:12-16`；`packages/llm/llm/src/brand.ts:15-39`；`packages/workflow/workflow/src/types.ts:12-22`；`packages/subagent/subagent/src/types.ts:308-320`。
2. `Session.append()` 只完成内存日志提交和 `session/event` 发布；崩溃持久性必须以 `ctx.sessions.flush(session)` 成功为准。现成 checkpoint policy 已在模型请求前、顶层工具体前和下一 step 前执行该屏障。`packages/core/session/src/index.ts:640-721`；`packages/core/session/src/index.ts:1098-1127`；`packages/session/session-persistence/src/handle.ts:85-109`；`packages/session/session-checkpoint-policy/src/index.ts:20-37,52-82`。
3. `agent/pre-step` 是当前 Agent admission fencing 的最强公开点：它拿到已 claim 的消息、`turn`、`step` 和取消信号，可拒绝进入；它位于 `turn/start` 与 `step/start` 之间。因此它能阻止模型请求和工具执行，但不能阻止空转的 `turn/start` 或 inbox claim。`packages/core/agent/src/runtime-types.ts:332-344`；`packages/core/agent-loop/src/agent.ts:236-290`。
4. 工具的严格“副作用前关联”应在 `tools/execute` wrapper 中完成：核心先记录 `tool/call`，再经过 `tools/pre-execute`、单调 `tools.guard()`，只有通过后才进入 `tools/execute` 和工具体；wrapper 可追加关联事件并 flush，再调用 `next()`。`docs/tool-execution-pipeline.md:12-28`；`packages/core/tools/src/index.ts:709-717,1103-1118,1467-1507,1548-1554`。
5. `ToolExecutionToken`、`Agent` 对象/`agent.ctx`、initiator AsyncLocal 身份、`AbortSignal` 和 `LlmAttemptId` 都只能作为进程内辅助；它们不能进入权威协议。`ToolCallId`、`MessageId`、`SessionId`、`SessionSeq` 才能进入持久引用。`packages/core/tools/src/index.ts:297-344,378-390,1869-1872`；`packages/core/agent/src/index.ts:294-335`；`packages/core/agent-loop/src/assistant-stream.ts:23-46,73-108`。
6. subagent 的 `subagent/start`/`subagent/end` 是 observe-only live 事件；本地子 Agent 另有 `SessionHeader.parentSession`、`origin: 'subagent'` 和子 Session 内的 `subagent/descriptor`。这些事实证明原生父子关系和子类型，不证明 Task 因果关系。`packages/subagent/subagent/src/index.ts:136-168`；`packages/subagent/subagent/src/child-agent.ts:138-155`；`packages/subagent/subagent/src/descriptor.ts:29-39`。
7. workflow 的 `workflow/*` 也是 live 事件。`tool-workflow` 会把顶层 run/member start/end 写入父 Session，但记录不含发起它的 `ToolCallId`，因此仍需插件自有 Attempt→WorkflowRun 显式绑定。`packages/workflow/workflow/src/index.ts:31-89`；`packages/workflow/tool-workflow/src/types.ts:13-63`；`packages/workflow/tool-workflow/src/index.ts:68-129,283-325`。
8. skill 没有原生 run id 或 start/end 事件。模型调用可由普通 `ToolCallId` 关联；用户显式 `/name` 调用会生成带 `skill-invocation` source 和 skill name 的持久 `user/message`。因此 skill 应作为 Attempt 的执行方法引用，而不是独立生命周期。`packages/skill/skill/src/index.ts:140-160`；`packages/skill/tool-skill/src/index.ts:127-161,177-203`。
9. 跨进程 subagent 不能安全地直接写 Task Graph：initiator scope 不跨进程，远程 run 没有本地 Agent，现有请求没有 Task/Attempt capability，且当前 continuation 没有跨进程 lease 或 durable mailbox。它只能通过新增的、显式鉴权且 revision-fenced 的命令通道提交 proposal/evidence，由 Host Task Graph Service 验证并提交。`packages/core/agent/README.md:170-176`；`packages/subagent/subagent/src/types.ts:145-200,308-328`；`packages/subagent/subagent/src/out-of-process.ts:51-63,237-258`；`packages/subagent/subagent/README.md:168-176`。
10. 技术上推荐“Host 权威命令 + 显式 executor adapter + hook 强制执行”的混合协议。live 事件只补充观测，绝不单独建立 Task 因果；时间邻近、Session lineage 和 workflow membership 只能在已有显式绑定后扩展展示或内部成员关系。

## 证据表

### 公开身份与可持久性

| 身份 | 当前语义 | 持久性与适用结论 | 证据 |
|---|---|---|---|
| `SessionId` | Session 的 branded id；`Agent.id` 复用该 id | 可持久；应作为 Agent、本地子 Agent 和 Session 级 executor 引用的主键 | `packages/core/session/src/types.ts:16-26,91-104`；`packages/core/agent/src/types.ts:12-25` |
| `SessionSeq` | Session 内单调事件位置 | 可持久；适合引用 `turn/start`、`tool/call`、结果或插件事件的精确日志位置，不是跨 Session id | `packages/core/session/src/types.ts:28-40,453-480` |
| `MessageId` | inbox、日志、模型请求间保持的消息身份 | 可持久；适合把 admission 消息绑定到 Attempt | `packages/llm/llm/src/brand.ts:15-24`；`packages/llm/llm/src/message.ts:130-145,175-200` |
| `ToolCallId` | 模型发出的工具调用与结果配对键 | 可持久；`tool/call` 和 `tool/result.message.source.callId` 可重放关联 | `packages/llm/llm/src/brand.ts:27-39`；`packages/core/session/src/types.ts:320-343` |
| `ToolExecutionToken` | registry 为一次执行生成的 `Symbol`；nested call 只携带父 token | 仅进程内；不可序列化，不得进入 Task Graph 事件。持久 nested 关联应使用 `rootCallId`/`parentCallId`/`subCallId` | `packages/core/tools/src/index.ts:297-344,378-390,1869-1872`；`packages/core/tools/src/types.ts:10-23` |
| `LlmAttemptId` | Agent lifecycle 内的 streaming attempt id | 仅 live；最终持久事件只保留 `turn`/`step` 与 stream，不保留该 id | `packages/llm/llm/src/brand.ts:54-63`；`packages/core/agent-loop/src/assistant-stream.ts:23-46,73-108`；`packages/core/session/src/types.ts:305-319` |
| `SubagentRun.id` | one-shot run 的父命名空间 id；本地时等于 child Session id | 本地 run 可用 child `SessionId` 持久引用；远程 run id 本身没有父 Session corpus 中的原生持久记录 | `packages/subagent/subagent/src/types.ts:308-320`；`packages/subagent/subagent-dsh-sdk/src/run.ts:233-238,298-304,351-358` |
| `SubagentRunId` | `subagent/start`/`end` 一对 live lifecycle edge 的 UUID | 当前未持久化；continuable child 的每次 residency epoch 也会重新生成 | `packages/subagent/subagent/src/types.ts:19-29,75-108`；`packages/subagent/subagent/src/lifecycle.ts:134-162,176-186` |
| `WorkflowRunId` | workflow run 的 branded UUID | engine 本身只通过 live handle/event 暴露；顶层 `tool-workflow` 调用会把它写入四类父 Session 事件 | `packages/workflow/workflow/src/types.ts:12-22,89-106`；`packages/workflow/workflow-worker-thread/src/index.ts:143-201`；`packages/workflow/tool-workflow/src/types.ts:13-63` |
| skill name/provider | registry 的稳定寻址名和来源信息 | 没有 invocation/run id；只能以 `MessageId`、`ToolCallId` 或插件自有 ref 作为一次执行的身份 | `packages/skill/skill/src/index.ts:56-94`；`packages/skill/tool-skill/src/index.ts:127-155,196-203` |
| `turn`/`step` | Session 内的 Agent 执行坐标 | 持久但只在一个 Session 内有意义；适合作为 `agent-turn` ref 的组成部分，不能单独当全局 Attempt id | `packages/core/session/src/types.ts:266-286` |

### 持久事实与 live-only 事实

| 能力 | 已持久化事实 | 仅进程内或派生事实 | 对 G13 的影响 |
|---|---|---|---|
| Agent/loop | `agent/inbox/spliced`、`turn/start|end`、`step/start|end`、`user/message`、`assistant/message|attempt`、`request/header|context` | `agent/status`、`agent/pre-step`、`agent/turn-stopping`、`agent/error`、assistant stream frames | Attempt 的 admission 消息和 Agent turn 引用可完整重放；live hook 负责围栏和即时调度，不能替代事件。`packages/core/agent/src/types.ts:80-94`；`packages/core/session/src/types.ts:260-381`；`docs/architecture.md:80-107` |
| 工具 | 顶层 `tool/call`、`tool/result`；PTC nested 的 `tool/code-dispatch-start`、`tool/code-dispatch` | `tools/pre-execute`、`tools/execute`、`tools/post-execute`、`tools/result`；`ToolExecutionToken` | 用 `ToolCallId`/`SessionSeq` 写权威 ref；live token 只用于同进程嵌套跟踪。`packages/core/tools/src/types.ts:10-56`；`packages/core/tools/src/index.ts:134-189,297-390` |
| skill | catalog 与用户显式调用最终都作为带 source 的 `user/message`；模型加载是普通 `skill` tool call/result | `skills/change`、provider lookup/cache | 不存在独立 skill lifecycle；记录 skill name、invocation kind 及其消息/工具 anchor 即可。`packages/skill/tool-skill/src/index.ts:29-47,127-161,177-203`；`packages/skill/skill/src/index.ts:285-299` |
| subagent | Session-backed child 的 header lineage/origin/depth；child 内 `subagent/descriptor` | `subagent/start|end`、`SubagentRunId`、`localAgent`、Activation ownership | 原生事实可证明“谁是父子”和“child 是何种 subagent”，但没有 `TaskId`/`AttemptId`。`packages/core/session/src/types.ts:91-120`；`packages/subagent/subagent/src/descriptor.ts:29-39,50-91`；`packages/subagent/subagent/src/index.ts:136-168` |
| workflow | `tool-workflow/run-start`、`agent-start`、`agent-end`、`run-end`，仅由该顶层 tool recorder 写入父 Session | `workflow/start|phase|log|agent-start|agent-end|end`、live `WorkflowRun` | 已有 durable run/member ledger，但缺 Attempt 和发起 `ToolCallId`；直接调用 engine 时也没有自动持久记录。`packages/workflow/tool-workflow/src/types.ts:13-63`；`packages/workflow/tool-workflow/src/index.ts:68-129,283-325`；`packages/workflow/workflow/src/runtime-types.ts:36-48` |
| projection | 权威输入仍是 Session log；可选 cache 只保存 fold checkpoint | live cells、change feed、Client push frame | Task Graph 可注册一个同步 projection 并折叠自身事件及上述原生事件；projection cache 不是写入权威。`packages/session/session-projection/src/index.ts:40-92,107-137,181-192,654-690`；`packages/session/session-projection/README.md:28-65` |

### 可用 hook 与精确边界

| 目标 | 可用公开点 | 能保证什么 | 不能保证什么 |
|---|---|---|---|
| Claim/Attempt admission fencing | `agent/pre-step` | 读取已 claim 的 `UserMessage[]` 和拟议 `turn`/`step`；校验 Plan/Task/Attempt/Claim revisions；返回 `reject` 可阻止 `step/start`、模型请求和后续工具 | `turn/start` 和 inbox claim 已发生；`agent/session-start` 不是 veto；多个 next-step 消息会与一个 next-turn 消息合批，因此必须检查一批中恰有一个有效 Attempt carrier。`packages/core/agent/src/runtime-types.ts:321-344`；`packages/core/agent-loop/src/inbox.ts:105-115`；`packages/core/agent-loop/src/agent.ts:256-290` |
| 工具 admission | `tools/pre-execute` + `tools.guard()` | 前者可异步校验/拒绝，后者在所有 pre listener 后执行且只能 deny，适合保证受保护工具没有有效 Attempt 就失败 | `pre-execute` listener 自己看不到后续 listener/guard 的最终结论；因此不应把“看到调用”等同于“工具体已获准”。`packages/core/tools/src/index.ts:134-167,709-717,1477-1507` |
| 工具副作用前持久关联 | `tools/execute` wrapper | 只在 pre/approval/guard 全部通过后进入；可在 `next()` 前追加 `attempt→tool` ref 并 `flush()`，失败则不调用工具体 | 若 composition 没有 persistence listener，`flush()` 返回无参与者；协议必须把 persistence/checkpoint 作为部署前提或 fail loud。`packages/core/tools/src/index.ts:1467-1507,1548-1554`；`packages/session/session-checkpoint-policy/src/index.ts:52-75`；`packages/core/session/src/index.ts:1098-1127` |
| 工具结束 | durable `tool/result`；live `tools/result` | `tool/result` 与 `tool/call` 通过 call id 和 `sourceEventSeqs` 配对；Task projection 可据此前显式绑定直接折叠终态 | `tools/result` 发生在 agent-loop 追加 durable `tool/result` 之前，且 observer 不能改变结果；不要把 live 通知当最终持久事实。`packages/core/tools/src/index.ts:1660-1678`；`packages/core/agent-loop/src/tool-calls.ts:267-294` |
| 当前 Agent executor start | `agent/pre-step` | 在进入 step 前追加 `agent-turn` binding，引用 `SessionId`、`turn`、`step`、admission `MessageId`，并可先 flush | 它不能把两个 Session 或两个 append 变成事务；claim+Attempt 必须先在一个插件事件中原子表达。`packages/core/agent-loop/src/agent.ts:236-303`；`packages/core/session/src/index.ts:678-721` |
| 当前 Agent executor end | durable `turn/end`；live `agent/status: idle` | `turn/end` 覆盖 completed、blocked、aborted、error、max-tokens、crash-repaired interrupted；idle 在 driver 退出后通知，可触发对 durable turn 的 reconciliation | `agent/turn-stopping` 只覆盖正常“准备结束”路径，不覆盖所有错误/取消；`whenIdle()` 只表示全 Agent 静止，不标识某条消息的结算；`session/event` 回调处于 append 发布中，不能同步 reentrant append。`packages/core/session/src/types.ts:195-222`；`packages/core/agent/src/runtime-types.ts:199-205`；`packages/core/agent-loop/src/agent.ts:306-334,221-232`；`packages/core/session/src/index.ts:696-725` |
| subagent start/end | adapter 围绕 `ctx.subagents.start()`/`startContinuable()`；可辅以 `subagent/start|end` | `start()` fulfillment 表示 child 已发布；返回 `run.id`，结束可 await `run.result` 并 dispose；continuable 可预留 `childId` | one-shot id 由 provider 生成，无法与父 Session 事件原子提交；live lifecycle `runId` 不是已有 durable key。`packages/subagent/subagent/src/index.ts:541-562`；`packages/subagent/subagent/src/types.ts:31-58,308-333` |
| workflow start/end | adapter 围绕 `ctx.workflowEngine.start()`；可辅以 `workflow/*` 和 `tool-workflow/*` | `start()` 返回 `WorkflowRunId`，`result` 给终态；顶层 tool recorder 提供 durable run/member facts | `workflow/start` payload 没有 parent/ToolCallId；run id 在 `start()` 内生成，调用前不能持久绑定该原生 id。`packages/workflow/workflow/src/runtime-types.ts:14-48`；`packages/workflow/workflow/src/index.ts:31-89`；`packages/workflow/workflow-worker-thread/src/index.ts:143-201` |

## 跨进程 subagent 判定

**不能直接安全写。** 现有跨进程 one-shot contract 只交付 prompt、取消信号和结果；远程 `SubagentRun.localAgent` 明确为 `undefined`，父进程 initiator 也不跨进程。当前公开协议没有携带 Task actor capability、Claim/Attempt revisions、幂等 command id 或父 Task Graph write lease 的字段。`packages/subagent/subagent/src/types.ts:145-200,275-328`；`packages/subagent/subagent/src/out-of-process.ts:51-63,221-258`；`packages/core/agent/src/index.ts:294-335`。

安全扩展只能是插件自有的 Host 命令面：worker 提交 `ProgressProposal`、`EvidenceProposal`、`CompletionProposal` 或 `ReplanProposal`，并携带服务签发的 actor capability、Attempt/Claim ids、expected revisions 和幂等 id；Host Task Graph Service 校验权限与 revisions 后追加事件。若该命令面不可用，远程 child 只能把输出返回父 adapter，由父 adapter 提交，不能把 lineage、run id 或时间邻近当作写权限。

## 协议候选

### 候选 A：Host 权威命令 + 显式 executor adapter + hook 强制执行

**概要。** Task Graph Service 是唯一写者。一次 admission 用一个 required Session event 同时提交 Claim 与 ExecutionAttempt 的完整 post-state，并生成由服务签发、不能由模型参数自行声明的插件自有 `ExecutionTicket`。outer-loop 随后发送一个带 `task-attempt` message source 的独立 `UserMessage`；`agent/pre-step` 重新校验所有 revisions，并把 Attempt 显式绑定到当前 Agent turn。工具通过 `tools.guard()` 强制要求有效 Attempt，通过 `tools/execute` 在工具体前持久化精确 `ToolCallId` 绑定。subagent/workflow 由 task-owned adapters 直接调用公开服务，并在返回 native id 后写绑定；native lifecycle 保持上游所有权。

**新增插件自有类型。** `PlanRunId`、`TaskId`、`ExecutionAttemptId`、`ExecutionClaimId`、`AttemptGroupId`、`EvidenceId`、`OutputRefId`；`ExecutionTicket { planRunId, planRevision, taskId, taskRevision, attemptId, attemptRevision, claimId, actor, executorKind }`；`TaskAttemptMessageSource`；`ExecutorRef` 的 tagged union：`agent-turn(sessionId, turn, step, messageId)`、`tool(sessionId, callId, rootCallId, callSeq)`、`skill(name, provider?, invocation, anchor)`、`subagent(provider, runOrChildId, local, activation?)`、`workflow(runId)`；`ExternalEffectState = none | pending | confirmed | unknown`。

**新增插件自有事件。** `task-graph/attempt-admitted`（Claim + Attempt + revisions + dispatch `MessageId`，单事件原子表达）、`task-graph/executor-dispatch-requested`（在 native id 尚不可知时记录 provisioning nonce）、`task-graph/executor-bound`、`task-graph/executor-observed`、`task-graph/attempt-settled`、`task-graph/completion-proposed`、`task-graph/verification-recorded`。这些权威事件保持 required；每个 state-carrying payload 应携带完整 post-change entity，而不是裸 delta，符合未知 required 事件 fail-closed 和 projection whole-value 规则。`packages/core/session/src/types.ts:461-471`；`packages/session/session-projection/src/index.ts:13-15,40-71`。

**关键次序。** `attempt-admitted append` → task-scoped inbox message → `agent/pre-step` revision fence + `agent-turn` binding → `flush` → enter；每个 protected tool 为 `tools/pre-execute` policy → monotonic guard → `tools/execute` append exact tool binding + `flush` → `next()`。one-shot subagent/workflow 采用 `dispatch-requested` → 调用 `start()` → `executor-bound(nativeId)` → `flush`；绑定失败立即 cancel/dispose，恢复时未配对的 `dispatch-requested` 进入 `unknown`/reconcile，而不是自动重试。

**主要失败模式。**

- Session API 没有多事件或跨 Session 事务；必须让 admission 的 Claim 与 Attempt 同处一个事件，并把 native start 的不可消除窗口建模为 `dispatch-requested`/`unknown`。
- 若原生 subagent/workflow 工具仍可绕过 adapter，Task causality 会缺失；产品必须选择隐藏这些入口、以 guard 拒绝未关联调用，或明确把绕过调用标成非 Plan 工作。
- 同一 Agent 的用户输入和任务输入可能竞争；pre-step 必须拒绝多 Attempt carrier、stale carrier 或不符合当前 claim 的批次，而不能按时间猜测。Task carrier 应使用独立消息，因为一个 `UserMessage` 只能有一个 `MessageSource`。`packages/llm/llm/src/message.ts:127-145`；`packages/core/agent/README.md:170-176`。
- 关联事件持久化成功但下游调用尚未发生时会留下可恢复的 prepared 状态；恢复策略必须区分“未 dispatch”与“外部结果未知”。工具 crash repair 已采用同样区分：未记录启动可重试，已记录启动但无结果必须先核对外部状态。`packages/core/session/src/repair.ts:14-29,91-125`。

### 候选 B：受限的 hook-only ambient correlation

**概要。** 不包装 subagent/workflow 服务；`agent/pre-step` 把当前 `ExecutionTicket` 放入 `WeakMap<Agent, ActiveAttempt>`，`tools/*`、`subagent/*`、`workflow/*` listener 从 ambient state 追加观察事件，`turn/end`/idle 清除。为避免歧义，强制每个 Agent 同时只有一个 active Attempt，并禁止同一 Agent 并行启动多个 subagent/workflow。

**新增插件自有类型/事件。** 与候选 A 相同的 branded ids 和 `ExecutionTicket`；较窄的 `ObservedExecutorRef`；`task-graph/attempt-admitted`、`task-graph/agent-turn-bound`、`task-graph/native-start-observed`、`task-graph/native-end-observed`、`task-graph/attempt-settled`。

**主要失败模式。**

- `workflow/*` 事件不携带 parent，`subagent/start` 也不携带发起 `ToolCallId`；并发时无法无歧义地从 live event 反推 Attempt。`packages/workflow/workflow/src/index.ts:31-89`；`packages/subagent/subagent/src/index.ts:149-168`。
- ambient map、initiator scope、lifecycle run ids 都在重启后消失；崩溃窗口只能留下未绑定的 native 工作。
- subagent tool 明确声明并发安全，多个 delegation 可重叠；为了让 ambient 关联权威而关闭这种并发，会与既定“不削减并发能力”方向冲突。`packages/subagent/tool-subagent/src/index.ts:466-469`。

**适用性。** 可作为 telemetry/display adapter，或作为严格单飞部署的过渡实现；不宜作为一般情况下的权威协议。

### 候选 C：单一 `task_execute` gateway tool

**概要。** 注册一个 task-owned composite tool；所有 Task 副作用、subagent 和 workflow 启动都在其 body 内执行。顶层 `ToolCallId` 是统一 durable root，nested tool 使用现有 `rootCallId`/`parent`，gateway 自己显式记录 subagent/workflow native id。现有执行工具通过 scoped restriction/guard 隐藏或拒绝，避免旁路。

**新增插件自有类型/事件。** 候选 A 的 branded ids；`TaskExecutionRequest` tagged union；`task-graph/attempt-admitted`、`task-graph/gateway-bound`、`task-graph/executor-bound`、`task-graph/attempt-settled`。不持久化 `ToolExecutionToken`，只持久化 root/top-level/sub-call ids。

**主要失败模式。**

- 它把执行策略集中到一个大型工具 schema，增加模型负担，并不能自然表示“当前 Agent 进行纯推理后直接回答”的 Attempt。
- 必须隐藏或拒绝原生执行入口，否则旁路仍存在；nested PTC 只在运行时携带 parent token，持久关联要依赖 `tool/code-dispatch-*` 的 call ids。`packages/core/tools/src/index.ts:333-341,378-390`；`packages/core/tools/src/ptc.ts:469-472,503-521,534-545`。
- subagent/workflow 的 native id 仍在调用内部生成，因此 gateway 仍需候选 A 的 provisioning/unknown 状态。

## 推荐

推荐候选 A 作为 G13 的技术基线，并把候选 B 降级为非权威观测层。它最符合现有 DSH 的职责分工：Session event 是权威事实，projection 是可重建读模型，Agent/tools hook 负责围栏，subagent/workflow adapter 只保存外部引用，不复制其状态机；整个方案不需要修改 `agent-loop`。`docs/architecture.md:113-121,131-156`。

建议 G13 明确以下不可省略的协议条款：

1. **单事件 admission。** Claim 与 Attempt 必须在一个 required event 中共同生效；任何后续输入或 executor 启动只引用该 Attempt。
2. **显式 carrier。** 当前 Agent 使用专有 `MessageSource` + `MessageId`；工具使用 `ToolCallId`/`SessionSeq`；subagent/workflow 使用 adapter 返回的 native id。任何时间邻近匹配只标记为 inferred。
3. **两级提交点。** `Session.append()` 是本进程日志提交；`ctx.sessions.flush()` 成功才是允许模型请求、工具副作用或对外宣称已启动的 crash-durable 点。
4. **启动未知态。** 对无法预留 native id 的 one-shot subagent/workflow，先持久化 provisioning nonce；崩溃或绑定失败后进入 `unknown` 并核对/取消，不自动重复副作用。
5. **终态分离。** native end 只结算 executor observation；Task Graph Service 在验证完成后单独提交 Attempt/Task 状态。`tool/result`、`turn/end`、`subagent/end` 或 `workflow/end` 都不自动等于 Task 完成。
6. **跨进程命令而非直写。** worker 只提交带 actor capability、Attempt/Claim id 和 revision fences 的 progress/evidence/completion proposal；Host Service 校验后写 Session。是否在首版隐藏原生 subagent/workflow 工具，还是允许它们作为“非 Plan 工作”，仍是需要用户决定的产品取舍。
