# deepseek-harness-da 的 agent loop 与 preset/组合模型（中文 cited 解释）

> 面向 wayfinder：reverse-bi 四阶段 data_agent 管线如何映射到 harness 循环。
> 全部基于一手源码 + 官方 docs。`INFERENCE` 标注的是推断。
> 引用形式：`path` + 符号/小节（read_file 未带行号，故按符号/标题定位；均为绝对路径下的文件）。

## 0. TL;DR（关键结论）

- **preset 是「agent 平面」的组合**：一个目录里放一份 `agent.cordis.yml`，由 agent factory 的 `setup(agentCtx)` 把它作为 Cordis `include` 子树挂到该 agent 的 scope 上下文之下。它与 **bundle/profile（host 平面）** 是两个层面：bundle/profile 决定进程级注册表与设施，preset 决定单个 agent 向那些注册表贡献什么（工具、persona、提示词段、压缩策略）。
- **agent-loop 是 harness 中唯一含具体循环逻辑的包**；其余都是抽象服务 + 扩展点插件。官方明确：「新行为应放入插件，而不是这里」——这意味着 reverse-bi 的四阶段逻辑应作为 preset + 插件实现，**不应自定义 agent-loop**。
- **Q7 答案**：harness **原生不支持 per-phase / per-turn 工具白名单**。原生有的是 **per-agent** 工具门控（`ctx.tools.restrict()` 允许/拒绝掩码、`ctx.tools.guard()` 单调拥有方策略、经 `agent.ctx` 的作用域内注册、`ctx.tools.presentAs()` 呈现遮蔽）。而且 harness 有意让工具目录在 mode/phase 间保持稳定以保 KV cache（见 `standard` preset 里 plan-mode 的注释）。要做 per-phase 硬门控，**必须**在 `tools/pre-execute`（可重排 deny 门）或 `ctx.tools.guard()`（单调、下游不可翻案）上加 phase-gate hook。最干净的方式是 `guard()`。

---

## 1. preset 到底是什么？（Q1）

### 1.1 定义

**agent preset = 一个目录，里面放一份 `agent.cordis.yml`。** 把它挂到某个 agent 的 scope 上下文下，该会话就获得自己的工具与提示词段，其他在运行的会话各自保持不变，一个进程可同时跑多个组装方式不同的 agent（`packages/preset/README.zh.md`）。

> 「**agent preset** 是一个目录，其中放置一份 `agent.cordis.yml`。把它挂载到某个 agent 的 scope 上下文之下，该会话就获得自己的工具与提示词段落，而其他在运行的会话各自保持不变」——`packages/preset/README.zh.md`

### 1.2 一份真实 preset 长什么样

以 shipped 的 `standard` preset 为例（`apps/cli/config/agent-presets/standard/agent.cordis.yml`）。它是一组 Cordis 行（`- id: ..., name: ..., config: ...`），可分组成 `cordis:group` + `isolate` realm：

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'

- id: planning           # ← cordis:group + isolate realm
  name: cordis:group
  group: true
  isolate:
    planMode: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
          You are in plan mode. Stay in plan mode until exit_plan_mode succeeds ...

- id: compaction          # ← 另一个 isolate realm
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```

关键规则（`standard/agent.cordis.yml` 头部注释）：

- 此文件是 **AGENT-PLANE composition**。host 组合（`base.cordis.yml` + `web.cordis.yml`）保留 preset 不得拥有的东西：注册表本身、sandbox/approval 栈、持久化、model route。
- **service 行必须放在带 `isolate` realm 的 group 内**；否则会发布到 root realm（进程级全局），第二个会话挂载同名 service 即碰撞，挂载时即被 `dsh-agent-presets` 拒绝。
- `isolate: <label>: true` = **entry-local realm**（此挂载的私有实例，不与其他 preset 共享）。注意：共享 label **不会**池化实例——同一 realm symbol 下第二次 `provide()` 会抛错；label 连接的是 REALMS，不是实例池。
- `persona` 只是一行（`dsh-persona`，模板文本，`{{model}}`/`{{cwd}}` 由循环注册的变量解析）。
- model routing **不在 preset 内**：`installAgentLlmTarget` 才是 provider/model/reasoning effort 的 per-agent seam（`.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.md`）。

`isolate` realm 的最小例子见 `packages/preset/agent-presets/tests/fixtures/user/isolated/agent.cordis.yml`：

```yaml
- id: svc
  name: ../../plugins/global-service.js
  isolate:
    fixtureIsolatedSvc: true
  config:
    service: fixtureIsolatedSvc
    label: ISOLATED
```

### 1.3 preset 与 bundle/profile 的区别（核心）

来自 `.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.md` 的「组合分两平面」表：

| 平面 | 实例数 | 内容 |
|---|---|---|
| **Host** | 一个（进程级） | 注册表本身（`tools`、`systemPrompt`、`agents`、`agent-loop`、`sessions`）、跨会话设施（持久化、query、projections、storage、settings、credentials、telemetry）、subagent 提供方、web host |
| **Agent** | 每会话一个 | 单个 agent 向那些注册表贡献什么：工具插件、persona 与提示词段、压缩策略 |

- **profile** = Harness home 里的具名组装，列出自己叠放的 bundle，存放树外插件，保存用户的 `cordis.patch.yml`。`web` / `headless` 作为模板随发行版交付（`docs/architecture.zh.md`「Profile 与组合包」）。
- **bundle** = Cordis 配置项 + 挂载代码的分发格式；`dsh-base` 是每个 profile 的第一层（模型适配器、工具、持久化、沙箱/审批、settings、凭据、遥测）；`dsh-web-app`/`dsh-headless` 增加上层（同上）。
- 叠加顺序：profile 列出的 bundle 顺序 → profile 的 `cordis.patch.yml` → home 级 patch → 任意 `--patch` overlay（`docs/architecture.zh.md`）。
- **`agent-spine-demo`（`packages/examples/agent-spine-demo/src/index.ts`）是一个 BUNDLE**（host 平面）：它 `ctx.plugin(Timer / LlmRuntime / SessionStore / SystemPrompt / ToolRuntime / SkillRegistry / AgentRegistry / llmRetry / GoalService / LocalJobRegistry / InvariantRegistry / toolBash / workspaceContext / toolSkill / toolJobs / AgentLoop ...)`，把「公共脊柱」一次性挂好，deployment 仍自选 LLM adapter / bash executor / presentation。它是 profile 叠放的 bundle，**不是** preset。
- **preset** = agent 平面，挂在 agent scope 下，随该 agent 卸载而撤销；不改任何注册表的 tier，不碰运行中的会话（`.agents/notes/.../2026-08-03-per-session-agent-presets.md`「Decision」）。

一句话：**bundle/profile 组装「进程是什么」，preset 组装「这个会话的 agent 是什么」。**

### 1.4 preset 如何被每会话激活/选择（Q1 尾 + Q5 详见）

- 挂载的唯一受支持调用点是 **agent factory 的 `setup(agentCtx)`**（`packages/preset/agent-presets/src/index.ts`，`AgentPresets.mount(agentCtx, id?)`；`.agents/notes/.../2026-08-03-...md`「setup is the one supported call site」）。在这里 `setup` 调 `ctx.agentPresets.mount(agentCtx, id)`，agent 的 scope key 被 `bindScopeParent` 指向该 preset 的 standing scope，于是该 mount 的注册与监听覆盖此 agent。
- 失败即回滚：`setup` 在发布前运行，被拒的挂载让 `ctx.agents.create()` 失败且不留残留（`.agents/notes/.../2026-08-03-...md`「Failure rolls the agent back」）。

---

## 2. harness 的 agent-loop 如何执行一个用户问答 turn（端到端）（Q2）

### 2.1 角色与边界

- `dsh-agent-loop`（`packages/core/agent-loop/README.zh.md`）是「agent 的唯一具体实现插件和循环驱动器」，实现 `Agent` 接口，驱动 session/turn/step 生命周期。「这是 harness 中唯一包含具体循环逻辑的包。其他所有内容要么是抽象服务，要么是针对扩展点的插件：新行为应放入插件，而不是这里。」
- 具体驱动器是包内部的 `ReactLoopAgent`（`packages/core/agent-loop/src/agent.ts`，`class ReactLoopAgent implements Agent`）；包根不导出 `./src/*`。
- 注入 5 个服务：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`（`packages/core/agent-loop/README.zh.md`「注入的服务」）。

### 2.2 事件 seam 总览

来自 `docs/architecture.zh.md`「轮次流程」+ `docs/agent-lifecycle.zh.md` 时序图：

```
turn/start
  claim next-step input + one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step            reject | enter(messages)      [waterfall]
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message   [agent/request, llm/stream: waterfall]
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*  [前三个: waterfall]
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping                                        [serial, 无 next()]
turn/end
```

- `turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*` 是**持久会话事件**（回放用）；`agent/*`、`tools/*`、`llm/*`、`system-prompt/*` 是**实时扩展点**。
- **waterfall**（监听器必须调 `next()` 委托，可短路）：`agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`system-prompt/assemble`。
- **serial**（按序、无 `next()`）：`agent/turn-stopping`（终止检查点）。
- `tools/result` 是**仅观测**的同步通知（非 waterfall）；注意同名区分：`tools/result` 是实时事件，`tool/result` 是 agent loop 随后追加的**持久**会话事件（`packages/core/tools/README.zh.md`「实时事件」）。
- Cordis 分发模式表见 `docs/cordis-primer.zh.md`「分发模式」：`emit`（观察）、`waterfall`（包装、有返回值）、`parallel`（并行 await）、`serial`（按序 await、有返回值）。

### 2.3 一个用户问答 turn 的端到端走查（具体代码路径）

源码：`packages/core/agent-loop/src/agent.ts`（`ReactLoopAgent`）+ `packages/core/agent-loop/src/tool-calls.ts`（`executeToolCalls`）。

1. **用户提问** → `agent.followup(content)`（`agent.ts`，`followup`）。统一的 `send(message, target, wakeup)` 原语按 `(target × wakeup)` 路由：`followup` → `next-turn` FIFO + 唤醒；`steer` → `next-step` inbox + 唤醒；`inject` → `next-step` inbox 不唤醒（`packages/core/agent-loop/README.zh.md`「统一的 send() 原语」）。每次 inbox 变更先发规范化的 `agent/inbox/spliced`，再发 `agent/inbox/inserted { message }`。
2. **唤醒驱动器** → `wakeDriver()`（`agent.ts`）。若 idle，置 `running` phase（`turn` = lastTurn+1, `step` = 0），在 `ctx.agents.withInitiator(this, ...)` 内调 `kick()`。发 `agent/status` running。
3. **`kick()`**：`while (await this.turn()) {}`——循环 turn，直到无待处理工作（`agent.ts`，`kick`）。
4. **`turn()`**（`agent.ts`，`turn`）：
   - `session.append('turn/start', { turn })`。
   - 进入 step 循环，`target` 初值为 `'next-turn'`：
     - `preStep(target, {turn, step})`（`agent.ts`，`preStep`）：
       - `claimed = this.inbox.claim(target, position.turn)`——在 turn 边界**原子领取**「待处理 next-step 输入 + 一条排队提示词」；步之间只领取 next-step 输入。领取 = 仅删除的 splice，每条消息发一次 `agent/inbox/claimed { message, turn }`。
       - `assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))`——组装系统提示词与工具 schema（见 §2.4）。
       - `decision = await this.dispatch.waterfall('agent/pre-step', { messages: claimed, ...position, signal }, default = { kind:'enter', messages: claimed + runtimeContext })`——**`agent/pre-step` 决定模型看到什么**：监听器可改写已领取消息，也可直接 `reject`。
       - 返回 `{kind:'reject'}` 或 `{...decision, assembly}`（`enter` 带 messages + assembly）。
     - 若 `reject` → `turnEnds = {kind:'blocked'}`，return false（关闭不含步骤的持久轮次，日志仍记录此次尝试）。
     - 若 `enter` 但 `messages.length === 0` 且是首步 → `turnEnds = {kind:'completed'}`，return false（领取被拒/改写为空仍拥有 turn 边界但不花模型调用）。
     - `session.append('step/start', { turn, step })`。
     - 对每条 message：`session.append('user/message', message, { surfaceOp:'append' })`。
     - `stepEnd = await this.step(decision.assembly)`。
     - finally：`session.append('step/end', { turn, step })`。
     - 若 `turnEnds && inbox.nextStep.length === 0`：`await this.dispatch.serial('agent/turn-stopping', { turn, signal })`——**serial 终止检查点**，没有 `next()`，是限制失控轮次/做轮次预算的唯一原生处。
     - 若仍有 next-step 输入：`target = 'next-step'`，继续下一 step；否则 break。
   - finally：`session.append('turn/end', { turn, reason: turnEnds })`。
   - 若 `!inbox.hasPending` → return false（结束 kick）；否则重置 `abort`/`step` 进入下一个 turn。
5. **`step(assembly)`**（`agent.ts`，`step`）：
   - `system = renderPrompt(assembly)`（插值 `{{variable}}`，删除空段）。
   - 循环：
     - `buildRequest(turn, step, assembly.tools, system, session.deriveMessages(), signal)`（`agent.ts`，`buildRequest`）：
       - 构造 `seedConfig`（route = `{provider, model}`，含 `reasoningEffort`/`maxTokens`，按 adapter-defaults 标记规则折叠）。
       - `proposedConfig = await this.dispatch.waterfall('agent/request', { turn, step, signal }, () => seedConfig)`——**`agent/request` waterfall 可补齐/改写 provider/model**；无 provider/model 则抛错提示用 `agent/request` waterfall 补齐。
       - `preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal)`——校验适配器字段、填推理强度/输出 token 默认；保留同一适配器注册（防 HMR 串台）。
       - 构造 `canonicalHeader`，必要时 `session.append('request/header', { header, reason })`；`session.append('request/context', ...)` 若 provider/model/contextWindow 变。
       - 返回冻结的 `request = { ...header.config, messages, system, tools, sessionId, signal }`。
     - 流式：`stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)`。
     - `for await chunk of stream`：`session.append('assistant/chunk', { turn, step, chunk })`，`assembler.push(chunk)`。
     - `finish = assembler.finish`：
       - 若 `error`/`aborted`：`waterfall('agent/request-error', { turn, step, provider, failure, retryPolicy, signal }, () => undefined)`——返回 `{kind:'retry'}` 则重试，否则 `throw new LlmError(...)`。（`dsh-compaction-basic` 在 `agent/pre-step` 处理压力；`agent/request-error` 用于规范上下文溢出——见 `docs/agent-lifecycle.zh.md` 末段。`dsh-llm-retry` 在此监听器上记录并等待退避后返回重试动作。）
       - 否则：构造 `message = createAssistantMessage({ content: assembler.blocks(), source: { provider, model, ... } })`，`session.append('assistant/message', { turn, step, message, usage? }, { surfaceOp:'append', sourceEventSeqs: chunkSeqs })`——每次成功 provider 调用恰好追加一个 `assistant/message` 锚点（空内容也记，保留 usage）。
       - 若 `finish.kind === 'max-tokens'` → return `{kind:'max-tokens'}`（sticky：后续 completed 不降级）。
       - `toolCalls = message.content.filter(b => b.type === 'tool-call')`；`if (toolCalls.length === 0) return {kind:'completed'}`。
       - `{ concluded } = await executeToolCalls(this.loopCtx, turn, step, toolCalls, signal, ctx => this.inbox.splice('next-step', ..., [ctx]))`——见 §2.5。
       - return `concluded ? {kind:'completed'} : null`（`null` 表示工具欠下另一个请求，循环继续下一步）。

### 2.4 系统提示词组装（`system-prompt`）

源：`packages/core/system-prompt/README.zh.md`。每步组装一次。

- `ctx.systemPrompt.assemble(context)`：合并全局层与 `context.scope` 的层，在变换 waterfall 前分离工具 schema；经按作用域筛选的 `system-prompt/assemble` waterfall；有效 `complete` 段成为唯一提示词段。返回 `PromptAssembly { sections, tools, variables }`。
- 段 API：`section()`（`order` 升序；`-100` harness 身份，`0` 部署 persona，`100–199` 工具引导；`agent.ctx` 只为该 agent 贡献并遮蔽同名全局段；`complete:true` 段抑制其他所有段）、`context()`（有序动态上下文，运行时成为带来源的 user 快照）、`tools(provider)`（贡献工具 schema，每次组装求值；`ToolRuntime` 自动把自身注册为提供方）、`variable()`（`{{name}}`；agent-loop 注册 `model` 与 `cwd`）。
- `renderPrompt(assembly)`：插值 `{{variable}}`，严格校验（未知引用/无值/格式错误都抛）。
- 「模型可见即已记录」不变量：抵模型的一切都必须能从会话日志重建（`docs/architecture.zh.md`「会话日志」）。新增模型可见输入需扩展 `SessionEventMap` 并从日志渲染。

### 2.5 工具执行流水线（`tools` + `tool-calls.ts`）

源：`packages/core/tools/README.zh.md` + `packages/core/agent-loop/src/tool-calls.ts`（`executeToolCalls` / `runGroup`）+ `docs/tool-execution-pipeline.zh.md`。

`executeToolCalls`（`tool-calls.ts`）调度一步的 tool calls：独占调用形成屏障；`parallel` 调用进有界滚动池（`maxParallelToolCalls`，默认 10），启动前重新分类。只有分发/主体重叠；策略、持久结果、结果上下文保持模型顺序。

注册表（`ctx.tools`，即 `TOOL_RUNTIME_SCHEDULER`）跑完整流水线，对每个调用：

1. `session.append('tool/call', { turn, step, callId, name, arguments })`——**调用前**先记日志（`tool-calls.ts`，`appendToolCall`）。
2. `ctx.tools.prepare(exec)` → `dispatch` | `post-result` | `final-result`。
3. 内部依次：
   - **`tools/pre-execute` waterfall**：可重排的允许/拒绝/询问门禁。`PreToolDecision = {kind:'allow'} | {kind:'deny', reason} | {kind:'ask', reason?}`。`ask` 在挂载 `ctx.approval` 时由它处理，否则退化为拒绝。**有意不允许改写 `exec.arguments`**（见「已知限制」）。
   - **已注册的单调守卫**（`ctx.tools.guard()`）：`(execution) => string | undefined`，返回理由即**最终**拒绝，返回 `undefined` 保持原决定。在 pre-execute 之后、分发之前求值；**后续 waterfall 监听器无法把守卫的拒绝翻成允许**。
   - `ctx.approval` 询问（单调守卫之前；不可用则降级为拒绝）。
   - **`tools/execute` waterfall**：环绕分发包装层，供超时/重试/指标插件用；包装层只能替换 `signal`。
   - 工具主体 `execute(args, exec)`；`tool-fs` 变更经 `fs/write-intent`/`fs/edit-intent` 事件守卫。
   - **`tools/post-execute` waterfall**：`PostToolDecision`——accept 可替换 `content` 或 `value`（二选一）+ 附加 `additionalContexts`；block 把反馈变成无值失败。
   - 注册表外层规范化（结果快照 throw → `isError`）。
   - **`finalizeContent(exec, result)`**（工具定义持有）：对每个规范化结果恰好运行一次，只能替换 `content`，同步、对所有输入有定义。
   - **`tools/result`**：同步、仅观测、不可变最终结果通知。
4. `session.append('tool/result', { turn, step, message, error?, meta? }, { surfaceOp:'append', sourceEventSeqs:[callSeq] })`——持久会话事件，单一面向模型的结果（`tool-calls.ts`，`appendToolResult`）。
5. `result.additionalContexts` 按 FIFO 经 `acceptContext` 回调 splice 进 `next-step` inbox（在该步工具结果之后、作为带来源 `user/message` 注入）。

`ToolExecutionResult`：成功 `{ isError:false, value, content, meta?, additionalContexts? }`；失败 `{ isError:true, error:{message, info?}, content, meta?, additionalContexts? }`；可带 `concludesTurn`（结论性结果）。取消：调用前取消 = `ABORTED_BEFORE_DISPATCH`；主体调用后取消只能把成功替换为 `ABORTED`（`packages/core/tools/README.zh.md`「取消」+ `tool-calls.ts`，`appendSkippedToolCall`）。

---

## 3. 工具如何按 turn 或按 phase 门控/选择？（Q3）

### 3.1 原生的 per-AGENT 工具门控（全部「per-agent、在 scope 建立时设置一次」）

来自 `packages/core/tools/README.zh.md`「公开 API」：

- **`ctx.tools.register(definition)`**：层由调用上下文的作用域决定。**普通插件上下文 = 全局注册；`agent.ctx` = 只为该 agent 注册，并遮蔽同名全局工具**。随调用 fiber dispose。
- **`ctx.tools.restrict(filter)`**：对全局工具应用 **agent 作用域的允许/拒绝掩码**；从普通上下文调用会抛。筛选器在注册时创建快照；多个掩码取交集，再合并作用域本地工具。**拒绝掩码接纳后来出现且未点名的全局工具；允许掩码排除后来出现的名称。** 明确声明：「**这是实时可见性组合，不是权限边界**」。
- **`ctx.tools.guard(guard: ToolGuard)`**：在 `tools/pre-execute` 之后注册**单调同步执行守卫**；返回理由拒绝调用，返回 `undefined` 保持原决定。普通上下文守卫全局生效；**`agent.ctx` 守卫只对该 agent 生效。后续 waterfall 监听器无法将守卫的拒绝重新变为允许。** 随调用 fiber dispose。← 这是硬门控的拥有方原语。
- **`ctx.tools.presentAs(mode)`**：为本 agent 选择面向模型的呈现方式（native/code/both），仅对该 agent 遮蔽 `mode` 配置；从普通上下文调用会抛。工具目录（`schemas(agent)`）不变，只有组装结果中的工具列表按呈现方式收束。
- **`ctx.tools.executionMode(exec)`**：返回 `parallel` 当且仅当可见定义的 `isConcurrencySafe(args)` 恰为 `true`；其余皆独占。**「并发策略不是事件门禁」**——直接读已解析定义，插件只能在自身拥有的定义上声明分类器。
- **`system-prompt/assemble` waterfall** 可替换注册表贡献的工具 schema（权威组装）；`ctx.systemPrompt.tools()` 提供方可收束可见集合。

### 3.2 是否有原生 per-phase 或 per-turn 工具白名单？

**没有。** 证据：

1. 上述 API 全是 **per-agent**（注册时/作用域建立时设定一次，会话内稳定）。没有「set tool whitelist for this turn only / for phase X」的 API。
2. `packages/core/tools/README.zh.md`「已知限制与暂缓事项」明确：「**`tools/pre-execute` 有意不允许改写 `exec.arguments`**」「**并发策略不是事件门禁**」。
3. **harness 自身的 plan-mode 设计就刻意保持工具目录跨 mode 稳定以保 KV cache**——`apps/cli/config/agent-presets/standard/agent.cordis.yml` 里 `plan-mode` 段注释原文：「The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged.」即 plan-mode 不删 mutation 工具，只用提示词规则 + `exit_plan_mode` 工具自身逻辑约束。
4. `packages/core/agent-loop/README.zh.md`「已知限制」：「**没有内置轮次预算**：工具调用或 steering 会让当前轮次继续；限制失控轮次的策略必须从既有生命周期扩展点（如 `agent/turn-stopping`）执行取消。」→ 轮次预算/限制也得自己加 hook。

### 3.3 因此门控只能在事件 seam 上加 hook

- 软门控（可见性）：`ctx.tools.restrict()`（per-agent 掩码，会话级稳定）或 `system-prompt/assemble` waterfall（按组装收束可见 schema）。
- 硬门控（执行拒绝）：`tools/pre-execute` waterfall（可重排 deny/ask；可被下游翻案除非用 `prepend`）或 **`ctx.tools.guard()`**（单调、下游不可翻案；推荐用于硬 phase 门控）。
- 轮次/预算门控：`agent/turn-stopping` serial 检查点（取消轮次的唯一原生处）。
- 结果门控：`tools/post-execute`（accept/block/replace/attach context）+ `tools/result`（仅观测）。
- 请求恢复：`agent/request-error` waterfall（返回 `{kind:'retry'}`）。

`INFERENCE`：要在**单个 agent 运行内**按 phase 切换工具白名单，没有原语；phase 状态必须由插件自己维护（per-agent 可变状态），在 `guard()` / `tools/pre-execute` 上读取当前 phase 并拒绝非白名单调用。见 §4。

---

## 4. reverse-bi 四阶段 data_agent 如何映射到 harness 循环？（Q4）

reverse-bi 四阶段：UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION，每阶段有**工具白名单 + gate + fallback + max_attempts**。

### 4.1 不要自定义 agent-loop（可行性 + 官方指引）

`packages/core/agent-loop/README.zh.md` 开篇：「这是 harness 中唯一包含具体循环逻辑的包。其他所有内容要么是抽象服务，要么是针对扩展点的插件：**新行为应放入插件，而不是这里。**」且包根不导出 `./src/*`，生命周期拥有方通过 `ctx.agents` 创建 agent。`INFERENCE`：自定义 agent-loop 既违背官方指引、也无必要——四阶段逻辑全部能在现有 seam 上表达。

### 4.2 最干净的映射：一个 preset + 一个 phase-gate 插件

**A. 用一个 preset 组装四阶段的全部能力（per session，agent 平面）**

写一份 `agent.cordis.yml`（放在 `apps/cli/config/agent-presets/<id>/` 或用户 home 的 `${DSH_HOME}/.agent-presets/<id>/`，见 §5），把四阶段**所有**工具、四套 persona/提示词段、phase-control 工具、压缩策略都作为行挂上。理由：

- preset 是 per-agent 组装的天然载体（§1.3、§5）。
- 一次组装全部工具 → **工具目录在 phase 间保持稳定**，与 harness 的 KV cache 设计一致（§3.2 第 3 点）。**不要**做「每阶段切一套工具白名单」——那会反复击穿 cache，且没有原语支持。
- 四套 persona/段可作为独立 `section` 行（或一个 `complete` 段按 phase 切换 `text`），由 phase 插件在 `system-prompt/assemble` 上按当前 phase 选段（`INFERENCE`：assemble waterfall 可替换组装结果，是改 persona/段而不改工具目录的合适 seam）。

**B. 用一个 phase-gate 插件做硬门控（不动循环）**

phase 状态 = 插件持有的 per-agent 可变状态（phase ∈ {UNDERSTANDING, GENERATION, EXECUTION, INTERPRETATION} + attempts 计数）。在 `setup(agentCtx)` 内（与 preset 挂载同处）注册：

- **`ctx.tools.guard()`（经 `agent.ctx`）**——核心硬门控。返回理由即拒绝，单调、下游不可翻案。读「当前 phase + 该 phase 工具白名单」，拒绝白名单外调用。**这保持了可见工具目录稳定（cache 友好），同时在执行时硬拒绝越界调用——与 harness plan-mode「目录稳定 + 规则约束」理念一致，但比 plan-mode 的提示词约束更强（硬拒绝）。**
  - 备选/补充：`tools/pre-execute` waterfall（若需要可观察/可改写决策、或需要 `ask` 审批语义）；但硬 phase 边界优先用 `guard()`，因为单调不可翻案。
- **phase 转换**：一个 `exit_<phase>` / `advance_phase` 工具（类似 `exit_plan_mode`），模型调用即推进 phase；或在 `agent/turn-stopping` serial 处检查 phase 完成条件后推进。`INFERENCE`：phase 转换点应与 §2 的 turn/step 边界对齐，避免 mid-step 切换。
- **gate（阶段完成检查）**：`agent/turn-stopping` serial 检查点（每步自然停且 next-step 空时触发）——读 phase gate 是否满足，满足则推进 phase、否则停轮次。也可在 `tools/post-execute` 上检查该工具结果是否满足 gate（accept/block/replace/attach context）。
- **fallback**：`tools/post-execute` 的 `block` 把反馈变成无值失败（让模型自我修正）；或 `agent/request-error` 返回 `{kind:'retry'}`（规范重试，如上下文溢出修复）。`additionalContexts` 可注入纠正性上下文。
- **max_attempts**：phase 插件按 phase 计数；在 `agent/turn-stopping` 上检查「当前 phase attempts ≥ max_attempts」→ 取消轮次（`agent.cancel(cause)`）或强制推进/回退 phase。

**C. model routing**

provider/model/reasoning effort 不进 preset；用 `installAgentLlmTarget`（per-agent seam，§1.2）配置（`.agents/notes/.../2026-08-03-...md`「Model routing stays out of presets」）。`INFERENCE`：若四阶段需要不同模型/推理强度，用 `agent/request` waterfall 按 phase 改写 `proposedConfig`（该 waterfall 本就负责补齐 provider/model，见 §2.3 第 5 步）。

### 4.3 映射推荐汇总表

| reverse-bi 概念 | harness 落点 | 机制 / cite |
|---|---|---|
| 四阶段工具集 + persona + 段 | **一个 preset**（agent 平面） | `apps/cli/config/agent-presets/standard/agent.cordis.yml`；`packages/preset/README.zh.md` |
| per-phase 工具白名单（硬） | **`ctx.tools.guard()` 经 `agent.ctx`**（单调、不可翻案） | `packages/core/tools/README.zh.md`「公开 API」 |
| per-phase 工具白名单（软/可见） | `ctx.tools.restrict()` 或 `system-prompt/assemble` | 同上；`packages/core/system-prompt/README.zh.md` |
| phase 状态机 | 插件 per-agent 可变状态 + `setup(agentCtx)` 注册 | `packages/preset/agent-presets/src/index.ts`（`mount`） |
| phase 转换 | `exit_<phase>` 工具 或 `agent/turn-stopping` serial | `docs/architecture.zh.md` 轮次流程；`agent.ts` `turn` |
| gate（阶段完成检查） | `agent/turn-stopping` / `tools/post-execute` | `packages/core/tools/README.zh.md`；`agent.ts` `turn` |
| fallback | `tools/post-execute` block / `agent/request-error` retry / `additionalContexts` | `packages/core/tools/README.zh.md`「关键类型」 |
| max_attempts | 插件计数 + `agent/turn-stopping` 取消 | `packages/core/agent-loop/README.zh.md`「已知限制」 |
| per-phase 模型/推理强度 | `installAgentLlmTarget` + `agent/request` waterfall | `.agents/notes/.../2026-08-03-...md`；`agent.ts` `buildRequest` |

**可行性评估：高。** 无需自定义 agent-loop；全部落在既有 seam 上，且与 harness 的 plan-mode/compaction 设计同构（都是「目录稳定 + 事件 hook 约束」）。

### 4.4 「一个用户问答 turn」走查（结合四阶段）

以 EXECUTION 阶段一次用户提问为例：

1. `followup(content)` → `next-turn` FIFO → `agent/inbox/inserted` → `wakeDriver()` → `agent/status` running（`agent.ts` `send`/`wakeDriver`）。
2. `turn()`：`session.append('turn/start')`；`preStep('next-turn', {turn, step:1})`：领取输入 + 组装提示词 → `agent/pre-step` waterfall（phase 插件可在此按当前 phase 注入 phase 指令 context，或 `reject` 强制重走某阶段）→ `enter(messages)`（`agent.ts` `preStep`）。
3. `step/start`；`user/message`；`buildRequest` → `agent/request` waterfall（phase 插件可改 provider/model/推理强度）→ `llm.prepareCall` → `request/header`（`agent.ts` `buildRequest`）。
4. `llm/stream` → `assistant/chunk*` → `assistant/message`（`agent.ts` `step`）。
5. 若 `tool-call`：`tool/call`（先记日志）→ `tools/pre-execute`（phase 插件观察）→ **`ctx.tools.guard()` 硬拒绝非 EXECUTION 白名单调用**（phase 插件）→ `tools/execute` → 工具主体 → `tools/post-execute`（phase 插件检查 gate，block/attach 纠正 context）→ `finalizeContent` → `tools/result` → 持久 `tool/result`（`tool-calls.ts` `appendToolCall`/`appendToolResult`）。
6. `result.additionalContexts` splice 进 `next-step` inbox（`tool-calls.ts` `acceptContext`）。
7. `step/end`；若自然停且 next-step 空 → **`agent/turn-stopping` serial**：phase 插件检查 EXECUTION gate（max_attempts / 完成条件）→ 满足则推进到 INTERPRETATION（更新 phase 状态），不满足且未超 attempts 则继续，超 attempts 则 `agent.cancel(cause)`（`agent.ts` `turn`；`packages/core/agent-loop/README.zh.md`「已知限制」）。
8. 若 next-step 有 pending（工具欠下请求/steering）→ 领取，下一 step（`target='next-step'`）；否则 `turn/end { reason }` → `agent/status` idle。

---

## 5. preset 如何每会话激活/选择？（Q5）

源：`packages/preset/agent-presets/src/index.ts`（`AgentPresets`）+ `.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.md`。

### 5.1 发现与名册

- `AgentPresets`（`ctx key: agentPresets`，`static inject = ['loader']`）拥有 preset 词汇体系、文件系统发现、受防护的挂载（`packages/preset/README.zh.md`）。
- Config：`default`（必填）、`roots[]`（`{path, trust: 'system'|'user'}`，默认 `trust:'user'`）、`includeUserRoot`（默认 true）。
- `resolvedRoots` = config.roots + harness-home 用户根（`${DSH_HOME}/<USER_PRESET_DIR>`，除非 `includeUserRoot:false`）。shipped preset 目录是 `apps/cli/config/agent-presets/`（`packages/preset/README.zh.md`：「部署交付哪些 preset，看 `apps/cli/config/agent-presets/`——一个 preset 一个目录，那份目录列表就是清单」）。
- `list()` / `resolve(id?)`：**未 memoize**，每次调用都重读根目录——所以运行中 author 的 preset 立即可见，被删的从下次读消失（`index.ts` `list`/`resolve` 注释）。

### 5.2 默认 preset 的选择（双层叠加）

- **composition 的 `default`**（部署自带，无 settings provider 也能工作）+ **用户 setting `agent-presets.default`** 叠加。
- `defaultId` getter：`this.settings?.get().default ?? this.config.default`——**每次调用现读**，不缓存。settings 文档热重载 → 改默认对**下一个创建的会话**生效，**每个运行中的会话保留它当初的组合**（`index.ts` `defaultId` 注释；`.agents/notes/.../2026-08-03-...md`「The effective default is read per resolution, never snapshotted」）。
- settings 注册：`ctx.inject(['settings'], ...)` → `settings.register(settingsNamespace('agent-presets'), AgentPresetSettingsSchema, { base: { default: config.default } })`。

### 5.3 挂载机制（standing mount + scope parentage）

- `AgentPresets.mount(agentCtx, id?)`——**唯一受支持调用点是 agent factory 的 `setup(agentCtx)`**（`index.ts` `mount` JSDoc：「Call from the agent factory's setup(agentCtx); a rejection there rolls the agent creation back」）。
- 实现：`ensureStanding(preset)` 单航（single-flight）创建/复用该 preset 的 **standing mount**（一个 preset 一份组合，非每会话一份）：
  - `createScope(selfCtx, { agentPreset: preset.id })` → `mountPreset(scope.ctx, preset)`。
  - 挂载前先盖戳（`compositionStamp`：mtimeMs + size），文件变更 → 下次为新会话启新一代；已加入的会话保持原代。
  - `standing` Map 缓存 `Promise<StandingMount>`；两 agent 竞争首次用同一 preset → 共享一份组合。
- `bindScopeParent(agentKey, standing.key)`——把 agent 的 scope key 挂到 standing scope 下，使该 mount 的注册对此 agent 可见、该 mount 的监听收此 agent 的事件（`index.ts` `mount`）。
- `composeFrom(agentCtx, parentCtx)`——子 agent 继承父的能力（同一 standing 实例；同步、不读文件；用于 in-process subagent driver 的同步 `setup`）。
- `standingKeyFor(id?)`——冷 transcript 读（无 agent 的 host reader）：确保 standing mount（挂插件但不启 agent/session/turn），返回 scope key 供 registry view 用。
- `serviceFor(agent, name)`——从外部（浏览器 RPC）读某 agent 的 preset 在 `isolate` realm 内发布的 service（只读寻址）。

`INFERENCE`：实现采用了 **standing mount（每 preset 一份，跨会话共享 via scope parentage）**，而非 design note 原初设想的「每会话一棵子树」。`isolate` realm 因此是「此 standing mount 的 entry-local 实例」（per-preset，非 per-session）；per-session 的状态由插件内部按 Session/Agent 键存（这些插件早于 preset、本为共享世界所写——`index.ts` 模块注释：「keyed per session inside the plugins themselves (they predate presets and were written for a shared world)」）。

### 5.4 会话内切换（仅 blank session）

- `recompose(agentCtx, id)`——re-link agent 到另一 preset 的 standing 组合。**只在 agent 尚未产出任何内容时合法**（caller 自检；切换工具中途会留下新组合无法解释的已记 tool calls）。`index.ts` `recompose` JSDoc：「Only valid while the agent has produced nothing」。
- 持久层：session header 记录创建时的 preset id；`agent-preset/selected` 事件记录后续 blank-session 切换；`resolveSessionPreset` 解析这一对（不单读 header）→ resume 重建历史所产组合，而非今日默认；冷 transcript 的 presenter 在该组合层解析；gateway 拒绝在运行中会话上换到别的 preset（`.agents/notes/.../2026-08-03-...md`「Switching is allowed only while a session is blank」）。
- 切换 = unmount-then-mount（先解析新 preset 再拆旧，失败则恢复原组合）。
- Web surface 把选择器放在 new-session screen（staged，会话变 current 且仍 blank 时落地）；运行中会话只读地显示 header label（`.agents/notes/.../2026-08-03-...md`「The choice belongs to the screen where it still works」）。

### 5.5 编排（authoring）

- `copy(from, id, name?)`——唯一 authoring 写：整目录复制（composition 文本不过 seam；副本与源同等可加载；不挂载验证）。
- `remove(id)`——删本地 author 的 preset（拒删 shipped preset）。
- `read(id)`——读 composition 文本。
- `list` / `select` 是普通 RPC；`read`/`write`/`remove` **loopback-pinned**（特权；composition 命名会话所跑插件，读=侦察、写=任意能力）。id 须匹配 `[a-z0-9][a-z0-9-]*`，且在变成目录名前校验（防路径穿越）（`.agents/notes/.../2026-08-03-...md`「Authoring a preset is an RPC, and a privileged one」）。

### 5.6 与 profile/bundle 的层叠关系（收束）

- **Host 平面（进程级，boot 时叠加）**：bundle（`dsh-base`/`dsh-web-app`/`dsh-headless`/`agent-spine-demo`）+ profile（`web`/`headless`）+ 各层 `cordis.patch.yml` + `--patch` overlay → 决定 `ctx.tools`/`ctx.systemPrompt`/`ctx.agents`/`ctx.agentLoop`/`ctx.sessions` 等注册表与跨会话设施。可用 `dsh --profile web --dump-config` 查看实际配置树（`docs/architecture.zh.md`）。
- **Agent 平面（每会话，setup 时挂）**：preset（`agent.cordis.yml`）经 `setup(agentCtx)` → `ctx.agentPresets.mount()` → standing scope + `bindScopeParent` → 向 host 注册表贡献该 agent 的工具/persona/段/压缩策略。
- preset **不得**发布 root realm 的进程级 service（否则第二个会话碰撞，挂载即拒；`standard/agent.cordis.yml` 头部注释）；model routing 不进 preset（`installAgentLlmTarget` seam）。

---

## 6. Q7 答案（per-phase 工具门控是否原生）

**否，harness 不原生支持 per-phase / per-turn 工具白名单。**

- 原生有的是 **per-agent**（会话级、scope 建立时一次）工具门控：`ctx.tools.register()` 经 `agent.ctx` 作用域内注册、`ctx.tools.restrict()` 允许/拒绝掩码（**可见性组合，非权限边界**）、`ctx.tools.guard()` 单调拥有方策略、`ctx.tools.presentAs()` 呈现遮蔽（§3.1）。
- 没有「按 turn / 按 phase 切换工具白名单」的原语；`tools/pre-execute` 有意不改写参数；并发分类不是事件门禁（§3.2）。
- harness 自身 plan-mode **刻意保持工具目录跨 mode 稳定**以保 KV cache（§3.2 第 3 点原文 cite）。
- 因此**必须加 phase-gate hook**。推荐：
  - 硬 phase 门控 → **`ctx.tools.guard()`（经 `agent.ctx`）**：单调、下游不可翻案、保持可见目录稳定（cache 友好）。
  - 软/可见门控 → `ctx.tools.restrict()` 或 `system-prompt/assemble`。
  - 轮次/预算/phase 推进 → `agent/turn-stopping` serial。
  - 结果/fallback → `tools/post-execute`、`agent/request-error`。

---

## 7. 引用索引（绝对路径）

**Docs（中文对侧，经评审）**
- `docs/architecture.zh.md`——Profile 与组合包 / 核心包 / 事件 / 轮次流程 / 会话日志 / 能力 seam / 新行为的归属位置
- `docs/cordis-primer.zh.md`——五个核心概念 / 分发模式 / Cordis Waterfall 语义 / Loader 配置
- `docs/agent-lifecycle.zh.md`——turn/step 生命周期 Mermaid 时序图
- `docs/tool-execution-pipeline.zh.md`——工具执行流水线 Mermaid 流程图

**Preset / 组合**
- `packages/preset/README.zh.md`——preset 定义、`agent-presets/`+`persona/` 包职责
- `packages/preset/agent-presets/src/index.ts`——`AgentPresets` 服务：`mount`/`composeFrom`/`recompose`/`list`/`resolve`/`defaultId`/`copy`/`remove`/`standingKeyFor`/`serviceFor`/`ensureStanding`
- `.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.md`——两平面表、setup 唯一调用点、blank-session 切换、authoring 特权、model routing 不进 preset
- `apps/cli/config/agent-presets/standard/agent.cordis.yml`——真实 preset 行结构、`cordis:group`+`isolate`、plan-mode 工具目录稳定注释
- `packages/preset/agent-presets/tests/fixtures/user/isolated/agent.cordis.yml`——`isolate` realm 最小例
- `packages/examples/agent-spine-demo/src/index.ts`——BUNDLE（host 平面脊柱）例

**Agent loop / 工具 / 系统提示词**
- `packages/core/agent-loop/README.zh.md`——`AgentLoop` 服务、注入服务、循环生命周期、模型体验、已知限制（无内置轮次预算）
- `packages/core/agent-loop/src/agent.ts`——`ReactLoopAgent`：`send`/`followup`/`steer`/`inject`/`wakeDriver`/`kick`/`turn`/`preStep`/`step`/`buildRequest`
- `packages/core/agent-loop/src/tool-calls.ts`——`executeToolCalls`/`runGroup`/`appendToolCall`/`appendToolResult`/`appendSkippedToolCall`
- `packages/core/tools/README.zh.md`——`ToolRuntime`：`register`/`restrict`/`guard`/`presentAs`/`execute`/`executionMode`/`get`/`schemas`；流水线顺序；`PreToolDecision`/`PostToolDecision`/`ToolGuard`/`ToolExecutionResult`；已知限制
- `packages/core/system-prompt/README.zh.md`——`SystemPrompt`：`section`/`context`/`tools`/`variable`/`assemble`；`system-prompt/assemble` waterfall；`PromptAssembly`/`renderPrompt`
