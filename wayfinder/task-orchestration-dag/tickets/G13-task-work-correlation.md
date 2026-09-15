# G13 — ExecutionAttempt and correlation protocol

**Type**: grilling
**Status**: claimed 2026-09-15
**Blocked by**: [G12 Plan DAG ownership boundary](G12-task-graph-authority.md) ✅
**Blocks**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G17 Executor adapters](G17-native-source-adapters.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)

## Question

How does one Task ExecutionAttempt bind durably to the current Agent, tool calls, skills, subagent runs, workflow runs, output references, verification evidence, and external effects?

Under G12, admission atomically creates a claim and Attempt; Task, Attempt, and Plan revisions are layered; a Task defaults to one active Attempt but may declare an Attempt Group. Define branded identities, admission and settlement commit points, concrete executor binding, actor authority, parent/child Attempts, group membership, retry numbering, output and evidence references, cancellation, interruption, unknown external outcomes, and the difference between causal correlation and observational inference.

Native subagent lineage and workflow membership do not prove Task causality. A heuristic may enrich display only when marked non-authoritative; it must never authorize execution or completion.
## Comments

- 2026-09-15：用户确认采用“执行上下文强制”。普通用户轮次可以执行明确的非 Plan 工作，但其结果不得推进、举证、验证或结算 Task；进入携带有效 `task-attempt` 上下文的 Attempt 后，工具必须在执行前绑定，subagent/workflow 必须经 Plan executor adapter 派发，未建立权威关联的旁路调用由 Host guard 拒绝。

- 2026-09-15：用户确认采用“Host 代理提交”。worker 不直接写 Task Graph，也不持有持久委托凭证；executor adapter 通过 Host 命令接口提交进度、输出、证据、失败观察和完成或 replan 提案，Host 每次按 Attempt、Claim generation、相关修订和 actor role 重新鉴权。跨主机长期委托留给后续跨 Session、多 Agent 调度协议。

- 2026-09-15：用户确认采用独立 `ExecutionBinding` 实体。`ExecutionAttempt` 仅保存任务级执行承诺和生命周期；Agent turn、工具调用、skill、subagent、workflow 与外部 effect 分别以带品牌的 Binding 记录。Binding 仍由 Task Graph 拥有，以完整实体值写入 required Session 事件和 Host projection，不抽取独立 Execution Ledger。

- 2026-09-15：用户确认采用“单一因果所有权”。一个 native execution 最多由一个 Attempt 的 causal Binding 权威拥有；其他 Task 通过 `OutputRefId` 和依赖复用产物，或添加不授予取消、预算、结算与完成权限的 observational link。跨 Attempt 共享执行与自动去重仅在后续评估证明重复成本显著时进入高级路由决策。

- 2026-09-15：用户确认采用一等 `OutputRef` 与 `EvidenceRecord`。Task Graph 统一拥有输出身份、生产来源、可用性和接受标准证据关系，但不复制大型数据内容，也不接管数据库、文件、workflow artifact 或 subagent 输出的原生生命周期；模型实际看到的内容仍由 Session 日志重建。

- 2026-09-15：用户确认采用正交生命周期模型。Attempt phase/outcome、Binding phase/outcome、控制请求、验证状态和 external effect certainty 分别记录；首版实现必要闭合枚举、取消请求与确认分离、验证前后分离、`unknown` effect 的 reconciliation Hold 及危险重试阻断。自动核对、补偿和跨进程恢复留给外部效果恢复 Follow-up。

- 2026-09-15：用户确认采用“准入后语义固定的 Attempt”。每次任务级重新准入或语义重试创建新的 `ExecutionAttemptId` 和 Task 内单调 `attemptNo`，并用 `retryOfAttemptId` 记录关系；同一有效 Claim 内的多轮 Agent step、工具调用、局部修正及同请求、同幂等身份的 executor 内部重试保留在原 Attempt，内部重试仅递增 Binding 的 `nativeAttemptOrdinal`。未知外部结果禁止自动重放。

- 2026-09-15：用户确认采用正交的类型化关系，不发布通用 `parentAttemptId`。Task scheduling 使用 DAG dependency，语义重试使用 `retryOfAttemptId`，动态建图来源记录为 Plan mutation provenance，同 Task 并发保留 `AttemptGroupId`，executor 嵌套使用 `parentBindingId`；任何关系都不隐含权限、取消或完成传播。第一版保留 Attempt Group 身份但显式拒绝实际 group admission。

- 2026-09-15：用户确认对权威与观察关联实行类型级隔离。`ExecutionBinding` 仅表示经 Host/adapter 验证的 causal relation，可参与执行、取消、预算、输出、证据与结算；`ExecutionObservation` 仅承载 trace、原生 lineage、时间邻近等诊断线索，不得自动提权。只有重新验证已持久化 dispatch intent 的 adapter 才能创建或完成正式 Binding。

- 2026-09-15：用户确认采用“语义耐久性屏障”。任何模型请求、原生执行或外部副作用开始前，其 admission、Binding 或 effect intent 必须已被成功 flush 覆盖；首版可逐操作 flush，公共协议不固定 flush 次数，后续可在保持 `durableThroughSeq >= intentSeq` 不变量下安全批处理。Settlement 也必须在对外宣布完成或解除下游依赖前持久化。

- 2026-09-15：用户确认一个当前 Agent turn 只绑定一个 Attempt。Task DAG driver 使用专有 `task-attempt` MessageSource 和 MessageId 建立唯一 AgentTurnBinding；该 turn 内工具、skill、subagent 与 workflow 各自建立 Binding 并继承同一 Attempt 上下文。系统级并发由其他 executor lane 提供，多 Attempt batch turn 仅在实测 token/延迟收益成立时进入高级路由 Follow-up。

- 2026-09-15：用户确认采用闭合的核心角色—命令矩阵。`user`、`orchestrator`、`worker`、`executor-adapter`、`verifier` 和 `driver` 只能提交各自允许的 typed commands，Task Graph Service 是唯一状态提交者；角色按命令上下文授予，不是 Agent 的永久属性，也不是 bearer credential。未知角色、未知命令和越权调用 fail closed。

- 2026-09-15：用户确认采用一等 `ExternalEffect`。外部语义操作拥有跨 Attempt 稳定的 `ExternalEffectId`，每次具体派发仍由单一 Attempt 的 `ExecutionBinding` 拥有；相同 target、canonical request digest、write scope、approval scope 与 provider idempotency scope 才能复用 effect identity，参数变化创建新 effect。首版记录 `pending | confirmed | rejected | unknown` 并在 unknown 时阻止重试，自动核对与补偿留给恢复 Follow-up。

- 2026-09-15：用户确认采用 Host 注入执行上下文。`ExecutionTicket` 由 Host 从已提交的 Attempt、Claim 和 revisions 构造；当前 Agent 通过 `task-attempt` MessageSource 绑定，工具从执行管线上下文继承，跨进程请求由可信 adapter 显式序列化。模型只提交业务参数，模型生成或回显的 Attempt/Claim ID 不构成授权。

- 2026-09-15：用户确认每个 Attempt 采用唯一根执行器。admission 确定 `executorKind`，dispatch 创建唯一 `primaryBindingId`；工具、subagent、workflow 和 external effect 通过 `parentBindingId` 成为明确子执行，skill 仅作为方法引用。子 Binding 不单独结算 Attempt，多根并行只由未来 Attempt Group 协议承载。

- 2026-09-15 session checkpoint：G13 保持 claimed。下一会话从已确认决策继续，收敛 branded identity 与各 executor reference 的精确字段、取消与迟到结果规则、以及 admission/settlement 命令和状态转换表；不重新讨论以上选择，除非后续一致性检查发现矛盾。
