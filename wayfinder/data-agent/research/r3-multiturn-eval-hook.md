# R3：deepseek-harness-da agent runner 是否暴露多轮脚本化 eval（pass_k）的 response hook

> 研究方法：仅一级源码（harness 源 + reverse-bi rbi-eval 参考）；引用 `path:line`；推断标注 INFERENCE。
> 仓库根：`/Users/mckenzie/workspace/deepseek-harness-da`（下简称 harness）；`/Users/mckenzie/workspace/reverse-bi`（下简称 rbi）。

## 摘要（结论先行）

**能。** harness 的 agent runner 通过两条对外编程接口暴露了「驱动一轮 + 捕获响应」的全部能力，足以支撑多轮脚本化 eval：

1. **JSON-RPC SDK**（`packages/sdk/protocol` + `packages/sdk/server` + `python/sdk`）——主路径。`session/prompt` 请求 → `agent.followup()` 驱动一轮；`session.event` 通知按序流式回放整条 session 事件流（含 `assistant/message` 响应）。Python 层 `DeepSeekHarness`/`Session` 已封装成同步 `Session.run(input) → RunResult(final_response, events)`，开箱即用。
2. **ACP 桥**（`packages/acp/acp`）——备路径。`prompt` 请求同步等待 turn 静默并返回 `stopReason`；`sessionUpdate(agent_message_chunk)` 流式回放已提交的 assistant 文本/图片。

agent 自身的事件层（`agent/pre-step`、`agent/request`、`agent/turn-stopping` 等）是**控制/生命周期 hook**，**不**直接携带响应正文——响应正文落在 session 事件流（`assistant/message`）。INFERENCE：因此 eval 捕获响应应订阅 session 事件，而非 agent 事件。

**缺口**：harness 没有 `packages/eval`，也没有 pass_k/multiturn 编排（`grep pass_k|multiturn` 在 `packages/` 下零命中）。harness 提供了积木（SDK + ACP + session 事件流 + `llm-replay` 确定性回放插件），但没提供 eval 编排（脚本化轮次、pass_k 循环、判分）。

---

## 1. harness agent runner 是否暴露 response hook

### 1.1 Agent 事件层（控制 hook，非响应正文）

`packages/core/agent/lib/types/runtime-types.d.ts:60-230` 定义 `Agent` 接口与 Cordis `Events` 声明。Agent 暴露的驱动方法（`runtime-types.d.ts:139-200`）：

- `send(message, target, wakeup)` —— 路由输入到 inbox 边界（`'next-turn' | 'next-step'`），可选唤醒 driver。
- `followup(message)` —— 排入一轮普通 follow-up turn 并唤醒 driver（**eval 驱动多轮的主入口**）。
- `steer(message)` —— 向最近 step 注入 steering。
- `inject(message)` —— 为下一 step 排入 model-facing 上下文，不唤醒。
- `cancel(cause, options?)`、`whenIdle()`、`runMaintenance(task)`。

Agent-subject 事件（`runtime-types.d.ts:233-440`，通过 `agentEvents()` 融合派发器分发，见 `dispatch.d.ts:44-101`）：

| 事件 | 模式 | 作用 |
|---|---|---|
| `agent/created` `agent/disposed` `agent/status` | emit | 生命周期 |
| `agent/inbox/inserted` `agent/inbox/claimed` `agent/inbox/discarded` | emit | inbox 逐消息通知 |
| `agent/session-start` | emit | session 生命周期开始 |
| `agent/pre-step` | waterfall | 拒绝/改写进入 step 的消息 |
| `agent/request` | waterfall | 改写 frozen call config（provider/model/采样） |
| `agent/request-error` | waterfall | 处理失败的 model 请求（可返回 `{kind:'retry'}`） |
| `agent/turn-stopping` | serial | turn 即将关闭，可 steer 继续 |
| `agent/error` | emit | step/turn 出错 |

**关键**：上述事件里**没有** `agent/response` 或 `agent/message`。`runtime-types.d.ts:9-11` 明确注释：「Durable transcript facts and turn/step boundaries remain `@deepseek-ai/dsh-session` events.」INFERENCE：响应正文（assistant 消息）不在 agent 事件层，而在 session 事件层。

### 1.2 Agent-loop driver 如何产生响应

`packages/core/agent-loop/src/agent.ts`（`ReactLoopAgent`）：

- `step()`（`agent.ts:290-345`）流式消费 `loopCtx.llm.stream(request)`，逐 chunk `session.append('assistant/chunk', { turn, step, chunk })`（`agent.ts:308`），再 `session.append('assistant/message', { turn, step, message, usage? }, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })`（`agent.ts:331-339`）。
- `buildRequest()`（`agent.ts:359-450`）触发 `agent/request` waterfall（`agent.ts:394`）；`preStep()`（`agent.ts:274-293`）触发 `agent/pre-step` waterfall；`turn()`（`agent.ts:232-289`）在收尾触发 `agent/turn-stopping` serial（`agent.ts:280`）；失败触发 `agent/request-error` waterfall（`agent.ts:313`）与 `agent/error` emit（`agent.ts:178`）。

INFERENCE：agent-loop 把响应写入 session 日志（`assistant/message`），agent 事件只负责控制流。所以「response hook」= 订阅 session 事件流。

### 1.3 Session 事件层（响应正文的真源）

`packages/core/session/src/types.ts:264-346` 定义 `SessionEventMap`，其中响应相关事件：

- `'assistant/chunk': { turn, step, chunk: StreamChunk }`（`types.ts:271-273`）——原始流式 token，replay 保真。
- `'assistant/message': { turn, step, message: AssistantMessage, usage?: TokenUsage }`（`types.ts:279-285`）——**组装好的 assistant 消息**，eval 捕获响应的主载荷。
- `'tool/call': { turn, step, callId, name, arguments }`（`types.ts:287-292`）、`'tool/result': { turn, step, message, error?, meta? }`（`types.ts:294-303`）——agentic eval 的工具轨迹。
- `'turn/start'/'turn/end'`（`types.ts:249-263`）、`'step/start'/'step/end'`（`types.ts:265-269`）——轮次/步骤边界。
- `'agent/inbox/spliced'`（在 `packages/core/agent/src/types.ts:19` 通过 declaration merge 加入，列于 `packages/core/session/src/known-event-types.ts:21`）——inbox 变更的持久投影，含 `inserted`/`removedCount`/`outcome`，是「消息已入队」的回执。

### 1.4 对外编程接口（eval 真正用的 response hook）

#### 1.4a JSON-RPC SDK（主路径）

**协议**（`packages/sdk/protocol/lib/types/types.d.ts`）：

请求（`types.d.ts:81-87` `HarnessSdkRequestMap`）：
- `initialize`（`types.d.ts:13-22`）——握手：`{ cwd, provider, model, maxTokens? }`。
- `session/prompt`（`types.d.ts:25-30` `SessionPromptParams`）→ `SessionPromptResult { messageId }`（`types.d.ts:33-36`）——送一轮 user turn。
- `shutdown`。

通知（`types.d.ts:55-62` `HarnessSdkNotificationMap`）：
- `session.event`（`types.d.ts:39-44` `SessionEventNotification`）——`{ sessionId, event: SessionEvent }`，**整条 session 事件流按序流式回放**，含 `assistant/message`、`assistant/chunk`、`tool/call`、`tool/result`、`turn/end`、`agent/inbox/spliced` 等。
- `session.status`（`types.d.ts:47-52`）——`{ sessionId, status: 'idle'|'running' }`，**turn 静默信号**。
- `subagent.started` / `subagent.finished`（`types.d.ts:65-79`）——子 agent 生命周期（`finished` 带 `lastAssistantMessage?`）。

**传输**（`packages/sdk/protocol/lib/types/transport.d.ts`）：newline-delimited JSON-RPC 2.0 over stdio（`JsonRpcLineTransport`，`transport.d.ts:40-120`）。

**服务端**（`packages/sdk/server/src/server.ts` `HarnessSdkJsonRpcServer`）：
- 构造时订阅 cordis 事件并转发（`server.ts:62-95`）：`ctx.on('session/event', (session, event) => transport.notify('session.event', { sessionId, event }))`（`server.ts:63-67`）；`ctx.on('agent/status', ...)` → `session.status`（`server.ts:68-71`）；`ctx.on('session/created', ...)` → `subagent.started`（`server.ts:72-79`）；`ctx.on('subagent/end', ...)` → `subagent.finished`（`server.ts:80-95`）。
- `prompt(params)`（`server.ts:113-127`）：`getOrCreateSession` → `agent.followup(message)` → 返回 `{ messageId }`。**fire-and-forget**：只回执入队，不等 turn 完成。
- `handleRequest`（`server.ts:139-151`）：`initialize`/`session/prompt`/`shutdown` 分发。

**Python SDK**（`python/sdk/src/deepseek_harness/`）：
- `client.py` `HarnessClient`：`session_prompt(session_id, content_blocks, on_notification=..., notification_subscription=...)`（`client.py:135-145`）——发 `session/prompt`；`subscribe_session_notifications(session_id)`（`client.py:175-177`）——持久订阅 session 及其后代 session 的通知；通知按 `method`+`payload` 投递（`client.py:330-360` `_handle_message`）。
- `api.py` `DeepSeekHarness` / `Session`：
  - `Session.run(input, on_notification=)`（`api.py:163-198`）：订阅 → `session_prompt` → 等待 `agent/inbox/spliced` 回执（`api.py:201-211` `_is_inbox_receipt`）→ 收集 `session.event` 事件直到 `session.status`=`idle`（`api.py:183-194`）→ 返回 `RunResult`（`api.py:28-35`）。
  - `RunResult`（`api.py:28-35`）：`final_response`（从最后一个 `assistant/message` 的 text 块拼接，见 `api.py:215-232` `final_response()`）、`finish_reason`（最后一个 `turn/end` 的 `reason.kind`，`api.py:235-251`）、`events`（该 run 区间内所有 session 事件）、`notifications`。

INFERENCE：`Session.run()` 即「同步驱动一轮 + 捕获响应」的完整 response hook。同一 `Session`（稳定 `session_id`）多次调 `run()` 即多轮对话——session 日志是持久状态，对话历史在轮次间累积。

#### 1.4b ACP 桥（备路径）

`packages/acp/acp/src/index.ts`（`dsh-acp`，「Automation-only Agent Client Protocol server over JSON-RPC stdio」）：

- `prompt(params: PromptRequest)`（`index.ts:220-290`）：`admitAcpPrompt` → `agent.followup(message)`（`index.ts:267`），随后 `settleAfterQuiescence`（`index.ts:128-165`）**同步等待** admission + `agent.whenIdle()` + `outputTail` 全部静默，返回 `{ stopReason }`。**同步**：调一次 `prompt` 即完成一轮。
- 响应流：`ctx.on('session/event', ...)`（`index.ts:170-194`）过滤 `event.type === 'assistant/message'`，逐 content block 转 ACP `agent_message_chunk` sessionUpdate（`index.ts:178-187`）。注释（`index.ts:167-170`）：「Emit only committed assistant text/images. Raw chunks, reasoning, tools, plans, titles, and retry markers are presentation or trace data and stay off the automation wire.」
- `cancel`（`index.ts:292-307`）、`newSession`（`index.ts:200-219`）。
- 权限：`ctx.on('approval/request', ...)`（`index.ts:155-167`）→ `conn.requestPermission(...)`，一次性 allow/reject。

INFERENCE：ACP `prompt` 同步返回 + 只流文本，对纯文本 eval 更简单；但**不**在 wire 上暴露 tool 调用/结果，agentic eval（需工具轨迹）受限。

### 1.5 确定性 eval 的回放支持

`packages/test-support/llm-replay/package.json`：`@deepseek-ai/dsh-llm-replay` ——「Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests)」。INFERENCE：可在 eval 中用录制的 session JSONL 回放 LLM 流，做无 key、确定性的 pass_k eval。`packages/test-support/agent-loop-testkit/package.json` 是单测脚手架，非 eval。

---

## 2. rbi-eval 如何做 pass_k 多轮（参照）

### 2.1 MultiTurnSession 状态机（被动）

`libs/rbi-eval/src/rbi_eval/multi_turn/session.py` `MultiTurnSession`：

- 脚本预录于 `case.input.turns`（user/assistant 交替）。驱动协议（`session.py:13-20`）：
  ```
  session = MultiTurnSession(case, session_id, run_id)
  while True:
      user_msg = session.next_input()          # ① 取下一 scripted user turn
      reply = <ask agent>                      # ② 外部驱动
      result = session.submit_response(reply, generated_sql=..., ...)  # ③ 回交判分
      if result.status != "continue": break
  ```
- `next_input()`（`session.py:218-235`）：`pending→running`；逐个吐 scripted user turn，脚本耗尽后吐 terminal `case.input.question`。
- `submit_response(agent_reply, generated_sql?, generated_behavior?, execution_result?)`（`session.py:237-290`）：
  - 非终止轮：`_turn_matches_expectation`（`session.py:91-118`，token/bigram 重叠 ≥0.35）→ match 则 `streak++`、`status='continue'`、附 `next_input`；不 match 则走 `_handle_derailment`（`session.py:331-369`）。
  - 终止轮：`_handle_terminal`（`session.py:292-329`）跑 `score_l1`，`status='completed'`，返回 `verdict`/`streak`/`diagnostic`/`l1`。
- 返回 `SubmitResponseResult`（`session.py:46-62`）：`status`/`next_input`/`verdict`/`streak`/`diagnostic`/`l1`。

### 2.2 AgentResponder（响应 hook 抽象）

`libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py`：

- `AgentTurnRequest`（`multi_turn.py:60-69`）：`{ session_id, case_id, scope_id, turn_index, message }`。
- `AgentTurnReply`（`multi_turn.py:75-83`）：`{ reply, generated_sql?, generated_behavior? }`。
- `AgentResponder = Callable[[AgentTurnRequest], AgentTurnReply]`（`multi_turn.py:90-92`）——注释：「The injected 'ask the agent' step — the whole reason a driver exists.」**这是 rbi-eval 的 response hook 抽象**。
- `drive_session(case, run_id, responder, attempt?, execute_sql?, semantic_contract?)`（`multi_turn.py:299-360`）：owns the loop——`next_input()` → `responder(AgentTurnRequest(...))` → `submit_turn(...)` → 收到非 `continue` 即结束；agent 异常 → `MultiTurnAttempt(error=...)`（不中断 batch）。
- `run_multi_turn_case(case, run_id, responder, pass_k=DEFAULT_PASS_K, ...)`（`multi_turn.py:413-459`）：`DEFAULT_PASS_K = 3`（`multi_turn.py:46`）。循环 `pass_k` 次 `drive_session`；`passed = all(a.error is None and a.verdict == "pass" for a in attempts)`（`multi_turn.py:445`）。`pass_k_verdict`（`multi_turn.py:363-378`）：失败时取**第一个非 pass** attempt 的 verdict（非最后一个，防 flakiness 被掩盖）。
- SPEC §6.5（`multi_turn.py:48-50` 注释）：「a multi-turn case is run *k* times and must pass **every** time (pass^k)」。

### 2.3 build_agent_responder（适配器）

`libs/rbi-eval/src/rbi_eval/adapters/agent.py`：

- `build_agent_responder(pipeline, base_system_prompt="")`（`agent.py:80-107`）返回 `AgentResponder`。每次调用 = 一轮；每轮新建 `TurnContext`（`agent.py:88`）作 per-turn 事件缓冲。
- `extract_reply(ctx)`（`agent.py:33-62`）：遍历 `ctx.event_buffer`，收集 `TEXT` 事件（`_REPLY_EVENT_TYPES=(TEXT,)`，`agent.py:22`）的 `text`/`content`/`message` 字段，拼成 `reply`；顺带捞 `sql`/`generated_sql`。空回复不抛异常（让 session 判 derail）。
- 关键设计（`agent.py:94-97`）：「Takes a pipeline; does not build one」——rbi-eval 不能自建 agent（D9 R4 import-linter：评测器不得依赖被评测流水线），由调用方注入已建好的 pipeline。

INFERENCE：rbi-eval 的模式是「注入式 AgentResponder」——eval 编排层只定义 `AgentTurnRequest→AgentTurnReply` 的契约，agent 具体实现由外部注入。

---

## 3. harness eval harness 能否驱动多轮脚本对话 + 捕获响应？走哪条路？

**能。** 推荐走 **Python JSON-RPC SDK**（`DeepSeekHarness`/`Session`），因其已封装为同步「驱动一轮 + 捕获响应」：

| 能力 | JSON-RPC SDK（`api.py` `Session.run`） | ACP 桥（`acp/src/index.ts` `prompt`） |
|---|---|---|
| 驱动一轮 | `Session.run(input)` → `session_prompt` → `agent.followup()` | `prompt` → `agent.followup()` |
| 同步等 turn 完成 | 是（等 `session.status=idle`，`api.py:188-194`） | 是（`settleAfterQuiescence` 等 `whenIdle`+`outputTail`，`index.ts:128-165`） |
| 捕获响应正文 | `RunResult.final_response`（从 `assistant/message` 提取，`api.py:215-232`） | `sessionUpdate(agent_message_chunk)` 流式文本（`index.ts:178-187`） |
| 全轨迹（tool/result/chunk） | `RunResult.events`（含 `tool/call`/`tool/result`/`assistant/chunk`/`turn/end`） | **否**（只 committed text/image） |
| 多轮 | 同一 `Session` 多次 `run()`（session 日志持久，历史累积） | 同一 session 多次 `prompt` |
| 权限 | 不经 wire（需 server 侧配置） | `requestPermission` 一次性 allow/reject（`index.ts:155-167`） |

INFERENCE：纯文本 eval 可走 ACP（`prompt` 同步、简单）；agentic eval（需 tool 轨迹）应走 JSON-RPC SDK（`events` 全量）。两者底层都经 `agent.followup()` 驱动、`session/event` cordis 事件捕获。

**多轮 + pass_k 实现草图**（仿 rbi-eval，走 JSON-RPC SDK）：
```python
from deepseek_harness import DeepSeekHarness, DeepSeekHarnessConfig

def make_responder(harness: DeepSeekHarness, session_id: str):
    session = harness.start_session(session_id)
    def respond(request: AgentTurnRequest) -> AgentTurnReply:
        result = session.run(request.message)
        return AgentTurnReply(reply=result.final_response, ...)
    return respond

# pass_k：k 个独立 session（或 k 次全新 session）跑同一脚本
def run_case_pass_k(case, harness, pass_k=3):
    attempts = []
    for k in range(1, pass_k+1):
        sid = f"{run_id}:{case.case_id}:{k}"  # 仿 rbi _session_id
        responder = make_responder(harness, sid)
        attempts.append(drive_script(case, responder))  # 仿 drive_session
    passed = all(a.verdict == "pass" for a in attempts)
    return passed, attempts
```
INFERENCE：harness 的 `Session.run()` 对应 rbi-eval 的 `AgentResponder`——都是「给一条 user message，拿回 agent reply」。把 `Session.run` 包成 `AgentResponder` 即可直接复用 rbi-eval 的 `MultiTurnSession`/`drive_session`/`run_multi_turn_case` 编排。

---

## 4. 缺口 + 推荐路径

### 缺口

1. **无 eval 包**：harness 无 `packages/eval`（package.json 列表确认）；`grep pass_k|pass@k|pass_at_k|multi.turn|multiturn` 在 `packages/` 下零命中。harness 只提供积木，不提供 eval 编排。
2. **agent 事件层无响应正文 hook**：`agent/*` 事件是控制流（pre-step/request/turn-stopping），响应正文在 session 事件（`assistant/message`）。eval 若误订阅 agent 事件将拿不到响应文本。INFERENCE：这是设计意图（`runtime-types.d.ts:9-11` 注释），非缺陷。
3. **`session/prompt` 是 fire-and-forget**：JSON-RPC SDK 的 `session/prompt` 只回执 `messageId`，不等 turn 完成（`server.ts:120-126`）。eval 必须自己等 `session.status=idle`（Python `Session.run` 已封装此逻辑，`api.py:188-194`）。ACP 的 `prompt` 则同步等待——差异需注意。
4. **无内置脚本化/判分**：harness 不提供 rbi-eval 的 `MultiTurnSession`（scripted turns）、`score_l1`、`pass_k_verdict`、judge 编排。

### 推荐路径

**主**：基于 Python JSON-RPC SDK（`DeepSeekHarness`/`Session`）搭建 eval harness，复用 rbi-eval 的 `AgentResponder` 抽象与 `MultiTurnSession`/`run_multi_turn_case` 编排：

1. **响应 hook** = `Session.run(input) → RunResult`（`final_response` 为响应正文，`events` 为全轨迹）。
2. **AgentResponder 适配**：`respond(req) = AgentTurnReply(reply=session.run(req.message).final_response)`。
3. **多轮**：同一 `Session` 多次 `run()`（session 日志持久，历史累积，等价 rbi 的 pipeline session 亲和）。
4. **pass_k**：k 个独立 `Session`（`session_id = f"{run_id}:{case_id}:{k}"`）跑同一脚本，`passed = all(attempts pass)`。
5. **确定性 eval**：挂 `@deepseek-ai/dsh-llm-replay` 插件，用录制 JSONL 回放 LLM 流（无 key、可复现）。
6. **agentic 判分**：用 `RunResult.events` 里的 `tool/call`+`tool/result` 做 tool-use 轨迹断言（ACP 路拿不到这些）。

**备**：纯文本 eval 可走 ACP 桥（`prompt` 同步返回 `stopReason`，`agent_message_chunk` 流式文本），实现更简但无 tool 轨迹。

**不推荐**：直接订阅 agent 事件层（`agent/*`）——响应正文不在那里；需经 session 事件流（`session.event` 通知 / cordis `session/event` 事件）。

---

## 关键文件索引

### harness agent runner
- `packages/core/agent/lib/types/runtime-types.d.ts:60-440` —— `Agent` 接口 + Events（agent/pre-step, agent/request, agent/request-error, agent/turn-stopping, agent/error, agent/inbox/*, agent/status）
- `packages/core/agent/lib/types/dispatch.d.ts:44-101` —— `AgentEventDispatch`（emit/serial/waterfall）、`agentEvents()`、`emitAgentEvent()`
- `packages/core/agent-loop/src/agent.ts:290-345` —— `step()`：`assistant/chunk`+`assistant/message` append
- `packages/core/agent-loop/src/agent.ts:274-293` —— `preStep()` 触发 `agent/pre-step`
- `packages/core/agent-loop/src/agent.ts:359-450` —— `buildRequest()` 触发 `agent/request`
- `packages/core/session/src/types.ts:264-346` —— `SessionEventMap`（`assistant/message`, `assistant/chunk`, `tool/call`, `tool/result`, `turn/*`, `step/*`）

### JSON-RPC SDK（主路径）
- `packages/sdk/protocol/lib/types/types.d.ts:13-87` —— `InitializeParams`/`SessionPromptParams`/`HarnessSdkRequestMap`/`HarnessSdkNotificationMap`（`session.event`, `session.status`）
- `packages/sdk/protocol/lib/types/transport.d.ts:40-120` —— `JsonRpcLineTransport`/`JsonRpcTransportPeer`
- `packages/sdk/server/src/server.ts:62-95` —— cordis 事件 → JSON-RPC 通知转发
- `packages/sdk/server/src/server.ts:113-127` —— `prompt()` → `agent.followup()`
- `python/sdk/src/deepseek_harness/client.py:135-177` —— `session_prompt()`/`subscribe_session_notifications()`
- `python/sdk/src/deepseek_harness/api.py:163-232` —— `Session.run()` → `RunResult(final_response, events)`；`final_response()` 从 `assistant/message` 提取
- `python/sdk/src/deepseek_harness/api.py:201-211` —— `_is_inbox_receipt` 等 `agent/inbox/spliced` 回执

### ACP 桥（备路径）
- `packages/acp/acp/src/index.ts:170-194` —— `session/event` 过滤 `assistant/message` → `agent_message_chunk`
- `packages/acp/acp/src/index.ts:220-290` —— `prompt()` → `agent.followup()` + 同步等静默
- `packages/acp/acp/src/index.ts:128-165` —— `settleAfterQuiescence`（admission + `whenIdle` + `outputTail`）

### 确定性回放
- `packages/test-support/llm-replay/package.json` —— `@deepseek-ai/dsh-llm-replay`（录制 JSONL 回放 LLM 流）

### rbi-eval pass_k 参考
- `libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:46` —— `DEFAULT_PASS_K = 3`
- `libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:60-92` —— `AgentTurnRequest`/`AgentTurnReply`/`AgentResponder`
- `libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:299-360` —— `drive_session()`
- `libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:413-459` —— `run_multi_turn_case(pass_k)`
- `libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:363-378` —— `pass_k_verdict()`
- `libs/rbi-eval/src/rbi_eval/multi_turn/session.py:13-20` —— `MultiTurnSession` 驱动协议
- `libs/rbi-eval/src/rbi_eval/multi_turn/session.py:218-290` —— `next_input()`/`submit_response()`
- `libs/rbi-eval/src/rbi_eval/adapters/agent.py:33-107` —— `build_agent_responder()`/`extract_reply()`
