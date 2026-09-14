# Agent Note: 执行评分 seam——单一执行器端口、评分器组装 provenance

Status: proposed

[English](2026-09-07-execution-grader-seam.md) | 中文

## 问题

`packages/eval/` 存在两套并行的执行评分栈，而能够区分 evaluation 最需要区分的情形的那套实现却是死代码。

`packages/eval/eval/` 定义了 `CaseSqlExecutor = (sql) => Promise<ExecutionResult>`（`src/types.ts:141`），其 `ExecutionResult` 携带 `failureClass`（`src/types.ts:48-59`），用来区分*SQL 本身错误*（`syntax_error`、`guard_rejected`）与*数仓未能返回结果*（`infrastructure`、`timeout`、`patience`，`src/types.ts:28`）。`mapQueryOutcome` 把 `pending` outcome 映射为 `patience`，从而拒绝未解决的异步 query，而不是错误评分（`src/classify_failure.ts:94-102`）；`src/types.ts:139` 还逐字记录了预期的 host 接线：`ctx.query.execute` → `mapQueryOutcome` → 此处。`tests/classify_failure.spec.ts` 中约 30 条断言覆盖了这套逻辑。

全仓搜索发现，`mapQueryOutcome` 只被它自己的 module、`src/index.ts:23` export、两处文档注释和自身 spec 引用。`eval-runner` 与 `eval-cli` 从不调用它。它们使用更扁平的 `QueryExecutor` → `QueryResult`，其中只有布尔值 `success` 和字符串 `error`（`packages/eval/eval-runner/src/types.ts:225-236`），再由两个已经出现分歧的 host fork 做 normalization（`packages/eval/eval-cli/src/context.ts:227-245`、`packages/eval/eval-runner-service/src/index.ts:189-213`；前者跳过了后者执行的 column zip）。

以下三个后果直接影响 evaluation 报出的每个数字：

- **基础设施故障被计为模型失败。** `withInfraRetry` 只捕获抛出的错误（`eval-runner/src/infra_retry.ts:80-84`），但 `CtxQueryExecutor.execute` 会把一切错误捕获为 `{success:false}`（`eval-cli/src/context.ts:236-238`），因此 `eval-runner/src/runner.ts:252-255` 会把不可用的 backend 转成 `executionMatch = false` → verdict `wrong`。执行器的 infra-retry 路径永远不可达，而 `classifyInfraFailure` 仍通过字符串匹配错误文本（`infra_retry.ts:29-58`），尽管提供方已经返回类型化的 `failureKind`。
- **Provenance 在文件边界被丢弃。** `packages/eval/eval/cases/rbi-10000251-exec/` 中全部 39 个 case 都带有 `expected.sql`、`meta.anchor_ds`、`meta.tier` 和 `meta.provenance`；`EvalCaseSchema` 没有声明这些字段，zod 会剥离未知 key（`eval/src/eval_case.ts:39-44`、`:54-58`），因此对这类文件调用 `loadCase` 只会得到 `expected` key `result_value,match_mode,answer,delivery_match`，且没有 `meta`。可重放评分所需的参考 SQL 与 snapshot anchor 已经存在于磁盘，却无法从 evaluation 路径访问。
- **评分细节被丢弃。** 核心 comparator 返回一个 `AssertionResult`，其中包含 `detail` 字符串；runner 的私有 wrapper 将其压缩为布尔值（`eval-runner/src/runner.ts:368-369`），evidence row 还会被截断为五行（`:257`），因此失败评分无法解释，也无法重放。

这次分裂是偶然形成的，并非设计结果。P11b 构建了该 seam，并把 CLI/persistence 延后到 P11c（`wayfinder/data-agent/tickets/phase-4/P11b-eval-harness-hardening.md:41`、`:50`）；五天后，W3 构建了未消费该 seam 的第二个 batch runner，P11c 随后接到了 W3 的实现。没有任何 ticket 或 note 说明两者共存的理由；重复实现体现为 `runner.ts`（178 行死代码与 423 行活跃代码）、`persistence.ts`（196 行与 68 行）以及 `health-gate.ts` 与 `health_gate.ts`（116 行与 102 行），连文件命名约定也出现了分歧。

## 提案

固定执行评分 seam 的六项架构不变量，并把 package 归属延后到 Benchmark/Harness/Environment 拆分决策。

1. 模型错误、数仓故障与 judge 意见是三个独立记录的事实，任何一项都不得覆盖另一项。
2. 执行结果是主要 verdict。LLM judge 单独报告，绝不覆盖 execution mismatch。
3. 参考 SQL 执行失败属于 benchmark 基础设施故障，不是模型失败，也绝不把 candidate 计为零分。
4. 注入端口交付的是能力，不是 verdict：`{ execute(sql, signal?), attach?(instanceId) }` 返回提供方的原始 `QueryOutcome`。Evaluation 不依赖 `MaxComputeQueryEngine`，也不通过面向模型的 `query_data` rendering layer 评分。`attach` 保持可选，因此把非终态 `pending` 视为 environment-blocked 仍是 policy 选择，而不是结构上的死路。
5. `ExecutionResult` 只携带执行器观察到的内容——row、column、row count、truncation signal、实际执行的 SQL、提供方的 `failureKind`、elapsed time。评分器根据 run config 与 case 组装 snapshot identity、comparator policy id 与 version、result digest，并将其作为独立 evidence record。Snapshot 与 policy 属于绑定到 environment 的 case，不属于某次 SQL execution；把它们放进端口会迫使每个 host 在每次调用时提供。
6. Evaluation 自行观察 truncation 与 timing，而不采信提供方的声明。真实提供方把 `truncated: false` 与 `durationMs: 0` 写死（`packages/query/query-maxcompute/dev/maxc-sidecar.mjs:101`、`:103`），且不传 `--max-rows`（`:141`）。适配器自行测量 wall clock。Truncation signal `rowCount !== rows.length`——其中 `rowCount` 来自 maxc 自报的 `row_count`（`:100`）——仍是未经测试的假设；依赖它之前，必须用已知超大结果集验证。如果两者从不分歧，evaluation 就没有 truncation signal，提供方需要单独的缺陷 ticket。

### 独立重做新增（2026-09-08）

第二次 grilling session 在未阅读上述六项属性的情况下重新推导了该 seam，再进行对照。结论保留六项属性、移动一个职责边界，并新增五项属性。

**移动项。** 从 `QueryOutcome` 到可比较产物的 normalization 属于 evaluation 的纯函数，不属于 host。属性 4 原本要求每个 host 在交付结果前调用 `mapQueryOutcome`；让 host 执行 mapping 正是 adapter 产生 fork 的原因，因此端口现直接产出原始 outcome，`normalizeOutcome` 归 evaluation 所有。

7. 一次 attempt 的 execution outcome 是五成员 closed union：`pass`、`fail`、`environment-blocked`、`case-defect`、`not-measured`。`environment-blocked` 涵盖连接、凭据、限流、超时和非终态 `pending`；`case-defect` 涵盖未知或拼错的 `match_mode`、缺失或自相矛盾的 expected value，以及无法执行的参考 SQL。两者必须分开，因为补救措施不同——重跑与修复 corpus——趋势方向也相反。已发布先例支持区分两者：distilled test-suite evaluator 在 gold 无法执行时触发 assertion，而不是计零分；GradeSQL 会丢弃 execution-error candidate，而不是将其标为错误。`environment-blocked` 本身没有已发布先例，因为这些 benchmark 在本地 SQLite 上执行；这是本仓库自己的选择。
8. `not-measured` 是显式成员，不是缺失值。Judge score 绝不填补 execution dimension；只带 delivery expectation 的 case 记录 `not-measured`，而不是继承默认 `true`。
9. 每次 run 都记录 execution mode 与 comparator policy version。缺少任一项的结果都拒绝在 comparison output 中渲染，遵循的原则与缺少 `n_d` 和 p-value 时拒绝渲染 comparison 相同。
10. Grading 拆成 `normalizeOutcome(outcome)` 与 `gradeExecution(artifact, expected, policy)` 两个纯函数，中间的 artifact 作为持久化记录。这一拆分直接影响正确性：comparator-policy mutation baseline 必须离线用数十种 policy 对已存 artifact 重新评分，这要求 raw digest 与 normalized digest，而只有把 normalization 单独持久化才能保留两者。Artifact persistence 接收配置的 row cap，并保存完整 raw result 与 normalized result 的 digest，从而避免为了可重放性存储无限增长的 blob。
11. Execution corpus 重建而不是修补。按已发布标准衡量——gold 是人工编写的参考 SQL，且 gold 与 candidate 一同执行——现有 143 个 execution case 并非 benchmark case：没有一个包含参考 SQL，其 expected value 的 provenance 无法恢复，其中 86 个只断言 row count。模型不得编写或裁定 gold。Scope 与 sequencing 归 ground-truth lifecycle 决策所有，不在此处决定。

**为何必须记录 mode。** `eval-results/` 中只有四次 batch run 记录了数仓是否连接。其中相同模型、相同 `pass_k` 对相同 39 个 case 的结果，在仅 judge 模式下为 61.5%，在真实执行下为 5.1%。其余 35 次 batch run——包括每次 168-case run——完全没有 config block，因此从未有 full-corpus run 能证明实际执行过 SQL。再考虑下文所述受污染的 39-case baseline，两项历史 baseline 都不可用，T1 必须重新建立 baseline，而不是拿它们比较。

## 代价

把 runner 接到核心 seam 会产生两项行为变化，因此不能作为纯 refactor 落地。`mapQueryOutcome` 的 `zipRow` 按 column name 为 row 建 key（`eval/src/classify_failure.ts:115-124`），而 runner 的 comparator 刻意按位置使用 `col<i>` 建 key，因为 alias 会因模型与 dialect 不同而变化（`eval-runner/src/runner.ts:360-367`）；采用前者可能改变任何使用不同 alias 的 case 结果。此外，sidecar 的 wait window 默认为 60s，而 event-view query 测得 68s（`maxc-sidecar.mjs:134-140`），因此升级为 pending 的 query 会变成 `patience` refusal，从已评分分母移出，而不是继续计入。两项变化都需要记录新的 baseline。

## 考虑过的替代方案

**原地扩展 runner 的 `QueryResult`，加入 `failureClass`。** 这是最小 diff，也保留 additive-only 姿态。未采用，因为两套 normalization 与两套 failure vocabulary 会继续存在，已经导致某个 fork 产生错误 `rows` 结构的 drift 仍可能复发，而且 R1 要求的 replay evidence 仍无法访问。

**把 classifier 移植到 `eval-runner`，让核心 module 随其余死栈一同删除。** 这与现有 note 的严格解读一致：该 note 提议删除未使用的 eval-core runtime stack，并把 `dsh-eval-runner` 指定为 eval-runtime 归属。未采用，因为它会重写约 30 条 assertion 所覆盖的既有测试逻辑，却没有行为收益；还会放弃让核心模块无需 Cordis context 即可测试的 zero-seam-dep 约束。

**按照论文要求重新设计 grader。** 这一方案有吸引力，因为 comparator 的五个 `match_mode` enum 与 case schema 都不适合表达可版本化的 per-case policy。仅就 failure classifier 而言未采用，因为它是唯一已经与全部四个 benchmark 对齐且已有测试的部分；无论选择哪种方案，comparator 与 case schema 都会被替换，因此全面重写在这两处没有收益，只会失去既有 baseline 的可比性。

**把 `dsh-eval` 与 `dsh-eval-runner` 合并为一个 package。** 这一方案看似合理，因为两者之间实际使用的 import surface 只有四个 symbol。未采用，因为 dependency graph 已经干净且无环，`packages/eval/` 外部的 consumer 会区分这两层，而且 Benchmark/Harness/Environment 拆分拥有 package boundary；现在合并，之后还要在那里拆开。

## 验收标准

- 只保留一个执行器端口 `(sql) => Promise<ExecutionResult>`；删除 `QueryResult` 与两个 host fork。
- 持久化 run artifact 能区分三项事实，基础设施故障不进入 `wrong` 分母。
- 失败评分会记录失败原因：保留 comparator 的 `detail`，evidence 足以重放——实际执行的 SQL、snapshot id、policy version、raw digest 与 normalized digest。
- Truncation signal 由实测得到，不靠假设。
- Regression set 覆盖 duplicate row、NULL 与 0、float boundary、string-encoded number、column permutation、extra column、有无 `ORDER BY`、multiple accepted result、timeout、reference-SQL failure 与 single-snapshot false positive。
- 为上述两项行为变化记录新的 baseline。

## 风险

行为：“代价”中的两项变化都会改变已记录的通过率；12.8% 的真实执行 baseline 又来自同一批 39 个 case，而这些 case 的 event expectation 已知过时，因此比较基准本身已受污染，必须重新推导，不能直接信任。范围：package 归属与 case-schema ownership 被有意排除；若在实现中隐式决定，会抢先替 Benchmark/Harness/Environment 拆分做决定。顺序：让参考 SQL 可访问是前置条件，不是后续工作——loader 当前会将其丢弃。
