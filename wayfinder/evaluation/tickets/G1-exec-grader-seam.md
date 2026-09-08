# G1 — Execution grader seam

**Type**: grilling  ·  **Status**: resolved (2026-09-07)
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R1 — 执行级评分与非循环 ground truth 论文认读](R1-exec-grader-papers.md)（resolved）
**Blocks**: T1-exec-grader-impl
**Mode**: HITL
**Branch**: `grilling/G1-exec-grader-seam`

## Question

在不重建 SQL execution infra 的前提下，execution grader 应把哪一个小而稳定的 evaluation interface 放在 `packages/eval/` seam 上，使 runner 能独立重放候选 SQL、把生产 `QueryOutcome` 归一成评分输入，并将 execution verdict、judge diagnosis 与 infrastructure failure 保持为可审计的不同事实？

已锁定的上游职责不在本票重议：SQL 提交、scope routing、credentials、provider error、pending/attach/cancel 与 backend lifecycle 由 dsh-data-agent 的 `@deepseek-ai/dsh-query` capability 通过 `ctx.query.execute` 等接口拥有；evaluation 通过注入 adapter 消费该 capability，不直接依赖 `MaxComputeQueryEngine`，不经模型可见的 `query_data` rendering 层评分，也不把 transcript 中既有展示结果当作 ground truth。

本票需要与人共同决定 evaluation 自有 interface 的最小输入/输出、`QueryOutcome` 到可比较 execution artifact 的归一责任、executor 缺失和执行失败的 verdict 语义、scorer 与 persistence 的所有权，以及哪些 evidence 足以重放一次评分。决议须明确 T1 的验收面，并产出或更新一篇 `.agents/notes/proposed/testing/` Agent Note；本票不实现 provider、grader 或 case migration。

## Resolution（resolved 2026-09-07，grilling session）

**结论**：G1 只锁**架构无关**的决策（任何 Benchmark/Harness/Environment 切法下都成立），架构相关的位置性决策移交 R10 认读 → G10。理由是本票查出 benchmark 内容层与 harness 层已经纠缠（见发现 ④），而这正是 AgentCompass B/H/E 要解的病——在目标架构未知时先钉 grader 的位置，会被 G10 重切。

### 锁定的 6 条（架构无关；四套基准一致，不依赖包边界）

1. **三事实分离**：模型错 / 仓库没答 / judge 意见，三者各自独立记录，任一不得覆盖另一。
2. **execution 是主裁决**；LLM judge 单独报告，永不覆盖 execution mismatch（R1 §6）。
3. **gold/reference SQL 的执行失败 = benchmark 基础设施失败**，不是模型失败，不得给候选模型记 0 分（R1 §6）。
4. **端口保持一个函数**：`(sql) => Promise<ExecutionResult>`。host 交出 capability 而非 verdict；evaluation 不直接依赖 `MaxComputeQueryEngine`，不经模型可见的 `query_data` rendering 层评分。
5. **provenance 由 grader 装配，不由 executor 提供**（两层切法）。`ExecutionResult` 只承载 executor 真观测到的事实：rows、columns、rowCount、截断信号、实际执行的 SQL、provider `failureKind`、耗时。snapshot id、comparator policy id+version、raw/normalized digest 由 grader 从 run config + case 装配为独立 evidence 记录。理由：snapshot 与 policy 是 case+环境绑定的属性，不是一次 SQL 执行的属性；塞进端口会强迫每个 host 在每次 execute 时提供它们，把「小而稳定」的端口弄宽。
6. **截断与耗时由 evaluation 自己观测导出**，不透传 provider 声明。provider 的 `truncated` 恒 `false`、`executionMeta.durationMs` 恒 `0`（`packages/query/query-maxcompute/dev/maxc-sidecar.mjs:101`、`:103`；pending 分支 `elapsedMs: 0` 在 `:112`），而 `maxc query run --wait <N>` 不传 `--max-rows`（`:141`）。携带不可核声明的字段比携带自己的观测值更糟——反循环原则的同一条。耗时由 adapter 在调用两端量 wall-clock。**截断信号 `rowCount !== rows.length` 是待验假设，写作 T1 验收项而非前提**：`rowCount` 取自 maxc 自报的 `row_count`（`:100`），T1 须用已知超大结果集实测两者是否分叉；分叉则成立，不分叉则 eval 无截断信号，回落「透传 + 开 provider 缺陷票」。

### 移交 R10 → G10 的 3 条（架构相关，本票不裁）

- grader 与 comparator policy 落在哪个包。
- case schema 归谁拥有（`match_modes` 5 枚举 → R1 §4.2 policy object 的迁移路径）。
- `k11-v2`（168）与 `rbi-10000251-exec`（39）两套 schema 如何合流。

### 本票查出、**改写既有认知**的 4 个事实

① **两栈并存是撞车，不是设计。** P11b（`2890812409`，2026-08-20）已把 execution grader seam 设计完、实现完、测完，并把宿主接线写成规格（[P11b](../../data-agent/tickets/phase-4/P11b-eval-harness-hardening.md) `:50`：`executeSql = async (sql) => mapQueryOutcome(await ctx.query.execute({sql, scopeId}))`），且把 CLI/持久化显式 defer 给 P11c（同文件 `:41`）。5 天后 W3（`b883f4ebc3`，08-25）另建 batch runner，自带 `QueryExecutor`/`QueryResult`，未消费该 seam；P11c（`d41d1fb282`，08-26）接的是 W3 那条。**没有任何 ticket 或 note 为两栈并存给出过设计理由。** 化石证据：`runner.ts`（core 178 行死 / eval-runner 423 行活）、`persistence.ts`（196 死 / 68 活）、health gate（`health-gate.ts` 116 死 / `health_gate.ts` 102 活）——连文件名规范都分叉。

② **`mapQueryOutcome` 从未被调用。** 全仓 grep 只命中自身模块、`packages/eval/eval/src/index.ts:23` 的导出、两处文档注释、以及 `classify_failure.spec.ts`；`eval-runner` 与 `eval-cli` 均未调用。所以 `FailureClass`（`packages/eval/eval/src/types.ts:28`）+ `ENVIRONMENTAL_FAILURE_CLASSES`（`packages/eval/eval/src/classify_failure.ts:30-34`）+ pending→`patience`（同文件 `:94-102`）这套三事实分离**写好且测好（约 30 条断言），但是死的**。

③ **infra 失败当前被计为模型失败。** `withInfraRetry` 只捕获抛出的错误（`packages/eval/eval-runner/src/infra_retry.ts:80-84`），而 `CtxQueryExecutor.execute` 把一切 catch 成 `{success:false}`（`packages/eval/eval-cli/src/context.ts:236-238`），于是 `packages/eval/eval-runner/src/runner.ts:252-255` 把后端故障变成 `executionMatch = false` → verdict `wrong`。**executor 的 infra-retry 路径是死代码**，`classifyInfraFailure` 还在对错误字符串做匹配（`infra_retry.ts:29-58`），尽管 provider 已返回类型化 `failureKind`。

④ **provenance schema 已在仓里，而 loader 把它扔了（本票最重要的发现）。** `rbi-10000251-exec` 的 **39/39** case 带 `expected.sql` + `meta.anchor_ds` + `meta.tier: verified` + `meta.provenance: migrated`（rbi `schema_version: 3`）；`k11-v2` 的 **0/168** 带。实跑 `loadCase` 证明 `expected.sql`、`meta`、`schema_version` **被 zod object strip 静默丢弃**，`expected` 只剩 `result_value`/`match_mode`/`answer`/`delivery_match`。所以 R1「0 个 case 有 reference SQL」**只对 k11-v2 成立**；G1b 打算设计的 provenance schema **已经存在**，问题是 eval 路径读不到。这也是 [GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)「event 16/18 期望值与自己的 `expected.sql` 不符」长期未被发现的机制，并使 12.8% 真执行基线**本身已被污染**（该基线正测在这 39 个 case 上）。

### T1 验收面

- 单一 executor 端口 `(sql) => Promise<ExecutionResult>`；`QueryResult` 与 eval-cli / eval-runner-service 两份 fork 退役（两份 fork 的退役已由 [promote-eval-cli-adapters](../../../.agents/notes/proposed/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md) 独立提出）。
- 产物 JSON 中三事实可分辨；infra 失败**不进** `wrong` 分母。
- 比较失败原因不得压成 boolean——现 `runner.ts:368-369` 丢掉了核心比较器返回的 `AssertionResult.detail`。
- 一次评分可重放：记录实际执行的 SQL、snapshot id、policy version、raw/normalized digest；`AttemptResult.query_result` 的 5 行截断（`runner.ts:257`）不足以重放。
- 截断信号实测（见锁定第 6 条）。
- 回归集覆盖 R1 §6 清单：重复行、NULL vs 0、浮点边界、字符串数字、列排列、额外列、有/无 `ORDER BY`、多个 accepted result、超时、gold failure、单快照假阳性。
- **不得**在 T1 内做 case migration（G1b）或包边界重切（G10）。

### 遗留给后续票的 open 风险

采纳 `mapQueryOutcome` 会带来两处**行为变化，非纯重构**，T1 必须带一次 re-baseline：

- **列语义冲突**：`mapQueryOutcome` 的 `zipRow` 按列名 key（`classify_failure.ts:115-124`），而 runner 私有 `checkResultMatch` 按位置 key `col${i}`（`runner.ts:360-367`，理由写着 aliases 因模型/方言而异）。二者直接矛盾；这是 R1 §4.2 `column_semantics` 的决策点，属 R23。
- **pending → 不计分**：sidecar 等待窗口默认 60s 而 event-view 查询实测 68s（`maxc-sidecar.mjs:134-140`），超窗即 promote 成 pending，而 `mapQueryOutcome` 判 `patience` refuse。**event case 会从 `wrong` 变成不计分——分母会变。** 与 GA-EVAL-CASESET-EVENT-ANCHOR 的口径决策耦合。

第三处不属于本 seam 但同批落地时会撞上：**浮点容差是四篇论文的集体留白，且本仓已有实测回归**——case `046` 因 `67.81 ≠ 67.814`（模型加了 `ROUND`）翻案；`looseNumericEqual`（`match_modes.ts:24-30`）做了类型宽松（`"42" == 42`）但**零浮点容差**。G1 锁定第 6 条把「不透传 provider 声明」定死了，但**容差取值本身归 R23**，T1 不得顺手设一个。

### 与 GA-EVAL-CASESET-EVENT-ANCHOR 的关系（R1 要求 G1 裁定）

两票在归一化规则与 provenance 上重叠。**本票不 supersede 它**——分工是：G1 定 execution grader 的 seam 与三事实分离（**架构无关**，对任何 case set 都成立）；CASESET-EVENT-ANCHOR 定 **event case 这一类** 的评分口径（锚点不冻结时怎么办，5 个候选立场）。两者正交，可并行推进。

唯一的耦合点是上面第二条：G1 采纳 pending→`patience` 后，event case 移出计分分母，这会改变 CASESET-EVENT-ANCHOR 那 5 个立场的代价对比。**因此 CASESET-EVENT-ANCHOR 应在 T1 落地前定口径**，否则 T1 的 re-baseline 无法解释。

### 产出

- 新票 [T11 — case loader 静默丢弃 reference SQL 与 snapshot 锚点](T11-loader-provenance-strip.md)（发现 ④，阻塞 execution grading 与 G1b）。
- Agent Note [Execution grader seam: one executor port, grader-assembled provenance](../../../.agents/notes/proposed/testing/2026-09-07-execution-grader-seam.md)。
- map 变更：`additive-only` 立场改为允许重构；登记 GA-EVAL-CASESET-EVENT-ANCHOR；修正 `rbi-10000251-exec` 未被追踪的过期声明；R10 提到 T1 之前。
