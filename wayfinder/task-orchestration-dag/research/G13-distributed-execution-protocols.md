# G13 — 分布式执行协议调研：ExecutionAttempt 与 correlation

## 一页式结论

DSH 不应寻找一个“万能 ID”。成熟系统把六类事实分开：`ExecutionAttemptId` 回答“这次被准入的执行是谁”；`retryOrdinal` 只回答“这是重试链中的第几次”；`claimGeneration` 回答“当前仍被接受的持有者是哪一代”；Trace/Span/Link 只回答“观测上哪些操作相关”；authorization capability 回答“谁现在获准做什么”；idempotency key 回答“同一项外部语义效果是否已经执行”。任何一个字段都不能替代另外五个。Temporal 也区分稳定的 Activity Execution、每次 Activity Task Execution、从 1 开始的 attempt，以及只对一次 Task Execution 有效的 Task Token；W3C Trace Context 明确是传播追踪上下文，且入站字段可能被恶意伪造；OAuth bearer token 则因“持有即有权”而必须作为秘密处理。（[T1](#t1)、[T4](#t4)、[T6](#t6)、[W1](#w1)、[R1](#r1)）

第一版的持久化顺序应固定为“先记录，后行动”：同一原子提交中创建 Task claim 与 ExecutionAttempt，写入 Task/Plan 修订、唯一 Attempt ID、重试关系、fencing generation、执行器种类和权限范围；提交并 flush 成功后才能调用 adapter。外部调用前还应持久化 dispatch/effect intent、请求摘要和 idempotency key；收到执行器或外部系统确认后再记录原生执行引用；最终 settlement 必须重新校验 Attempt ID、generation、相关修订和 actor role，并把 Attempt 终态、输出/证据引用、claim 释放及 Task 状态变更放进同一提交。Temporal 的 ActivityTaskScheduled 在任务入队时已经进入持久历史，终态由完成/失败/取消事件闭合，这支持“先持久化调度意图，再交给 worker”的顺序。（[T2](#t2)、[T3](#t3)）

“没有收到结果”不能折叠成 `failed` 或 `cancelled`。若进程可能已经把请求交给执行器，或者外部副作用可能已经发生但响应或本地 settlement 丢失，应记录显式 `unknown`，至少保留未知范围、Effect ID、请求摘要、idempotency key、外部引用、最后已知阶段与 dedupe 有效期。Stripe 明确把网络中断后的服务端接收状态视为未知，并要求以同一 key、同一参数重试；Stripe 也明确要求把部分 500 结果视为 indeterminate，因为即使返回 500 仍可能产生用户可见副作用。恢复必须先查询、接收 webhook 或以同一 key 重放；当外部系统不提供查询或幂等协议、key 已过期、或者参数已改变时，自动重试应被禁止并进入人工处置。（[S1](#s1)、[S2](#s2)、[A1](#a1)）

Lease 不是 fencing。Kubernetes Lease 记录 holder、renew time、duration 和 transition count，`resourceVersion` 支持更新冲突检测；但旧 holder 即使失去 Lease，仍可能向外部资源发送迟到请求。Chubby 的完整做法是把包含 lock generation 的 sequencer 随受保护请求发送给资源服务器，由资源服务器校验并拒绝旧 generation。DSH 因此需要一个由 Task Graph Service 分配并校验的单调 `claimGeneration`；若外部目标无法校验 generation，则只能依赖目标侧 idempotency、CAS/事务或人工 reconciliation，不能宣称已被 fence。（[K1](#k1)、[K2](#k2)、[K3](#k3)、[C1](#c1)）

三种 authority 方案中，第一版应选“Host 持有 authority，adapter 通过受约束的本地调用或 IPC 代理写入”。仅显式 ID 足以做持久 correlation，却不能授权写入；持久 bearer/delegation token 能支持远程 worker，但把秘密、过期、撤销、audience、scope、轮换和泄露恢复带进 Session 数据。Host 代理方案只持久化非秘密 ID、generation、角色和原生引用，adapter 获得短寿命、操作级句柄，Host 每次写入都复核 Attempt、generation 和允许动作。真正的跨主机、离线 worker 与长期 delegation 应推迟到高级 recovery，并使用明确的 subject/actor、audience、scope、expiry、revocation 或 introspection 设计，而不是把 Attempt ID 当 token。（[R1](#r1)、[R2](#r2)、[R3](#r3)）

第一版应保证“一个 Attempt 至多有一个 durable terminal result，重复 settlement 幂等返回”和“旧 generation 不能改变当前 Task”，但不应承诺外部副作用 exactly-once。只有外部目标提供稳定 idempotency key、请求等价校验和足够长的 dedupe 保留期时，才可称为 effectively-once。自动 lease 接管、跨主机恢复、持久 delegation token、provider-specific webhook reconciliation、补偿事务、投机执行和未知结果自动裁决属于 [G23](../tickets/G23-recovery-and-external-effect-reconciliation.md) 或后续能力；第一版只需可靠记录未知、停止不安全重试，并给操作者和上层策略足够证据。

## 1. 必须分开的身份与协议字段

| 概念 | 建议字段 | 回答的问题 | 生命周期与作用域 | 不能拿来做什么 |
| --- | --- | --- | --- | --- |
| Execution identity | `ExecutionAttemptId` | 哪一次已准入执行产生了这些输入、输出、证据和原生运行引用？ | 一次 ExecutionAttempt，自 admission 到终态不变；在 Session 内永不复用，宜使用 branded opaque ID | 不能表达重试顺序、当前持有权、调用权限或外部去重 |
| Retry ordinal | `retryOrdinal`、`retryOfAttemptId` | 这次 Attempt 在同一语义重试链中排第几？ | 从 1 开始，只在一条 retry chain 内有序；并发 Attempt Group 成员仍各有唯一 Attempt ID | 不能作为全局 ID，不能作为 fencing generation；rebind、撤销或恢复可能改变 generation 而不产生语义重试 |
| Lease/fencing generation | `claimGeneration` | 此更新来自当前被接受的执行持有者吗？ | Task claim 或 Attempt execution slot 的单调代数；每次重新准入、接管或显式撤销时推进 | 不能证明外部副作用未发生；外部目标不校验时，generation 只保护 Plan DAG 写入 |
| Trace correlation | `traceId`、`spanId`、`links[]` | 哪些操作在遥测上属于同一调用链或存在因果关系？ | 每次请求、进程边界和异步工作都可变化；Link 可跨 trace | 不能授权、不能证明 Task 因果、不能代替 durable Attempt ID，也不能作为结算 CAS 条件 |
| Authorization capability | Host 内部 capability 或短寿命 scoped grant | 谁被允许对哪个 Attempt 执行哪些命令，到何时为止？ | 操作级、角色级、audience/scope/expiry 受限；可撤销或随 Host 重启失效 | 不能作为业务 identity、retry ordinal 或日志 correlation；bearer token 不能写入普通 Session 事件 |
| Idempotency key | `effectId` 对应的 provider key | 对同一外部语义效果重复提交时，目标是否复用第一次结果而非再次执行？ | 外部系统、账户、区域和保留期限定；同一语义请求跨 retry 保持不变 | 不能对整个 Attempt 粗粒度复用；一个 Attempt 有多个副作用时必须有多个 Effect ID；不能授权调用 |

Temporal 的术语说明了为何不能把“执行”和“尝试”混为一谈：Activity Execution 是一整条执行链，Activity Task Execution 是其中一次 worker 尝试；服务端每次 retry 放入一个新 Activity Task，`attempt` 从 1 开始。Task Token 只标识一次 Activity Task Execution，retry 后旧 token 可能失效；Activity ID 则标识 Activity Execution，但同一 Workflow Run 在前一 Activity 关闭后可以复用该 ID。因此 DSH 的 durable Attempt ID 应自身唯一且不复用，原生 executor ID 必须带上 provider scope，不能直接充当 Task Graph 主键。（[T1](#t1)、[T2](#t2)、[T4](#t4)、[T6](#t6)）

W3C `trace-id` 标识完整分布式 trace，`parent-id` 标识调用方所知的当前请求；OpenTelemetry `SpanContext` 跨进程传播，Span Link 表示同一或不同 trace 中的因果关联。W3C 同时要求把 trace headers 当潜在恶意输入，并指出攻击者可伪造 trace-id collision 或滥用 sampled flag。因此 trace 可以帮助检查“看起来相关”，但 explicit binding 才能证明“这个原生执行由这个 Attempt 的 adapter dispatch 产生”。（[W1](#w1)、[O1](#o1)、[O2](#o2)、[O3](#o3)）

### 建议的 durable correlation 记录

第一版不需要复制每个 executor 的状态机，只需让 Plan DAG 拥有下列关系：

- `AttemptBinding`：`attemptId`、`executorKind`、`nativeExecutionRef`、`boundAt`、`bindingAuthority=explicit`。该记录只能由完成 dispatch 的 Host adapter 写入；从 subagent lineage、workflow membership、trace 或相邻时间推断出的关系只能保存为 `observed`，不得授权、结算或验证 Task。
- `parentAttemptId`：只表示父 Attempt 明确派生的子 Attempt；原生 subagent 父子树不能反向证明 Task 因果。
- `attemptGroupId`：只表示同一 Task 上被显式准入的并发 Attempt Group；group membership 与 retry chain 是两种关系。
- `EffectRecord`：`effectId`、`attemptId`、target、operation、request digest、idempotency key、dedupe expiry、external request/object ID、phase 和 outcome。idempotency key 应绑定 Effect ID，而不是简单复用 Attempt ID。
- `TraceRef`：只保存观测引用和 Link 关系；删除、采样或重启 trace 不影响 Attempt 的 durable identity。

## 2. 成熟系统提供的可复用机制

### 2.1 Temporal：持久调度、每次尝试、取消与异步结算

Temporal 在 Workflow Task 完成时把 Command 持久化为 Event；`ActivityTaskScheduled` 写入 Event History 时，Service 才把对应 Activity Task 放入队列。Worker 返回结果后，Service 记录 `ActivityTaskCompleted`、`Failed`、`Canceled` 或 `TimedOut` 等闭合事件。活动运行和内部 retry 期间，History 可能只显示 `ActivityTaskScheduled`，`ActivityTaskStarted` 与最终事件一起写入；当前 attempt count 由 Describe API 提供。这说明“持久化语义事实”与“保留所有低层调度噪声”是两件事，但 DSH 若需要逐 Attempt 审计，就不能直接照搬 Temporal 的 History 压缩。（[T2](#t2)、[T3](#t3)、[T4](#t4)）

Temporal 明确承认 worker 可能在 Activity Function 已调用后崩溃，Service 只能等待 Start-to-Close timeout 并按 policy retry。因而一次外部调用可能已经生效，但完成回报没有进入 durable history。Task Token 可用于异步完成和 heartbeat，但它绑定一次 Activity Task Execution，retry 后可能失效；对长期外部过程，Temporal 建议改用 Namespace/Workflow/Activity ID 组合，或由外部系统通过 Signal/轮询返回结果。这支持 DSH 同时保留稳定 Attempt identity、短寿命 dispatch capability 和外部系统自己的 durable reference。（[T1](#t1)、[T5](#t5)、[T6](#t6)）

Temporal 的 cancellation 也是请求与终态分离：Activity 只有 heartbeat 才能收到服务端 cancellation，可以接受或忽略；Workflow 可以选择等待 cancellation 被接受，也可以立即继续。DSH 因此必须至少区分 `cancelRequested`、`cancelObserved/acknowledged` 与终态 `cancelled`；请求取消不能直接证明 worker 已停止，也不能证明外部副作用未发生。（[T1](#t1)）

### 2.2 Kubernetes 与 Chubby：lease、CAS 与真正的 fencing

Kubernetes Lease 是协调记录，核心字段包括 `holderIdentity`、`leaseDurationSeconds`、`acquireTime`、`renewTime` 和 `leaseTransitions`。Kubernetes API 的 `metadata.resourceVersion` 可用于 optimistic concurrency，更新者把读取到的版本原样带回，冲突时由 API server 拒绝旧写入。该机制可以保护 Lease 对象本身不被旧快照覆盖，但 `resourceVersion` 会随对象任意修改变化，`leaseTransitions` 也只是 holder 变化计数；它们都不会自动阻止旧 holder 对另一个外部系统执行迟到写入。（[K1](#k1)、[K2](#k2)、[K3](#k3)、[K4](#k4)）

Chubby 直接处理这一缺口：lock holder 获取包含 lock name、mode 和 lock generation 的 opaque sequencer，把它随受保护请求交给文件服务器等资源端；资源端检查 sequencer 是否仍有效以及 mode 是否匹配，旧 generation 的请求被拒绝。论文同时把 lock-delay 称为不支持 sequencer 时的“不完美”缓解。这是 DSH fencing 的关键限定：generation 必须在接受写入的一端被校验；只有 Host 校验时，它只 fence Plan DAG settlement，不能 fence Stripe、数据库或 shell 已经执行的外部效果。（[C1](#c1)）

### 2.3 W3C Trace Context 与 OpenTelemetry：因果观测，不是业务权威

OpenTelemetry Context 是跨 API 边界和逻辑 execution unit 传播 execution-scoped values 的不可变容器；Propagator 把 Context 注入和提取到跨进程 carrier。Span Link 可表达异步、批处理、scatter/gather 或跨 trust boundary 后新 trace 与旧 trace 的因果关系。适合 DSH 的用法是：每个 Attempt 建立自己的 span；retry 建立新 span，并以 Link 指向前一次 Attempt span；父子 Attempt 可使用 parent 或 Link，取决于是否存在严格单父调用关系。（[O1](#o1)、[O2](#o2)、[O3](#o3)）

Trace 数据可以被采样、丢弃、重启、恶意输入或由不同 vendor 改写。它适合作为 inspector 和诊断索引，不适合作为 session replay 的唯一关联，也不适合作为工具调用、completion 或 cancellation 的授权条件。（[W1](#w1)）

### 2.4 Stripe 与 AWS：外部副作用的幂等与未知结果

Stripe 对同一 idempotency key 保存第一次已经开始执行的请求之状态码和响应体，包括 500；同一 key 的后续请求返回同一结果，并比较参数以拒绝误用。未进入 endpoint execution 的校验失败或并发冲突不会保存结果。key 至少保留 24 小时，过期清除后再用会成为新请求。由此得到三个 DSH 规则：先持久化 key 和 request digest；语义相同的 retry 必须复用 key 与参数；dedupe 窗口过期后不能继续宣称安全重放。（[S1](#s1)）

Stripe 进一步把网络错误后的“服务端是否收到请求”定义为未知，要求以同一 key 和参数重试直到得到确定响应；但 500 即使被 idempotency layer 缓存仍应视为 indeterminate，因为可能已有部分副作用，后续 reconciliation 还可能通过 webhook 暴露新对象。Stripe 建议把本地 ID 放入外部对象 metadata，以便迟到 webhook 与本地状态对账。这直接支持 DSH 的 `unknownExternalOutcome`、外部引用和 webhook/query reconciliation，而不是把 500 直接记为失败。（[S2](#s2)）

AWS EC2 的 client token 同样把 token 与参数绑定：相同 token、相同参数的 retry 不重复执行；相同 token、不同参数返回 `IdempotentParameterMismatch`。其幂等作用域可能是 Region 或 Availability Zone，说明 idempotency key 的唯一性从来不是无限全局的，DSH 必须记录 provider、account/region scope 和保留期。（[A1](#a1)）

## 3. Admission、dispatch 与 settlement 的持久化顺序

| 阶段 | 必须先持久化的事实 | 随后才允许的动作 | 崩溃后的解释 |
| --- | --- | --- | --- |
| Admission | 在同一原子提交中校验 readiness、Task/Plan revision、并发策略和 actor role；创建 claim、Attempt ID、retry lineage/group、`claimGeneration`、executor kind 与预算占用 | 向 Agent、subagent、workflow、tool 或外部 adapter 发任何消息 | 有 Attempt 而无 dispatch intent：未向外发送，可在重验证后安全 dispatch；没有持久 Attempt：不得根据日志或 trace 猜测执行已获准 |
| Dispatch preparation | 写入 `dispatchPrepared`，包括 adapter、输入/请求摘要、外部 Effect ID、idempotency key、dedupe expiry、trace refs 和预期 generation，并 flush | 调用 adapter 或外部 API | `dispatchPrepared` 无 receipt：交付结果未知；先按 Attempt ID/Effect ID 查询或以同 key 做幂等重放，不能直接创建新 Attempt 或新 key |
| Dispatch acceptance | 记录 adapter 返回的 typed `nativeExecutionRef`、实际 executor identity、accepted timestamp；若 adapter 只能同步完成，可直接进入 settlement proposal | 接受 executor progress、output、evidence 和 cancellation acknowledgement | 有 native ref：按 provider 查询；无 ref 但调用可能已越过进程边界：保持 `dispatchUnknown` |
| Cancellation | 先记录 `cancelRequested`、reason、requester 和时间；需要撤销写 authority 时推进 generation，并为旧执行保留只读 late-observation 通道 | 调用原生 cancel；等待或不等待由 policy 决定 | cancellation 发送失败或 Host 崩溃：状态仍是 requested；不能写成 cancelled；迟到 completion 只能作为 observation 或 reconciliation 输入 |
| Settlement | Host 校验 Attempt ID、generation、Task/Plan revision、actor role、group policy、输出和证据；原子写 Attempt 终态、output/evidence refs、claim 释放和 Task/verification 转移，并 flush | 向 executor 或调用者确认 settlement 成功 | ack 丢失时，同一 settlement 可按 Attempt ID + generation 幂等重放；不同终态或旧 generation 返回 conflict，不覆盖已提交结果 |

任何跨本地事务与外部系统的动作都有一个无法靠普通双写消除的窗口：外部系统已执行，而本地结果尚未持久化。第一版应把这个事实暴露出来，而不是伪造原子性。建议的最小记录是：

- `unknownScope`: `dispatch`、`externalEffect` 或 `settlementAck`；
- `lastDurablePhase` 与 `unknownSince`；
- `attemptId`、`claimGeneration`、`effectId`；
- request digest、idempotency key、provider scope 与 dedupe expiry；
- 已知 native execution/request/object reference；
- `retrySafety`: `safeSameKey`、`queryFirst`、`manualOnly`；
- 后续 reconciliation observation 及其来源。

恢复顺序应是“确认事实，再决定重试”：先查询 native executor 或外部 provider；再消费可验证的 webhook/receipt；仍未知且 provider 的幂等窗口有效时，以同一 key、同一参数重放；确认原请求未发生后才允许新 Effect；不支持查询/幂等、参数发生变化或 dedupe 已过期时进入 Hold 与人工处置。新的 retry Attempt 可以拥有新 Attempt ID 和更高 `retryOrdinal`，但同一外部 Effect 的 idempotency key 必须保持不变，直到该 Effect 被明确 supersede。

## 4. 三类 authority 方案比较

| 方案 | 优点 | 主要失败模式 | 恢复与撤销 | DSH 结论 |
| --- | --- | --- | --- | --- |
| 仅显式 ID | 简单、可审计、易持久化；适合 Task、Attempt、Effect、executor ref 与 trace ref 的 correlation | 知道 ID 的调用者若可直接写服务，就可能伪造 progress、completion 或 cancellation；ID 本身没有权限语义 | 依赖独立的调用者认证、role check、revision CAS 和 generation fencing | **必须采用作 identity，但绝不能单独承担 authority** |
| 持久 bearer/delegation token | 可跨主机、离线进程和多跳服务携带范围化权限；RFC 8693 可表达 subject、current actor 与 delegation chain | bearer 泄露即可重放；Session 备份、日志、模型上下文和调试导出都会扩大秘密暴露；expiry/revocation 可能让长期恢复失效；token identity 容易被误当 execution identity | 需要加密存储、audience/scope/expiry、轮换、撤销、introspection、泄露响应，并明确 impersonation 与 delegation | **第一版不采用；仅在远程 worker 成为硬需求时设计**（[R1](#r1)、[R2](#r2)、[R3](#r3)） |
| Host 持有 authority，adapter 代理写入 | Session 只保存非秘密 correlation；Task Graph Service 统一校验 role、Attempt、revision 与 generation；adapter 无法绕过状态机；Host 可把进程内对象、继承句柄或已认证 IPC channel 限定到具体 Attempt 和动作 | Host/IPC 是信任与可用性集中点；Host 崩溃后旧 ephemeral handle 失效；远程、长时间离线执行需要额外协议 | 重启后从 durable Attempt 重建 binding，重新签发短寿命 handle；旧 generation 写入被拒，迟到结果仍可作为非权威 observation 保存 | **第一版首选；跨进程 adapter 只提交原始 observation，由 Host 生成权威事件** |

RFC 6750 对 bearer token 的定义是任何持有者都可使用关联权限，且不需要证明持有密码学密钥，因此 token 在存储和传输中都必须保密。RFC 8693 又区分 impersonation 与 delegation，并用 subject/actor 表达授权链；RFC 7662 的 active 状态还取决于过期、撤销和授权上下文。这些机制适合真正的远程授权，不适合为了方便 correlation 而加入第一版 durable Session 数据。（[R1](#r1)、[R2](#r2)、[R3](#r3)）

## 5. DSH Plan DAG 第一版的最小原则

1. **一个 Attempt 一个不可复用 identity。** `ExecutionAttemptId` 在 admission 时生成；所有 current-Agent 输入、skill invocation、tool call、subagent/workflow run、output、evidence、cancel 与 settlement 都通过显式 binding 指向它。
2. **retry 是新 Attempt，不是改写旧 Attempt。** 新 Attempt 记录 `retryOfAttemptId` 和 1-based `retryOrdinal`；旧 Attempt 保留终态。Attempt Group 成员关系与 retry chain 分开。
3. **claim 使用独立 generation。** Task Graph Service 在 admission、接管或 authority revoke 时推进 `claimGeneration`；所有权威写入必须比较 generation。generation 不从 retry ordinal、Plan revision、trace ID 或存储 `resourceVersion` 推导。
4. **admission 与 claim 原子提交并先于 dispatch。** 未 flush 的 Attempt 不得产生执行；dispatch/effect intent 先于跨进程或外部调用。
5. **Host 独占状态变更 authority。** Adapter 只能通过 Attempt-scoped 调用或 IPC 提交 observation、native ref、output、evidence 和 settlement proposal；Host 负责 role、revision、generation 与状态迁移校验。Session 不保存 bearer token。
6. **显式 correlation 才有因果权威。** 只有在 dispatch 路径中创建的 `AttemptBinding` 可以授权或结算；trace、时间邻近、subagent lineage 和 workflow membership 只用于标记为 non-authoritative 的观测增强。
7. **取消是协议，不是布尔终态。** 至少记录 requested 与 terminal cancelled；取消后的迟到结果不得静默丢弃，也不得绕过 generation 完成 Task。
8. **settlement 是幂等 CAS。** 相同 Attempt、generation 和相同 outcome 的重复提交返回既有结果；不同 outcome、旧 generation 或 stale revision 明确冲突。Attempt 终态、claim 释放、输出/证据和 Task 转移在一个提交中完成。
9. **外部副作用按 Effect 建模。** 每个 Effect 在调用前持久化 request digest、provider scope、idempotency key 和 dedupe expiry；同一 Effect 的 retry 复用 key，不同 Effect 不共享 key。没有目标侧幂等或查询能力时，自动 retry 默认关闭。
10. **未知结果是一等状态。** `unknown` 保留最后已知阶段和 reconciliation 材料，并阻止依赖该结果的自动完成或重复副作用；操作者可选择确认成功、确认失败、以同 key 重放、补偿或 supersede。
11. **只承诺本地单一终态与幂等 settlement。** 第一版保证 Plan DAG 对当前 generation 的 Attempt 至多接受一个 durable terminal result，重复提交返回既有结果；外部效果只在 provider 协议满足时称 effectively-once，不宣称通用 exactly-once。
12. **模型可见信息必须可 replay。** Attempt binding、状态、输出、证据、取消、未知结果和 reconciliation 决定都进入 required session events；trace 只作附加索引。

## 6. 延后到高级 recovery 的机制

下列内容应由 [G23](../tickets/G23-recovery-and-external-effect-reconciliation.md) 或相关后续票承担，而不是阻塞第一版：

- 跨 Host 的 lease renewal、failure detector、自动接管和 clock-skew 策略；
- 外部资源能验证的 fencing token 端到端传播；
- 持久 OAuth/token-exchange delegation、proof-of-possession、token rotation、revocation 与 introspection；
- provider-specific status query、webhook ingestion、receipt 验证和自动 reconciliation registry；
- transactional outbox/inbox、消息 broker 去重及跨数据库提交协议；
- 多步骤 saga、补偿操作、反向恢复和部分成功策略；
- speculative/hedged execution、并发赢家选择与 loser cancellation；
- 跨 Session/跨主机 worker adoption、长期离线执行与 token re-issuance；
- dedupe 窗口过期后的自动事实发现；
- 把 Attempt/Effect 历史抽取到独立 Execution Ledger。

## 7. 建议采用 / 不采用

### 建议采用

- branded `ExecutionAttemptId`、独立 1-based `retryOrdinal`、显式 `retryOfAttemptId`；
- 每个 Task claim 的单调 `claimGeneration`，由 Task Graph Service 在每次权威写入时校验；
- admission/claim 原子提交并 flush 后 dispatch；外部调用前持久化 dispatch/effect intent；
- Host-held authority 与 Attempt-scoped adapter proxy；Session 中只保存非秘密 correlation；
- typed `nativeExecutionRef` 与明确 `AttemptBinding`；heuristic correlation 永远标记 non-authoritative；
- `cancelRequested` 与 terminal `cancelled` 分离，保留迟到 observation；
- settlement 的幂等 CAS，以及 Attempt 终态、Task 转移、输出/证据、claim 释放的单提交；
- 每个外部 Effect 独立的 idempotency key、request digest、provider scope 和 dedupe expiry；
- `unknownDispatch` / `unknownExternalOutcome` 或等价的一等状态，以及 query-first/manual-safe 恢复；
- 每次 Attempt 一个 span，retry 和异步派生使用 OpenTelemetry Link；trace 只作观测索引。

### 不采用

- 用 Task ID、retry ordinal、trace ID、span ID、Activity/native run ID 或 idempotency key 替代 ExecutionAttemptId；
- 用 retry ordinal、Plan revision、Kubernetes `leaseTransitions` 或普通时间戳替代 fencing generation；
- 仅凭持有 Lease 就假定旧 worker 无法写外部资源；
- 把 `traceparent`、Baggage、模型输出、UI 状态或 executor 自报身份当成 authorization；
- 把 durable bearer/delegation token 写入 Session JSONL、事件 payload、日志、trace 或模型上下文；
- crash/timeout/断网后生成新 idempotency key 并盲目重试；
- 把网络无响应、500、取消已请求或 worker 失联直接归类为失败或已取消；
- 在外部目标没有 idempotency、CAS、事务或可查询状态时承诺 exactly-once；
- 从 subagent lineage、workflow membership、时间邻近或 trace 自动推断权威 Task causality；
- 第一版实现跨主机自动接管、通用补偿事务或完整 provider reconciliation。

## 来源

以下来源均为官方文档、正式规范、官方源码或论文原文，访问日期均为 **2026-09-12**。

<a id="t1"></a>**T1.** Temporal, [Activity Execution](https://docs.temporal.io/activity-execution)：Activity Execution、Activity ID、cancellation、async completion 与 Task Token。

<a id="t2"></a>**T2.** Temporal, [Tasks](https://docs.temporal.io/tasks)：Activity Task 是一次 attempt；Scheduled、Started 与 closed events 的对应关系。

<a id="t3"></a>**T3.** Temporal, [Events and Event History](https://docs.temporal.io/workflow-execution/event)：Event History 的 durable append、Activity scheduling 与 retry event 顺序。

<a id="t4"></a>**T4.** Temporal, [Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies)：默认 Activity retry、每次 retry 新 Activity Task、attempt 与 History 压缩。

<a id="t5"></a>**T5.** Temporal TypeScript SDK, [Asynchronous Activity](https://docs.temporal.io/develop/typescript/activities/asynchronous-activity)：Task Token 或 Namespace/Workflow/Activity ID 的异步完成方式。

<a id="t6"></a>**T6.** Temporal API source, [`request_response.proto` at `2af5c1d`](https://github.com/temporalio/api/blob/2af5c1dea2577eb478ba4e7a7991a16b8f74e1c5/temporal/api/workflowservice/v1/request_response.proto)：`PollActivityTaskQueueResponse.attempt` 从 1 开始，以及 heartbeat/completed/failed/canceled 请求的 Task Token correlation。

<a id="k1"></a>**K1.** Kubernetes, [Leases](https://kubernetes.io/docs/concepts/architecture/leases/)；对应文档源码固定于 [`77901ee`](https://github.com/kubernetes/website/blob/77901ee738190ee6248a22b010858bb5f6743fa2/content/en/docs/concepts/architecture/leases.md)：Lease 的 heartbeat、leader election 与 workload 用途。

<a id="k2"></a>**K2.** Kubernetes, [API concepts — Resource versions](https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions)；对应文档源码固定于 [`77901ee`](https://github.com/kubernetes/website/blob/77901ee738190ee6248a22b010858bb5f6743fa2/content/en/docs/reference/using-api/api-concepts.md#resource-versions)：resourceVersion 的变更检测、一致性与 optimistic concurrency 用法。

<a id="k3"></a>**K3.** Kubernetes API source, [`coordination/v1/types.go` at `c880951`](https://github.com/kubernetes/api/blob/c880951023d0425c1a0c98a6becd9dad38ebf16b/coordination/v1/types.go)：LeaseSpec 的 holder、duration、acquire/renew time 与 transition 字段。

<a id="k4"></a>**K4.** Kubernetes apimachinery source, [`meta/v1/types.go` at `30eb14c`](https://github.com/kubernetes/apimachinery/blob/30eb14c6ca0263aca6183b243890c979969ac585/pkg/apis/meta/v1/types.go)：ObjectMeta `resourceVersion` 的 optimistic concurrency 与传回服务端语义。

<a id="c1"></a>**C1.** Mike Burrows, Google, [The Chubby Lock Service for Loosely-Coupled Distributed Systems](https://research.google.com/archive/chubby-osdi06.pdf), OSDI 2006：lock generation、sequencer、资源端校验与 lock-delay 的限制。

<a id="w1"></a>**W1.** W3C Recommendation, [Trace Context Level 1](https://www.w3.org/TR/trace-context/)：`trace-id`、`parent-id`、传播、隐私与恶意 header/trace-id collision 风险。

<a id="o1"></a>**O1.** OpenTelemetry Specification, [Overview — SpanContext and Links at `5507eb5`](https://github.com/open-telemetry/opentelemetry-specification/blob/5507eb587b3b3500ccd681e816e7c26729f38aa0/specification/overview.md#spancontext)：TraceId、SpanId、跨 trace Link 与异步关系。

<a id="o2"></a>**O2.** OpenTelemetry Specification, [Context at `5507eb5`](https://github.com/open-telemetry/opentelemetry-specification/blob/5507eb587b3b3500ccd681e816e7c26729f38aa0/specification/context/README.md)：不可变 Context 与 execution-scoped value 传播。

<a id="o3"></a>**O3.** OpenTelemetry Specification, [Propagators API at `5507eb5`](https://github.com/open-telemetry/opentelemetry-specification/blob/5507eb587b3b3500ccd681e816e7c26729f38aa0/specification/context/api-propagators.md)：跨进程 carrier 的 inject/extract；另见 [Trace API Link](https://github.com/open-telemetry/opentelemetry-specification/blob/5507eb587b3b3500ccd681e816e7c26729f38aa0/specification/trace/api.md#link)。

<a id="s1"></a>**S1.** Stripe API Reference, [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)：首次结果缓存、同 key 参数比较、500 replay 与 24 小时保留。

<a id="s2"></a>**S2.** Stripe, [Advanced error handling](https://docs.stripe.com/error-low-level)：网络未知结果、同 key 重试、500 indeterminate、webhook 与本地 metadata reconciliation。

<a id="a1"></a>**A1.** Amazon EC2 Developer Guide, [Ensuring idempotency in Amazon EC2 API requests](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html)：client token、参数不匹配错误及 regional/zonal idempotency scope。

<a id="r1"></a>**R1.** IETF RFC 6750, [OAuth 2.0 Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html)：持有即授权、存储与传输保护、replay 与 token lifetime。

<a id="r2"></a>**R2.** IETF RFC 8693, [OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html)：delegation 与 impersonation、subject token、actor token 和 `act` chain。

<a id="r3"></a>**R3.** IETF RFC 7662, [OAuth 2.0 Token Introspection](https://www.rfc-editor.org/rfc/rfc7662.html)：active、expiry、revocation、scope 与 introspection 的实时性权衡。
