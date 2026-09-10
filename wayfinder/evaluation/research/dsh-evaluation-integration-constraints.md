# Data-domain Evaluation Core 与 DSH/Cordis 集成约束审计

日期：2026-09-10

审计基线：`43da666dd8ccd767ab3088532d1368ee50f5efd2`

## 结论先行

Data-domain Evaluation Core 不应成为第二套 agent runtime、第二套 Provider 系统或第二份会话事实源。它应作为可选的评测控制与取证模块，启动、驱动、观察并最终处置一个按正常 profile、bundle、preset 和 Provider 配置组成的 DSH agent。模型请求、工具执行、审批、取消、hook、session persistence、Context 注入和 workflow 必须继续走生产路径；评测只增加 run/attempt identity、Benchmark material、环境保证、证据索引、grading 和 measurement。

对 Environment 的直接结论是：它不是数据库抽象，也不是统一的 `execute(action)` 网关。数据库、文件系统、shell、workflow 和其他执行能力已经由 Cordis Service Definition / Provider / Consumer seam 负责。Evaluation Environment 应表达一次 attempt 对已组成 Provider 图的要求、控制与观察：确认所需 capability 已激活，建立 attempt 资源租约，关联跨 Provider 的副作用与状态，等待 finality，并产出 separation、cleanup 和 assurance evidence。它不能选择 MaxCompute/PostgreSQL Provider，不能复制 `ctx.query`、`ctx.fs` 或 `ctx.workflowEngine`，也不要求生产 Provider 导入 evaluation 包。

评测真实生产 composition 的首选路径是：使用生产 profile 和 agent preset 启动一个独立、可处置的 DSH root runtime，仅额外安装不改变模型行为的 evaluation controller/observer/evidence sink；通过 `ctx.agents.create()` 或现有 SDK 驱动正常 agent；通过 session log 和既有 lifecycle events 取证；完成后依次 cancel、等待 quiescence、flush、dispose，再在私有 grading 侧评分。需要改变 prompt、tools、approval、hooks 或 Provider 的实验仍可做，但它们是显式 Harness variant，必须进入 resolved run identity，不能伪装成对生产 composition 的无扰动测量。

## 范围与方法

本报告审计 DSH Core 与其 vendored Cordis 中会约束 evaluation 设计的既有能力，重点覆盖 plugin role、service injection、Provider 替换、plugin tree/fiber 生命周期、effect disposal、scoped composition、event dispatch、loader/intercept/config、动态 registry、启动依赖、session identity、tool pipeline、approval、cancellation、hooks、workflow、SDK、fork、isolation 和 recomposition。主要证据来自当前 worktree 的文档与源代码；没有使用外部资料，因为仓库自有实现足以回答本票的集成问题。

本文明确区分三层：

| 层 | 含义 | 本报告中的例子 |
| --- | --- | --- |
| Cordis primitive | vendored framework 直接提供的运行机制 | `Context`, `Service`, `inject`, `Fiber`, `ctx.effect`, `ctx.on`, `waterfall`, `isolate`, `intercept`, Loader entry tree |
| DSH convention | DSH 在 Cordis primitive 上建立的产品规则 | Definition/Provider/Consumer、agent-scoped registration、model-visible iff logged、owned handle、quiescent disposal、profile/bundle/preset 分层 |
| Proposed evaluation abstraction | G10 尚待落地的评测概念 | `EvaluationRunId`, `AttemptId`, `ResolvedEvaluationPlan`, Environment lease/assurance, evidence envelope, grading boundary |

除明确标为“设计推论”的内容外，以下“事实”均描述当前仓库行为。

## 一、DSH 必须保留的核心架构事实

### 1. DSH 是可组合插件树，不存在供 Evaluation 接管的特权主循环

**事实。** DSH 将 model adapter、tool registry、session log 和 agent loop 都作为插件；扩展方式是把插件挂到现有 composition 中，registration 随插件卸载而撤销。`docs/architecture.md:L9-L13`。运行时由 profile、bundle、profile patch、home patch 和 `--patch` overlay 分层组成，后层可以替换前层的 entry 配置。`docs/architecture.md:L15-L37`。

**事实。** 新行为应接入已经记录的 extension point；架构文档明确要求改变 `agent-loop` 本身时同步修改架构说明，并列出 `agent/*`、`tools/*`、`agent.inject()`、`ctx.sessions.fork()` 和 `agent.ctx` 等扩展入口。`docs/architecture.md:L106-L129`。

**设计推论。** Evaluation 不能通过修改 `agent-loop` 加入 batch、grader、case loader 或 Environment 分支。一个可选 evaluation 插件应调用公开 agent interface，并通过已有 events/registries 观察或干预；若某个实验确实替换 loop，则它是一个显式 Harness Provider variant，而不是 Evaluation Core 的默认实现。

### 2. Capability seam 已经拥有 Definition / Provider / Consumer 分工

**事实。** DSH 将 seam 定义为 Service Definition、Service Provider、Consumer 三个角色；一个 Provider 替换应能改变所有 Consumers，而不要求 Consumers import 具体实现。`docs/architecture.md:L98-L102`；`packages/README.md:L66-L70`。

**事实。** `ctx.query` 是现成的数据执行示例：`@deepseek-ai/dsh-query` 声明抽象 `QueryEngine`，提供 `execute`、`attach`、`cancel`、`getProgress` 等 engine-neutral 方法；具体数据库由 Provider package 实现。`packages/query/query/src/index.ts:L1-L14`、`packages/query/query/src/index.ts:L24-L75`。`query-maxcompute` 明确是 Provider，且不把 sidecar control tools 注册到 `ctx.tools`；模型只能通过 Consumer 间接使用它。`packages/query/query-maxcompute/README.md:L5-L17`。`query_data` Consumer 通过 `ctx.query` 调用配置选中的 engine，而不是直接 import MaxCompute。`packages/query/query-tool/src/index.ts:L304-L340`。

**设计推论。** Evaluation Environment 不应再声明 `executeSql`、`executeFile`、`runShell` 等平行接口。它应依赖抽象 capability，或者依赖一个独立的、Provider-neutral lifecycle participant。生产 Provider 不应 import evaluation；若某个 Provider 的通用 public interface 缺少取消、attach、snapshot identity 或 quiescence 信息，应先判断这是产品能力缺口还是纯评测取证需求：前者扩展原 capability seam，后者由独立 evaluation adapter/observer 提供。

### 3. Agent 与 session 共享身份，创建事务已提供正确的 scoped composition 时点

**事实。** `Agent.id` 是与其 `Session` 共享的 `SessionId`；Agent 暴露 session、inbox、status、agent-scoped `ctx`、cancel 和 `whenIdle`。`packages/core/agent/src/runtime-types.ts:L78-L118`。

**事实。** `AgentRegistry.create()` / `resume()` 的 `setup(agentCtx)` 在 agent 和 session 发布前运行。setup 中通过 `agentCtx` 注册的 scoped tools、prompt sections、restrictions 和 listeners 会在 `session/created`、`agent/created`、`agent/session-start` 以及第一次 prompt assembly 之前完成；失败会回滚，且 setup 只允许 composition，不允许提前驱动 agent。`packages/core/agent/src/index.ts:L73-L132`、`packages/core/agent/src/index.ts:L139-L155`。

**事实。** Agent handle 是 owner capability。dispose 的顺序是取消 machine、等待 `whenIdle()`、dispose agent scope，再从 registries 中移除 agent/session；多个调用共享同一 quiescence promise。`packages/core/agent-loop/src/index.ts:L150-L157`、`packages/core/agent-loop/src/index.ts:L490-L520`。

**设计推论。** 每个 evaluation attempt 应创建普通 Agent handle，而不是构造 `Nl2sqlEngine` 或直接调 `ctx.llm.stream()`。Attempt-specific preset、observer、permission policy 或工具限制应在 `setup(agentCtx)` 中完成，以便在第一次 request 前生效并受同一 rollback/disposal 事务拥有。`EvaluationRunId` 和 `AttemptId` 应是独立 branded identity，引用一个或多个 `SessionId`；不能把 batch run、workflow run 和 agent session 强行压成同一个 id。

### 4. Session log 是模型历史和产品 replay 的唯一事实源

**事实。** `dsh-session` 是 append-only event-sourced session service，persistence 通过 `session/event` 和 `session/flush` 作为插件接入。`packages/core/session/src/index.ts:L1-L5`。模型历史只由 `user/message`、`assistant/message` 和 `tool/result` 三类 surface event 投影；`deriveEventMessage()` 是 live、replay 和外部重建共同使用的单节点规则。`packages/core/session/src/surface.ts:L14-L38`、`packages/core/session/src/surface.ts:L70-L99`。

**事实。** 请求使用的 provider/model/config、system prompt 和 tool schemas 以完整 `request/header` snapshot 记录；agent loop 在首次请求、resume 或 header 改变时 append 该 event，并单独记录 route capacity。`packages/core/agent-loop/src/agent.ts:L422-L513`。架构规则因此是“model-visible means logged”。`docs/architecture.md:L92-L96`。

**事实。** `agent/request` waterfall 只允许替换冻结的 call config；其 JSDoc 明确禁止在该点偷偷改变 messages，模型可见内容必须通过 logged channel。`packages/core/agent/src/runtime-types.ts:L246-L258`。

**事实。** Session event vocabulary 可通过 declaration merging 扩展；未知且未标记 `ignorable` 的 event 会让旧 reader 拒绝日志，而普通 event-type 增长不要求提升结构性 `SESSION_FORMAT_VERSION`。`packages/core/session/src/types.ts:L33-L56`、`packages/core/session/src/types.ts:L339-L350`、`packages/session/session-persistence/src/coordinator.ts:L47-L64`。

**设计推论。** Evaluation 不应维护第二份“模型实际看到了什么”的 transcript。正式 evidence 应引用 session id 和 event seq 范围，并从 session log 派生 prompt、tool calls、tool results 和 assistant output。Evaluation-specific instruction 如果进入模型请求，必须通过正常 prompt section、`agent.inject()` 或 `agent/pre-step` 的 logged-message 路径进入，并由 `request/header`/surface event 重建；private grading material 永远不能写入 session log。纯评测状态优先留在 evaluation store；只有需要随 session resume/replay 保持语义的状态才扩展 `SessionEventMap`。

### 5. Tool pipeline 已经统一参数、policy、approval、execution、结果与 replay

**事实。** `ToolDefinition.execute()` 接收经过快照和冻结的 arguments、执行 identity、cancellation signal 和 context deferral；异步工具必须传播 signal，并在自身工作 quiescent 后才 settle。`packages/core/tools/src/index.ts:L220-L255`。

**事实。** Tool runtime 的正常路径包含 `tools/pre-execute`、approval resolution、monotonic guards、`tools/execute` around middleware、tool body、`tools/post-execute` 和 definition-owned finalization。`packages/core/tools/src/index.ts:L1360-L1605`、`packages/core/tools/src/index.ts:L1688-L1799`。Agent loop 按模型顺序 append `tool/call` 和 `tool/result`，包括被 cancellation 跳过的调用。`packages/core/agent-loop/src/tool-calls.ts:L242-L293`。

**事实。** Timeout 是独立 guard plugin，通过 `tools/execute` waterfall 包裹正常执行，替换 signal 后调用 `next()`，并等待工具真正 quiescent 后才映射成 `TOOL_TIMEOUT`。`packages/guard/timeout-policy/src/index.ts:L1-L5`、`packages/guard/timeout-policy/src/index.ts:L50-L80`。

**设计推论。** Evaluation 不得直接调用 tool body、复制 approval/guard 逻辑，或用自己的 SQL executor 代替模型实际使用的 Consumer tool。否则测到的是 eval adapter，而不是生产 agent。工具级 observation 可监听现有 pipeline；只观察的 waterfall listener必须调用 `next()`，任何 block/rewrite 都会改变 Harness identity，并必须被显式标记为实验条件。

### 6. Approval、human interaction 与 commands 是产品能力，不是 eval runner 的私有开关

**事实。** Approval 是独立 Service Definition；无 answerer 时 fail closed，`never` 是 CI/无人值守的确定性策略。每个 ask/outcome 都写入 session audit events，且 request 必须位于 open turn。`packages/interaction/user-approval/src/index.ts:L84-L118`、`packages/interaction/user-approval/src/index.ts:L176-L257`。

**事实。** Policy 切换先 append `approval/policy`，再以 `agent.inject()` 告知模型，所以 runtime behavior 与模型认知都可 replay。`packages/interaction/user-approval/src/index.ts:L219-L237`。

**事实。** User questions 是独立 Provider seam，要求 exact live root agent；owned child agent 不允许无限等待人类输入。`packages/interaction/user-questions/src/index.ts:L27-L40`、`packages/interaction/user-questions/src/index.ts:L77-L110`。Human commands 不启动 model turn，但仍用 `command/run` / `command/done` 记录 lifecycle 并传播 cancellation。`packages/interaction/commands/src/index.ts:L302-L334`、`packages/interaction/commands/src/index.ts:L341-L390`。

**设计推论。** 无人值守 benchmark 应通过正常 approval/permission composition 获得确定性拒绝，而不是在 evaluator 中跳过 approval。涉及 HITL 的 benchmark 必须声明真实 answerer；没有 answerer 时应得到 capability-unavailable 或 policy outcome，而不是模拟用户答案。Evaluation 不应把 slash command 当作模型工具，也不应把 child agent 的问答能力假定为 root agent 等价物。

### 7. Cancellation 与完成是协作式、分层且要求 quiescence

**事实。** `agent.cancel()` 清理 pending work（除非 `keepInbox`）并 abort 当前 turn 或 maintenance task；`whenIdle()` 只表示整个 agent 当前没有 activity，不代表某一条消息的因果结果。`packages/core/agent/src/runtime-types.ts:L92-L118`；`docs/defensive-patterns.md:L15-L17`。

**事实。** 已启动的 tool promise 不会因为 signal abort 被遗弃；registry 等待 body settle 后才返回标准 cancellation outcome。`packages/core/tools/src/index.ts:L1546-L1578`。Workflow 的 holder-owned run 同样暴露 `cancel()` 和 `dispose()`，后者负责等待 script 和 child cleanup。`packages/workflow/workflow/src/runtime-types.ts:L36-L48`。

**事实。** 仓库的 teardown 规则要求“达到 quiescence，而不只是发出 abort/kill”；detached hook tracker 在 disposer 中先 abort，再循环等待所有 chain settle。`docs/defensive-patterns.md:L19-L25`；`packages/hooks/hook-protocol/src/detached.ts:L8-L35`、`packages/hooks/hook-protocol/src/detached.ts:L43-L61`。

**设计推论。** Attempt timeout 必须进入 `agent.cancel()` 和下游 signals，然后等待 `whenIdle()`、owned workflow/tool cleanup、session durability 和 handle disposal。Evaluator 不能在 deadline 到达时直接返回并留下 query、worker、hook 或 persistence 写入。`idle` 也不能单独定义 attempt 的因果边界；边界至少要从本 attempt 的 durable inbox receipt 开始，并由 controller 明确拥有到 quiescence。

### 8. Hooks 是生产 Harness 的一部分，既能观察也能改变行为

**事实。** Hook bridges 使用 `agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、turn stopping 和 subagent lifecycle 等已有 extension points，不修改 loop；共享 hook library 记录 `hook/invoked` / `hook/result` session events，并为 detached emit points提供 quiescent disposal。`packages/hooks/hook-protocol/README.md:L9-L30`。Codex bridge 把 `SessionStart` detached work 纳入 effect disposer。`packages/hooks/hooks-codex/src/index.ts:L101-L105`。

**设计推论。** 真实 production composition 的评测必须保留该 composition 已启用的 hooks；禁用 hooks 会改变 Harness。相反，额外安装 evaluation hook 只要能 block、inject 或改 outcome，就不再是纯 observer，必须进入 Harness identity。Evaluation evidence 应读取 hook audit events，而不是再执行一次 hooks 或复制 hook matcher/merge 规则。

### 9. Workflow 已有独立 run identity、owned handle 和 lifecycle events

**事实。** `WorkflowEngine` 是 Provider-neutral Service Definition；`WorkflowRun` 有独立 `WorkflowRunId`、never-rejecting result、cancel 和 bounded dispose。`packages/workflow/workflow/src/runtime-types.ts:L14-L48`、`packages/workflow/workflow/src/index.ts:L150-L168`。`workflow/start` / `phase` / `agent-start` / `agent-end` / `end` 是 observe-only lifecycle events；listener failures 被 containment。`packages/workflow/workflow/src/index.ts:L31-L90`、`packages/workflow/workflow/src/index.ts:L170-L186`。

**设计推论。** 数据工程或数据科学 benchmark 的长流程不应在 Evaluation Core 内再造 workflow scheduler。Attempt evidence 可以关联已有 `WorkflowRunId` 和 child `SessionId`；若任务需要 workflow，它是 Benchmark requirement 对既有 `ctx.workflowEngine` 的要求。Evaluation 的 run tree 应引用这些身份，而不是把所有 child work 展平成自创 trace。

### 10. SDK 已经能从进程外驱动完整 runtime 并观察 session tree

**事实。** SDK server 是可选 plugin，只要求 `agents`；它把 `session/event`、`agent/status` 和 local subagent lifecycle 转成 wire notifications。`packages/sdk/server/src/index.ts:L1-L22`、`packages/sdk/server/src/server.ts:L48-L103`。SDK 初始化会等待 Loader tree settle，shutdown 会先 flush transport，再 dispose root runtime。`packages/sdk/server/src/index.ts:L40-L97`。

**事实。** TypeScript SDK 的 high-level run 从 durable inbox receipt 开始收集 events，直到目标 session 回到 idle，并返回 session events 与 notifications；它不把所有 activity 错误地归因到未被 receipt 接受的 prompt。`packages/sdk/client/src/api.ts:L146-L194`。

**设计推论。** 对“评测真实生产 composition”而言，独立 evaluator process 驱动标准 SDK runtime 是最小侵入路径之一：runtime 继续由自己的 `cordis.yml` 决定 Provider、guard、hook、preset 和 persistence，grader 也可留在另一进程。首版可以扩展 SDK 的 evaluation host 能力，而不应再建立一套 eval-only JSON-RPC 或直接调用内部 engine。当前 SDK 的 prompt→idle 范围仍是 whole-agent interval，不自动证明每个后续 event 只由该 prompt造成；Evaluation controller 仍需声明 attempt ownership、并发策略和结束条件。

## 二、Vendored Cordis plugin capability 专项审计

### 1. Service declaration、injection 与 Provider replacement

**Cordis primitive。** `Service` constructor 通过 `ctx.reflect.provide()` 把实例注册到一个 service name；该 registration 由 owning fiber 的 effect 管理，fiber unload 时自动移除。`vendor/cordis/src/service.ts:L5-L10`、`vendor/cordis/src/service.ts:L32-L58`。Context proxy 通过 service name 解析实现，不要求 Consumer import Provider。`vendor/cordis/src/context.ts:L9-L40`。

**Cordis primitive。** Plugin 的 `inject` 是 service dependency map；Fiber 只在依赖可用时激活。Provider 消失时，`ReflectService.notify()` 重新检查依赖并刷新受影响 fibers。`vendor/cordis/src/registry.ts:L12-L24`、`vendor/cordis/src/registry.ts:L62-L88`；`vendor/cordis/src/reflect.ts:L267-L329`。DSH tutorial 进一步确认 Provider 卸载会卸载 Consumers，Provider 返回后 Consumers 再加载。`docs/cordis-tutorial/03-services.md:L44-L78`。

**DSH convention。** Capability package按 Definition / Provider / Consumer 拆分，Consumer 依赖 Definition 而不依赖具体 Provider。Query seam 是当前 data-agent 的直接样例。

**Evaluation implication。** Evaluation plugin 对必需 DSH capability 应声明 `inject`，对真正可缺席的能力才使用 `ctx.get()`。缺少 Benchmark 必需能力不能静默产生“模型答错”；controller 必须在 attempt 前 preflight 并把缺失/冲突 binding 归为 invalid configuration。Evaluation 不应构造或缓存具体 Provider；Profile/Loader 选择 Provider，evaluation 只记录实际解析到的 implementation identity。

### 2. Plugin tree、Fiber state 与 startup dependency ordering

**Cordis primitive。** 每个 plugin instance 有 Fiber，生命周期包含 PENDING、LOADING、ACTIVE、UNLOADING、DISPOSED 和 FAILED；PENDING 是依赖暂未满足的正常状态。`docs/cordis-tutorial/02-lifecycle-and-effects.md:L68-L82`。Plugin entries 并发启动，YAML 行序不构成依赖顺序，`inject` 决定 activation。`docs/cordis-tutorial/01-first-plugin.md:L20-L32`、`docs/cordis-tutorial/03-services.md:L44-L72`。

**Cordis primitive。** Fiber 在 activation 时先通过 `internal/config` waterfall 解析 raw config，再调用 plugin；依赖变化会触发 unload/reload。`vendor/cordis/src/fiber.ts:L625-L695`。`fiber.await()` 等待 lifecycle settle 并重抛 startup error。`vendor/cordis/src/fiber.ts:L698-L709`。

**DSH convention。** App boot 先安装 Loader，再 mount root Include，等待 Loader settle，并审计所有 entries 已激活；失败时 dispose 整个 partial context。`packages/boot/app-boot/src/index.ts:L761-L824`。SDK `initialize` 同样把 `loader.await()` 作为 ready boundary。`packages/sdk/server/src/index.ts:L76-L83`。

**Evaluation implication。** Evaluation readiness 不能等同于“`ctx` 上暂时能读到几个 service”。Run 之前必须等待整棵目标 composition settle，并拒绝 PENDING/FAILED/missing entries。Provider reload 或 dependency loss 发生在 active attempt 中时，应把该 attempt 标为 Harness/Environment invalidation，不能归到 model failure；高可信 benchmark 宜在 disposable root process 中固定 composition，避免 HMR 横跨 attempt。

### 3. `ctx.effect()`、`ctx.on()` 与 quiescent disposal

**Cordis primitive。** `ctx.effect()` 立即运行 acquisition，并将返回的 disposer 纳入 owning fiber；disposers 按逆注册顺序开始，async disposer 会被等待。`vendor/cordis/src/fiber.ts:L64-L93`、`vendor/cordis/src/fiber.ts:L402-L418`。Fiber unload 会执行并等待所有 disposers，同时 containment 单个 cleanup error。`vendor/cordis/src/fiber.ts:L675-L695`。

**Cordis primitive。** `ctx.on()` 本身由 fiber effect 拥有，unload 时自动移除 listener。`vendor/cordis/src/events.ts:L252-L301`。Child plugins 也由 parent fiber 拥有并递归 dispose。`docs/cordis-tutorial/02-lifecycle-and-effects.md:L62-L94`。

**DSH convention。** DSH 对异步 teardown 增加强要求：dispose 必须达到 quiescence；多个有顺序要求的释放动作放进同一 composite effect，而不能依赖多个 async disposer 的开始顺序。

**Evaluation implication。** Observer subscription、evidence writer、temporary artifact store、subprocess grader、timer 和 in-flight attempt registry 必须全部由 effects 拥有。Evaluation plugin 的 disposer必须先停止接收新 attempt，再 abort active work，等待事件写入与 grader/Environment settle，最后释放 store。不能留下 global singleton map、裸 timer 或 fire-and-forget promise。

### 4. Child context、service isolation 与 DSH agent scope 不是同一概念

**Cordis primitive。** `ctx.extend(meta)` 创建 prototype-inheriting child context；`ctx.isolate(name, label)` 为一个 service name 切换 lookup/provide realm；`ctx.intercept(name, config)` 只影响在该 child context 下新启动插件看到的 service-specific config。`vendor/cordis/src/context.ts:L90-L145`。

**Cordis primitive。** Loader 的 `isolate` entry option把 service name 映射到 local 或 named realm；更新 realm 时 patch child context 并 reload受影响 fiber。`vendor/loader/src/config/isolate.ts:L25-L68`、`vendor/loader/src/config/isolate.ts:L70-L129`。

**DSH convention。** `@deepseek-ai/dsh-scope` 的 `ScopeKey` 是另一套 primitive：它给 registry layers 和 event listeners 做 identity routing。`createScope()` 创建 owned registration context；scope parent 使 child 看到 ancestor registrations，并使 ancestor listeners 收到 descendant events。`packages/core/scope/src/index.ts:L93-L146`、`packages/core/scope/src/index.ts:L158-L184`。

**DSH convention。** Agent preset 通过 standing scope composition复用一次挂载，agent 只把自己的 scope key parent 到该 mount；preset 不允许发布 process-global service。`packages/preset/agent-presets/src/index.ts:L1-L20`、`packages/preset/README.md:L5-L16`。

**Proposed evaluation abstraction。** `DataScope` 是数据项目 manifest；它不是 Cordis isolation label，也不是 DSH `ScopeKey`，更不是 attempt 的资源隔离证明。

**Evaluation implication。** 四种“scope”必须在类型和名称上分开：

| 概念 | 作用 | 不能证明什么 |
| --- | --- | --- |
| Cordis service isolation realm | 同一进程中为 service name 选择独立 Provider instance | 数据 snapshot、filesystem namespace、attempt separation |
| DSH agent `ScopeKey` | agent-local registration visibility、event routing、lifetime ownership | 数据库事务隔离、credential 隔离 |
| `DataScopeId` | 逻辑数据项目及其 allowed binding references | 当前 run 实际选择了哪个 Provider/snapshot |
| Evaluation Environment lease | 一次 attempt 的资源、finality、separation 和 cleanup evidence | agent prompt、grader correctness |

Evaluation 不能把“使用 agent.ctx”误称为 Environment isolation。若两个 attempts 共享一个有状态数据库 Provider，agent scope 不会自动隔离数据库状态；需要 Provider-neutral requirement 与外部 resource receipt 证明。

### 5. Event dispatch modes 与 waterfall 语义

**Cordis primitive。** Event bus 支持 `emit`、`parallel`、`serial`、`bail` 和 `waterfall`。Waterfall listener 是 around-middleware：调用 `next()` 才委托后续 listener/默认行为，不调用即 veto/short-circuit。`vendor/cordis/src/events.ts:L24-L32`、`vendor/cordis/src/events.ts:L76-L88`；`docs/cordis-primer.md:L15-L34`。

**Cordis primitive。** Listener registration是 effect，并可使用 `prepend` 改变顺序；dispatch 还会通过 Context filter 选择 listeners。`vendor/cordis/src/events.ts:L252-L301`。

**DSH convention。** `session/event` 是 durable fact 的 post-commit observe-only feed；`agent/*` 是 live coordination；`tools/*` 是 capability policy/adapter seam。`docs/architecture.md:L53-L61`。DSH 对每个 event declaration要求 `@mode`，waterfall observer 必须 `next()`。

**Evaluation implication。** 评测 observation 优先使用 emit/parallel feed；进入 waterfall 只适合显式 Harness policy。一个“只记录”插件如果忘记 `next()`，会改变 agent 行为并使评测失真。Evaluation Core 应把 observer 与 intervention 分成不同 plugin/type，intervention 必须进入 resolved Harness identity。

### 6. Intercept、validated config、Loader patch 与动态重组

**Cordis primitive。** Plugin 可以声明 Standard Schema `Config`；Fiber activation前验证并规范化配置，invalid config 抛出 `ValidationError`。`vendor/cordis/src/fiber.ts:L16-L61`。Service intercept 从 ancestor child contexts 合并配置，且只有在下面新启动的 plugin 解析时生效。`vendor/cordis/src/service.ts:L75-L102`。

**Cordis primitive。** Loader entry 有稳定 `id`、module `name`、`config`、`disabled`、`inject` 等字段；`disabled` 可由 `!!js` 对 loader context 动态求值。`vendor/loader/src/config/entry.ts:L8-L22`、`vendor/loader/src/config/entry.ts:L83-L121`。Include patch 支持 id-targeted override 与 insert；同一 patch algorithm 同时服务 runtime mount 与 config dump。`vendor/include/src/index.ts:L17-L23`、`vendor/include/src/index.ts:L45-L112`。

**Cordis primitive。** `fiber.update()` 先验证/解析新 config，再经过 `internal/update` waterfall，最后 restart；listener 可以 veto 或包装更新。`vendor/cordis/src/fiber.ts:L712-L752`。Include refresh 在 queue 中 transactionally更新 entry tree，失败时保留 last good tree。`vendor/include/src/index.ts:L296-L320`。

**DSH convention。** Profile/bundle patch 是 deployment composition；Provider 选择和 tunables 属于该层，不能在 `run()` 内隐藏默认值。Live user patches可重组 tree；不同 agent preset generation 对已经运行的 session 保持原 composition。`packages/boot/app-boot/README.md:L38-L45`；`packages/preset/agent-presets/README.md:L145-L153`。

**Evaluation implication。** `ResolvedEvaluationPlan` 必须在 attempt 开始前冻结实际 composition、Benchmark policy、Provider binding 和 config digest。Evaluation 可以通过一个显式 overlay 安装 observer 或隔离的 test Provider，但不得在运行途中用 `ctx.intercept()` 改变已存在 Provider 并假设它已生效。Live reload 如果改变 prompt/tool/provider/hook/guard，当前 attempt 不再具有单一 Harness identity；应中止或标为 invalid，而不是继续聚合。

### 7. 动态 registries 可以承载 Evaluation extension，但 registration 必须是 effect

**Cordis primitive。** Service 和 event registration 都附着于 calling fiber。DSH registries沿用同一模式：Agent factory slot 由 `ctx.effect()` 注册并返回 exact disposer。`packages/core/agent/src/index.ts:L362-L388`；session projection definitions和 listeners同样以 effect 管理。`packages/session/session-projection/src/index.ts:L190-L237`。

**DSH convention。** Merge-extensible type maps允许领域插件注册 events/projections，而 Core 负责驱动与一致性。Session projection把 subscription、watermark cache 和 notification 留在 framework，领域 package 只提供同步纯 `init/apply/view`。`packages/session/session-projection/src/index.ts:L1-L17`、`packages/session/session-projection/src/index.ts:L34-L73`。

**Evaluation implication。** Benchmark pack、grader mechanism、metric definition、evidence projector 或 Environment observer 可以使用 effect-owned registry；Core 不需要 closed union 收编所有 data-engineering/data-analysis/data-science payload。Registry interface 应保持深：注册一个 definition，Core 隐藏 activation、identity collision、version validation、persistence 和 teardown。不要为单一 implementation 发明空 seam；只有确实需要 production/test 或多个领域 adapters 时才公开 interface。

### 8. Fork、isolation 与 recomposition 的安全含义

**Cordis primitive。** Loader group isolation只改变 service lookup realm；plugin tree update通过 unload/reload完成。它不复制外部资源或 durable state。

**DSH convention。** Session fork复制一个通过稳定 boundary 验证的 event prefix，并记录 `parentSession` / `seedLength`；它不是 environment snapshot。`packages/core/session/src/index.ts:L1066-L1093`。Preset recomposition只允许 blank session，因为改变已运行 session 的工具/prompt会让既有 history 与新 composition不一致。`packages/preset/agent-presets/src/session.ts:L1-L13`、`packages/preset/agent-presets/README.md:L145-L150`。

**Evaluation implication。** Attempt isolation必须由 Environment lease和具体 resource receipts证明，不能由 `Session.fork()`、agent scope 或 Cordis `isolate` 推断。对同一 production preset做对照实验时，创建新的 agent/session；不要在 nonblank session 上切换 preset、Provider、tool set 或 evaluator policy。Fork适合研究有共同历史前缀的 agent行为，但其 source boundary、parent lineage和共享外部世界必须进入 run identity。

## 三、当前 Evaluation 实现把产品 runtime 变成 eval-only runtime 的具体风险

### 风险 1：直接 engine 路径绕过真实 Agent/Harness

`EvalRunnerService` 明确称它直接驱动 `Nl2sqlEngine`，而 production agent-loop 是另一条 runtime；它用 `CtxLlmAdapter`、`CtxOdpsAdapter` 和 `CtxQueryExecutor` 桥接 `ctx.llm` / `ctx.query`。`packages/eval/eval-runner-service/src/index.ts:L1-L18`、`packages/eval/eval-runner-service/README.md:L9-L22`。

该路径不会自然覆盖真实 agent preset、session inbox、prompt assembly、`request/header`、tool schema、tool guard、approval、hooks、turn stopping、tool call/result durability、agent cancellation和 resume semantics。即使底层 NL2SQL implementation相同，测量对象也不是实际产品 Harness。

**约束。** 新 runtime evaluation 必须驱动 `ctx.agents` 或标准 SDK；直接 engine evaluation 只能作为 module-level algorithm eval，必须使用不同 Harness identity，不能作为 data-agent end-to-end score。

### 风险 2：Evaluation 被默认挂进 data-agent product composition

Data-agent bundle 当前直接插入 `eval-runner-service`、`goal-eval-policy` 和 `goal-eval-context`；goal policy会按 agent rounds自动触发 eval并可 block goal。`packages/bundle/data-agent/cordis.patch.yml:L183-L212`；`packages/goal/goal-eval-policy/src/index.ts:L1-L8`、`packages/goal/goal-eval-policy/src/index.ts:L87-L129`。

这使正常 product runtime持有 case discovery、batch scoring、result persistence和 autonomous no-progress policy。Evaluation 不再是观察 normal agent 的可选设施，而成为 normal agent 行为的一部分；同时 model-visible eval feedback会改变后续 trajectory，污染要测量的对象。

**约束。** Benchmark execution、private grader和自动 early-stop policy必须从默认 data-agent bundle移出。若产品功能确实需要“基于评测证据自我改进”，它应作为独立 opt-in product experiment，其 presence、metric和feedback timing构成明确 Harness variant，不能与外部 benchmark runner共用隐式状态。

### 风险 3：Consumer 自己声明 duck-typed seam，所有权倒置

当前 `EvalRunnerService` 注释称 seam 由 `tool-trigger-eval` 声明，而 `goal-eval-policy` 又定义本地 `EvalRunnerSeam` 子集。`packages/eval/eval-runner-service/src/index.ts:L1-L5`；`packages/goal/goal-eval-policy/src/index.ts:L34-L40`。这使 Provider 和多个 Consumers没有共享 Definition owner。

**约束。** 若 `ctx.evaluation` 是长期 capability，必须由独立 Service Definition package拥有接口、events和browser-safe types；Provider与Consumers依赖它。若只有一个 orchestration caller，则不要制造 service seam，使用 host-owned module更深、更简单。

### 风险 4：Evaluation 复制 Provider glue 与 outcome semantics

CLI 和 service 都有 `CtxOdpsAdapter`、`CtxQueryExecutor`、judge和 context assembly分支；例如 CLI 本地 adapter直接把 `ctx.query` outcome映射成另一个 engine vocabulary。`packages/eval/eval-cli/src/context.ts:L203-L245`。Eval runner随后再次解释 SQL execution、judge和delivery。`packages/eval/eval-runner/src/runner.ts:L253-L322`。

**约束。** 正式 end-to-end eval读取生产 session/tool evidence和领域 grader input，不重放一套 eval-only query path。需要纯 execution grader时，可以消费稳定 artifact；不能为了 grader方便重新执行未记录 SQL并将其等同于 agent当时观察到的结果。

### 风险 5：Eval 自有默认值绕过 Loader、Config 和 run identity

当前 service的 `Config` 是未验证 interface，并含 provider/model/today/caseDir/passK等 defaults；其 README承认这些 default在 constructor中用 `??` 解析，无法从 `cordis.yml` 正确治理。`packages/eval/eval-runner-service/src/index.ts:L60-L77`；`packages/eval/eval-runner-service/README.md:L39-L45`。Data-agent bundle还写入具体 K11 case path。`packages/bundle/data-agent/cordis.patch.yml:L196-L205`。

**约束。** 所有 deployment-varying选择进入 validated plugin Config或显式 `ResolvedEvaluationPlan`；Benchmark、DataScope、Environment、Context、Harness、grader和attempt policy identity全部冻结。缺失值在 load/preflight失败，不生成“全失败”成绩。

### 风险 6：把 DSH scope、DataScope 与 Environment isolation 混为一谈

当前 data `ScopeRegistry` 把 scope定义为 id、`semanticRoot`、tenant和metadata，并声明 active scope是 process singleton。`packages/data/scope-registry/src/index.ts:L1-L16`、`packages/data/scope-registry/src/index.ts:L28-L46`。这与 DSH agent `ScopeKey` 和 Cordis service isolation完全不同，也不足以证明 attempt级资源 separation。

**约束。** G10 已选择的 `DataScopeManifest` 只表达逻辑项目身份及 allowed Environment/Context binding references；Evaluation plan显式选择 binding；Environment completion单独提供 assurance evidence。三个层次不能共享一个无品牌 `string scopeId`。

## 四、非侵入式集成约束

以下约束应成为 G10 target topology 和后续实施票的 acceptance criteria。

### A. Composition 与 Provider

1. **生产 composition 是被测对象。** End-to-end attempt从实际 profile/bundle/preset组成 agent，不直接构造 engine、tool definition或 concrete Provider。
2. **Evaluation 是可选层。** Default data-agent bundle不因“可评测”而常驻 case loader、grader、auto-eval policy或 private material。Evaluation通过专用 profile/bundle、`--patch` overlay或外部 SDK host启用。
3. **Provider 选择留在 Cordis。** Benchmark只声明 requirement；run profile显式选择 binding；Evaluation读取已解析 service和identity，不用 `if provider === ...` 选择实现。
4. **不要求生产 Provider evaluation-aware。** 通用 lifecycle/cancellation/finality缺口在 capability seam解决；纯评测 translation由独立 adapter plugin完成。
5. **启动必须 fail loud。** 先等待 Loader settle并检查 required capabilities、preset和bindings；PENDING、missing或conflicting provider不计为模型错误。

### B. Agent 与 session

6. **通过 `ctx.agents.create/resume` 或 SDK驱动。** Agent loop保持可替换；Evaluation不依赖 `dsh-agent-loop` implementation类。
7. **Attempt使用独立 owned handle。** Controller持有 `AgentHandle`，并负责取消、等待 idle、flush和dispose。
8. **Attempt identity引用 session，不复制 session。** `AttemptId -> SessionId + owned event interval`；workflow/subagent identities作为关联边而不是展开副本。
9. **模型可见即记录。** Evaluation注入必须使用正常 logged paths；grader reference、hidden tests和private policy不进入 session。
10. **Session log是trajectory事实源。** Evaluation evidence store保存索引、digest、derived measurements和外部 environment receipts，不复制一份权威 transcript。

### C. Tools、policy 与 human interaction

11. **只经 `ctx.tools` 执行模型工具。** 不直接调用 `ToolDefinition.execute`或具体 Provider method模拟 agent调用。
12. **保留生产 guard/approval/hook链。** Headless确定性通过正常 permission/approval配置获得；缺少 answerer按产品规则fail closed。
13. **Observer不得改变 waterfall。** 纯观察 listener必须delegate；任何 deny、rewrite、additional context、retry或timeout变化都属于 Harness variant。
14. **Cancellation传播到底。** Attempt signal进入 agent、tool、workflow、hook和Provider；完成必须等待quiescence，不能以 timer race后丢弃 promise。

### D. Scope、isolation 与 recomposition

15. **Trial-specific registration使用 agent scope。** 能在 `setup(agentCtx)` 完成的 observer、prompt和tool registration不得污染 root registry。
16. **Service Provider替换使用 Cordis isolation或独立 root。** DSH agent scope只控制 registration visibility；不替代 service realm或资源隔离。
17. **Nonblank agent不重组。** 不在 attempt中途切 preset/provider/tool set；若HMR或dependency loss发生，attempt失效。
18. **Environment assurance依赖receipt。** `managed`、`attached-snapshot`、`observational`由实际 snapshot/finality/separation/cleanup证据区分，不由进程、容器、ScopeKey或Provider名称推断。

### E. Lifecycle 与 evidence

19. **全部动态状态effect-owned。** Registry entries、listeners、workers、timers、writers和temporary stores都有disposer；disposer达到quiescence。
20. **Durability使用既有checkpoint。** 最终评分前等待session persistence；异步 `session/event` observer不能成为唯一证据源。
21. **Composition变化可检测。** Resolved run identity记录profile layers、preset generation、active Provider identities、request headers、hooks、guards和evaluation interventions；mid-run变化导致拒绝比较或attempt invalidation。
22. **Extension payload保持namespaced。** Core拥有stable evidence/measurement envelope；data-analysis、data-engineering、data-science注册payload和metric definition，不把SQL/rows/notebook/pipeline写进Core。

## 五、建议的可选 plugin 切分

这是基于上述事实的设计推论，不是当前仓库已经存在的 package topology。

| Module | 角色 | Cordis 形态 | 允许做什么 | 禁止做什么 |
| --- | --- | --- | --- | --- |
| Evaluation protocol | 共享 types/schema/identity | 纯 library，不注册 `ctx` | Case/Run/Attempt/Evidence/Measurement/Requirement vocabulary | 读取 Provider、驱动 agent、访问 private material |
| Evaluation registry | Benchmark、grader mechanism、metric/evidence definitions 的 Definition | 可选 root Service Definition；registrations effect-owned | 验证注册冲突与版本，解析显式 ref | 内置 data-analysis defaults，自动选择第一个 Provider |
| Evaluation controller | 一次 run 的深模块 | 可选 host Consumer，inject `agents`、persistence及必要 registries | resolve plan、创建attempt、定义event interval、cancel/flush/dispose、输出run artifact | 构造具体 engine、复制 agent loop、绕过 tools/approval/hooks |
| Evaluation observer | 取证 Consumer | root observer或agent-scoped plugin | 监听 session/agent/tool/workflow lifecycle，关联 ids | 修改waterfall结果，生成correctness verdict |
| Environment control/observation | attempt环境控制 | evaluation-owned Definition +按场景实现的 adapters | preflight、lease、finality、separation、cleanup receipts | 实现query/fs/shell/workflow，选择具体数据库 |
| Data-domain extensions | 领域 payload 与 grader机制 | registry contributors / Consumers | query/pipeline/dataset/model artifacts和metrics | 修改Core envelope或默认所有任务为SQL |
| Private grader host | grading access | 同机独立进程/sandbox或dev同进程Provider | resolve `GradingMaterialRef`、执行 frozen plan | 把private material提供给agent runtime |
| Evaluation CLI/automation | composition root | 独立bin或SDK client | 启动目标profile + optional eval overlay，编排batch | 在data-agent product bundle中常驻自动batch逻辑 |

`Evaluation controller` 应是深模块：调用者提交一个冻结的 plan并拿到 holder-owned run handle；其 implementation隐藏agent创建、subscription、interval correlation、cancellation、durability和teardown。若把这些步骤分别暴露给每个CLI、tool和goal policy，当前重复 runner问题只会换一组名称继续存在。

## 六、在不修改 agent-loop、不改造生产 Provider 的前提下评测真实 composition

建议的端到端路径如下：

```text
Evaluation host
  │
  ├─ boot production profile/bundles/preset
  │    └─ Cordis selects ordinary LLM/query/fs/workflow/context Providers
  │
  ├─ add optional observer/controller overlay
  │    └─ no prompt/tool/policy change in observation-only mode
  │
  ├─ await Loader settlement + freeze composition identity
  │
  ├─ resolve Benchmark/DataScope requirements to explicit bindings
  │
  ├─ ctx.agents.create({ sessionId, setup(agentCtx) { join preset; install scoped eval identity } })
  │
  ├─ send normal user message / drive through SDK
  │    └─ normal agent loop → request/header → LLM → tools → approval/hooks/guards → session log
  │
  ├─ cancel or await owned completion interval
  ├─ Environment finality/separation/cleanup
  ├─ session flush + immutable evidence snapshot
  ├─ dispose AgentHandle/root runtime to quiescence
  │
  └─ private grader resolves GradingMaterialRef and emits measurements
```

### 同进程路径

适合开发、公开 train cases和快速诊断。Controller是可选 Cordis plugin，消费root services，通过agent factory创建普通agent，并把agent-local contribution放入`setup(agentCtx)`。它不能从root `ctx`直接执行query或tool来替代agent。Private grader即使同进程，也不能被Harness package依赖或注入到agent scope。

### 独立进程路径

适合heldout/fresh、精确production-profile复现和强cleanup。Evaluation host启动标准SDK runtime或目标CLI profile，通过现有JSON-RPC收集session tree；private grader在另一个进程解析opaque ref。该路径天然把root lifecycle作为一个attempt或一组严格串行attempt的资源所有者，并降低HMR、global registry和credential泄露风险。

### 何时需要额外 evaluation adapter

只有当现有capability能完成业务操作，却无法从公共interface判断评测所需的finality/separation事实时，才添加adapter。例如一个warehouse adapter可以观察`QueryOutcome`、`attach/cancel/getProgress`和snapshot metadata，生成Environment receipt；它依赖`@deepseek-ai/dsh-query`，不依赖`query-maxcompute`或`query-postgres`。确实只有某个Provider才能证明的事实，通过一个Provider旁挂的optional observer注册到evaluation Environment registry；Provider本身不导入evaluation。

## 七、建议的验收检查

1. 使用同一production data-agent preset分别在正常CLI/SDK和evaluation host中执行一个data-analysis case，session `request/header`、tool schemas、hook/approval/guard配置和Provider identity一致。
2. 卸载evaluation overlay后，normal agent仍可完整运行；任何production package不依赖evaluation package。
3. Evaluation observer卸载后无listener、timer、worker、writer或pending promise残留。
4. 故意缺失required Provider时preflight失败，不生成case wrong或零分。
5. 故意在attempt中HMR一个required Provider时attempt标记invalidated，且agent/Provider均quiescent。
6. Evaluation timeout能通过agent/tool/workflow signals停止工作，并在result发布前等待cleanup。
7. 一个approval-required tool在headless `never` policy下走正常deny/audit path；Evaluator不能直接执行其body。
8. 一个hook-enabled composition保留hook events和行为；移除hook时run identity不同且默认不可比较。
9. Model-visible evaluation context能从session log完整重建；private grading material在session、SDK notification和tool result中均不可达。
10. `DataScopeId`、DSH `ScopeKey`、Cordis isolation label和EnvironmentSessionId在类型与序列化字段上不可互换。
11. Data engineering和data science conformance fixtures各自注册namespaced evidence payload，而Core没有新增SQL、pipeline或model-specific optional fields。
12. Eval end-to-end路径不import `@deepseek-ai/dsh-agent-loop` implementation、`query-maxcompute`、`query-postgres`或`Nl2sqlEngine`；只依赖Definition packages和host composition。

## 八、明确的开放问题

1. **Evaluation run 与 root runtime 的粒度。** 一个root process只运行一个attempt，还是允许多个严格串行attempt共享composition？后者更快，但需要证明Provider caches、global registries和hooks在attempt之间不会泄漏状态。
2. **Composition identity 的规范来源。** `dsh --dump-config`能给出layered entry tree，但还需决定是否记录resolved config、raw `!!js`、package version、source commit、preset generation和Provider runtime identity，以及哪个digest是comparison key。
3. **Provider replacement during run。** 首版是禁止HMR并以独立process冻结，还是监听Loader/Fiber变化并把attempt标记invalidated？两者都不应允许静默继续。
4. **Environment participant registration。** 是由capability-independent evaluation adapters主动注册observer，还是由composition root根据selected Provider安装对应adapter？应避免“Provider自己声称assurance”且无人验证。
5. **Attempt完成条件。** 普通single-turn分析可用owned inbox receipt到whole-agent idle；多轮、workflow、background job和human interaction需要哪一种显式completion declaration，不能由通用controller猜测。
6. **Persistence cut。** 正式evidence读取live in-memory log、`session.flush()`后的persistence snapshot，还是两者都保存并校验digest？高可信结果应有单一权威cut。
7. **Evaluation interventions。** 哪些变化仍算“同一production Harness”的可接受参数，例如model route、approval policy、time/context snapshot；哪些必须成为新的Harness variant或失去production-equivalent标签？
8. **Hooks与guard identity。** 是否把完整hook config和guard config写入run identity，还是只记录resolved plugin tree/content digest？前者可解释，后者更稳定但较难诊断差异。
9. **Public SDK能力。** 当前SDK足以prompt并订阅events，但是否需要增加显式cancel、resume/preset选择、session flush或run-boundary方法，才能让外部evaluation host不依赖私有server internals？
10. **SessionEventMap扩展范围。** Evaluation lifecycle是否需要session-local durable events，还是全部留在独立eval store并引用session seq？只有影响resume/model-visible reconstruction的事实才应进入session log。
11. **DataScope演进。** 当前`ScopeRegistry`仍把`semanticRoot`写进`ScopeDefinition`并使用process-wide active scope；迁移到逻辑DataScope manifest时，normal product routing与evaluation binding resolution如何共用一个owner而不产生两套scope registry？
12. **观测开销与无扰动证明。** Observer写入、trace导出和artifact capture可能改变latency、memory或Provider timing；需要定义哪些metrics允许带observer overhead，以及是否需要paired no-observer calibration。

## 九、最终建议

G10 应采用以下 Environment 定义：

> Evaluation Environment 是对一次 attempt 所使用的已解析 Cordis Provider 图进行 requirement preflight、资源租约、状态观察和完成证明的评测模块。它不实现业务 capability，不选择 Provider，不拥有 DataScope，也不判断答案正确性。

相应的整体架构原则是：

> Data-domain Evaluation Core 驱动正常 DSH agent，引用正常 session log，复用正常 tool/approval/hook/workflow/provider路径，并把评测自身限制在可选composition、identity、evidence、environment assurance、grading和measurement。删除Evaluation后，data-agent仍是完整可运行产品；安装Evaluation后，被测agent也仍是同一种产品runtime，而不是eval-only替身。
