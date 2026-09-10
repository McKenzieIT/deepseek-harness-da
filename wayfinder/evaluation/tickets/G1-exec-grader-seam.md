# G1 — Execution grader seam

**Type**: grilling  ·  **Status**: **resolved —— v1 (2026-09-07) 与 v3 (2026-09-08) 已合并**
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R1 — 执行级评分与非循环 ground truth 论文认读](R1-exec-grader-papers.md)（v3 重做中，同会话）
**Blocks**: T1-exec-grader-impl
**Mode**: HITL
**Branch**: v3 `grilling/R1-G1-v3-independent`（现行，已并入 v1 分支 `grilling/G1-exec-grader-seam`）

## Question

在不重建 SQL execution infra 的前提下，execution grader 应把哪一个小而稳定的 evaluation interface 放在 `packages/eval/` seam 上，使 runner 能独立重放候选 SQL、把生产 `QueryOutcome` 归一成评分输入，并将 execution verdict、judge diagnosis 与 infrastructure failure 保持为可审计的不同事实？

已锁定的上游职责不在本票重议：SQL 提交、scope routing、credentials、provider error、pending/attach/cancel 与 backend lifecycle 由 dsh-data-agent 的 `@deepseek-ai/dsh-query` capability 通过 `ctx.query.execute` 等接口拥有；evaluation 通过注入 adapter 消费该 capability，不直接依赖 `MaxComputeQueryEngine`，不经模型可见的 `query_data` rendering 层评分，也不把 transcript 中既有展示结果当作 ground truth。

本票需要与人共同决定 evaluation 自有 interface 的最小输入/输出、`QueryOutcome` 到可比较 execution artifact 的归一责任、executor 缺失和执行失败的 verdict 语义、scorer 与 persistence 的所有权，以及哪些 evidence 足以重放一次评分。决议须明确 T1 的验收面，并产出或更新一篇 `.agents/notes/proposed/testing/` Agent Note；本票不实现 provider、grader 或 case migration。

---

## 决议（逐轮追加，v3 独立重做）

证据基础：[R1 v3 研究笔记](../research/exec-grader-papers-v3.md)。本轮 grilling 在**未读 v1 的 G1 决议**的前提下进行，逐条定后再与 v1 对账。

### D1 — 一次 case 尝试的结局分四类

**决定**：尝试结局区分四个事实，不得相互压缩：

| 结局 | 含义 | 归因 | 后续动作 |
|---|---|---|---|
| `pass` | 候选结果与 ground truth 匹配 | 模型 | — |
| `fail` | 候选真的答错（含候选 SQL 自身执行报错） | 模型 | — |
| `environment-blocked` | 环境不能给出结论：连不上、凭证、限流、超时、**仓库返回非终态 `pending`** | 环境 | 重跑可能自消 |
| `case-defect` | case 自身坏了：`match_mode` 拼错或未知、expected 缺失/不自洽、ground truth 不可执行 | 语料 | 必须人修，不得靠重跑掩盖 |

**为何不是三分**：`environment-blocked` 与 `case-defect` 的**行动不同**（重跑 vs 修语料），且趋势意义相反：前者降下去是环境变好，后者降下去可能是把坏 case 隐掉了。合为一类会丢掉这个区分。

**一手先例（验证于官方评测器源码与论文原文）**：

- **case-defect 必须炸开**：test-suite `exec_eval.py:227` 对不可执行的 gold 用 `assert g_flag != 'exception'` 直接中止评测，**而非记 0**。
- **执行报错可丢弃而非记错**：GradeSQL（2606.30851 Stage 2）“Queries that raise execution errors are discarded”。
- **反面先例**：BIRD `execute_model` 对 `FunctionTimedOut` 与其他异常统一 `res = 0`（记答错）——但它跑本地 SQLite，执行瞬时确定，超时即“SQL 写得太差”。

**边界声明**：`environment-blocked` 在已发表工作里**无先例**——三个基准均在本地 SQLite 上执行 gold 与候选，不存在远端数仓的 `pending`、实例 id、凭证与限流。这一类是本仓场景特有的选择，Agent Note 与代码注释均须写明它不是抄来的。（Northcutt 的 U 集合排除机制本轮**未验证**，不引为依据。）

**当前行为的差距**（均已定位到行，详见 R1 v3 §4.4、§7.3）：`pending` → `success:false` → `execution_match=false` → verdict `wrong`；未知 `match_mode` → `{status:'fail'}` → 同样落 `wrong`。二者当前都被计入模型分母。

### D2 — 一能力一实现；包边界不在本票动

证据：[R24 — eval 包级合并可行性](../research/eval-package-consolidation.md)。

**决定**：`packages/eval/` 内**每种能力只得有一份实现**。T1 的验收包含以下去分叉项，每项的验收信号是“该符号在仓内只剩一个定义”：

| 去分叉项 | 当前 | T1 后 |
|---|---|---|
| 批量运行 | `eval/src/runner.ts:99` 与 `eval-runner/src/runner.ts:49` 两份 `runBatch` | 一份 |
| health gate | `eval/src/health-gate.ts` 与 `eval-runner/src/health_gate.ts` | 一份 |
| 结果比较 | 库实现 + `eval-runner/src/runner.ts:358` 私有包装器 | 一份（包装器三行为要么并入库实现并补测，要么删除） |
| adapter 四件套 | `eval-cli/src/context.ts` 与 `eval-runner-service/src/index.ts` 各一份且**已行为分叉** | 一套，保留 `eval-cli` 侧的增强（reasoning 提取、event-def 预取、query expansion） |
| 失败分类 | `eval/src/classify_failure.ts` 无人调用 | 真接入判分路径，服务 D1 的四分 |
| provider 直连 | `eval-cli/package.json` 直接依赖 `@deepseek-ai/dsh-query-maxcompute` | 只依赖 capability，provider 由外部注入 |

**被删实现的测试必须迁移**，不得跟着实现一起消失。

**不在本票动**：包名与 `exports` 一律不变——`dsh-eval-runner` 在仓外有 4 处消费者（`tool-trigger-eval` 含测试、`goal-eval-policy`、`python/sdk-runtime` 清单、`scripts/live-verify-w1-w5.ts`），`dsh-eval-runner-service` 另有 `patrol-mode`。本票不让 T1 同时背“改判分语义”与“搬包结构”两件事：若 eval 数字异动，得能分辨是哪一件造成的。

**包级重组另票**：[T12-eval-package-consolidation](T12-eval-package-consolidation.md)，blocked by T1 + G10。R24 已确认合并**无循环依赖、且为 benchmark-agnostic 目标铺路而非冲突**；但 G10 会重新切这几个包（K11 移出成版本化 benchmark pack），故 T12 的题面需在 G10 解后重定。

**对 map 常设原则的修订**：additive-only（不改/不删 core）的适用范围限于 agent core 与评分维度的叠加；**`packages/eval/` 内部的去分叉删除是被允许的**，否则该原则会挡住 T1。map Notes 需同步这一修订。

### D3 — seam 是两个纯函数加一个可落盘 artifact

**决定**：evaluation 自有的接口由三件构成：

1. **注入的窄接口**：`{ execute(sql, signal?): Promise<QueryOutcome>; attach?(instanceId): Promise<QueryOutcome> }`。不是裸函数，也不是现在的 `QueryExecutor` 肥类。保留 `attach` 是为了让 D1 的 `environment-blocked` 保持为**策略结论**——将来改成“attach 后等它跑完”时有落点，而不是把“遇 `pending` 就放弃”写成结构。SQL 提交、scope routing、credentials、backend lifecycle 仍归 `@deepseek-ai/dsh-query`。
2. **`normalizeOutcome(outcome): ExecutionArtifact`**（纯函数，evaluation 拥有）：把三态 `QueryOutcome` 翻成判别联合，保留 `columns` / 行 / `rowCount` / `truncated` / `instanceId` / `failureKind` / `sql` / 执行元数据。归一化不再住在 adapter 里（adapter 历史上就是分叉源）。
3. **`gradeExecution(artifact, expected, policy): ExecutionVerdict`**（纯函数，evaluation 拥有）：输出 D1 的四分与失败原因（不再把比较器的 `detail` 丢掉）。

**为何必须拆成两个函数（承重理由，非审美）**：[R23](R23-comparator-policy-mutation-baseline.md) 要测几十种 comparator policy 组合的 false-accept / false-reject，必须能对**已存 artifact 离线重打分**而不是每个变体回数仓重跑（贵，且 `gold replay stability` 本身就是被测指标，需存量 artifact 作基准）；且 R23 要求 **raw 与 normalized 两种 digest**，只有归一化是独立一步且输出被持久化时，这两个 digest 才存在。

**落盘与成本上限**：`ExecutionArtifact` **就是落盘对象**，存 `columns` + 不超过配置上限的行 + `rowCount` + `truncated` + **完整 raw 与 normalized 结果的 digest**；超限则只存 digest 与截断行。不得把“5 行不可重放”换成“无上限大 blob”。R23 的“单快照偶然命中”检查也靠这个 digest。

**policy 是显式解析且带版本号的值**，随 verdict 落盘（AGENTS.md：插件内不得有硬编码可调项，默认值走显式 resolve 步骤；R23 要求逐字记录 policy version）。**具体默认值不在本票定**，由 R23 的 mutation baseline 给证据后再定（三方对账一致：现在定默认档是空转，因活跃 case 尚未用到行集比较）。

**T1 的关键验收信号**：能对存量 artifact 离线重打分（换 policy 不回数仓），且同一 artifact + 同一 policy 版本重打分结果稳定。

### D4 — judge 永不填 execution 维度；模式必须随 run 落盘

**本轮新取的证据（`eval-results/` 逐文件解析）**：全仓**只有 4 个批量 run 记录了 `with_query`**。同一批 39 个 case、同一模型（qwen3.7-max）、同样 `pass_k=3`，唯一差别是接不接数仓：

| run | `with_query` | n | correct | pass |
|---|---|---|---|---|
| `eventdef-judgeonly-v2.json` | False | 39 | 24 | **61.5%** |
| `rebaseline-judge-only-rbi-10000251-postfeedback` | False | 39 | 21 | 53.8% |
| `eventdef-judgeonly.json` | False | 39 | 16 | 41.0% |
| `eventdef-realexec.json` | True | 39 | 2 | **5.1%** |

同案同模型同 k，便宜模式与真执行相差 **56.4pp**。另外 **35 个批量 run 连 `config` 块都没有**（包括全部 168-case run：91.7% / 88.1% / 73.8% / 72.0% / 66.1% / 63.7% …），其模式**不可恢复**。**从未有任何一次完整 168-case run 真连过数仓。**

**论文侧**：四个已发表基准无一例外以执行为准；test-suite 存在的理由恰恰是“即使真执行，只在单个数据库上执行仍会产生假阳性”，故它加的是**更多**执行（蒸馏多库测试集）；GradeSQL 用执行派生的标签训 verifier。“让 LLM 读 SQL 文本打分”不是某个已发表指标的弱化版，它在已发表家族之外。

**决定**：

1. **judge 分数永不得写入 execution 维度**（删除 `runner.ts:286` 的顶替）。judge 仍作为独立记录的维度存在（dual-score 不变）。
2. 未接数仓时，EXECUTION case 的 execution 结局为 **`not-measured`**——枚举的第五个成员，不是缺失值。选显式 tag 的理由是本仓已经犯过“缺失被默认成 `true`”（`runner.ts:248`）；枚举成员使每个消费者必须显式处理它，而空值容易再被 `?? true` 掩盖。
3. 同理，25 个 DELIVERY-only case 不得再写 `execution_match: true`（当前 L248 初值），应为 `not-measured`。
4. **每个 run 必须落盘它的执行模式与 policy 版本**；缺这两项的结果文件在 `compare.ts` 侧**拒渲染**（与 map 方向 4 “缺 n_d/p 拒渲染”同一原则）。
5. **报告层不得把不同执行模式的 run 混算成一个 pass 率**；历史上 35 个无 `config` 的批量 run 在任何对比中标为**不可归属**，不得作为基线引用。

**对 map 的修正**：Destination 里“61.9% judge-only 基线很可能虚高”应改为：该数字来自无 `config` 记录的 run，模式不可恢复；唯一同条件对比（同 39 case / 同模型 / 同 k）显示便宜模式相对真执行虚高 **56.4pp**。

### D5 — G1 管机器，G1b 管语料

**G1 拥有**：D1 的结局枚举（含 `not-measured`）、D3 的两个纯函数与 `ExecutionArtifact`（含 raw/normalized digest 与行数上限）、policy 的**机制与版本号**、D2 的去分叉、D4 的模式落盘与拒渲染，以及**loader 不得静默吐掉未知 `expected.*` 字段**——写了就要么用、要么报错，不得假装没看见（AGENTS.md 的 fail-loud；与 provenance 内容无关，因而属本票）。

**G1b 拥有**：provenance schema 的具体字段、谁有权写 expected、snapshot 身份与过期语义、以及 case 迁移（86 个 `row_count_range` 是否改为值断言）。**comparator 默认值归 R23**。

**得失**：T1 上线后真执行判分只覆盖 **57 个 `scalar_exact` case**（它们至少断言一个真实值）；86 个行数 case 待语料修好再纳入。换来的是 T1 立刻可开工，且日后数字异动可归因到引擎而非语料。

### D6 — 当前 EXECUTION 语料不合格，应重建（约束 G1b 与 GA-EVAL-EXPAND）

**依据**：已发表基准的 gold 一律是**人写的参考 SQL**——Spider 由 11 名 CS 标注者手写，BIRD 由专家配数据库，Spider 2.0 由 8 名标注者写 gold SQL 而 LLM 只得润色问题措辞；评分时 gold 与候选**都执行**。本仓 143 个 EXECUTION case **零参考 SQL**，期望值来路不可考，其中 86 个只断言行数。按已发表标准评定，它们不是 benchmark case，是启发式断言；而 test-suite 的结论是**即使有 gold SQL**，单库执行仍会假阳性——本仓连它当年要改进的起点都未达到。

**决定**：143 个 EXECUTION case 的 expected **重建**，而非打补丁：由领域人员写参考 SQL、在钉住的数据快照上执行派生真值，继承而来的旧期望值退役。**模型不得充当 gold 的作者或最终裁决者**（map 已有的反循环原则，与 Spider 2.0 的 LLM 仅润色问题一致）。

**这条的辐射**：

- 39 个 rbi case（带 `expected.sql` + `tier: verified` + `anchor_ds`）是仓内**唯一合格的模板**，而它正被 loader 吐掉——D5 里的 fail-loud 因此从“卫生项”升为重建的前置。
- [GA-EVAL-EXPAND](../../data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md) 从“扩充至 n_d≥85”改为“**重建**后再谈功效”；在重建前计算的 MDE 无意义。
- 历史 168-case 百分数双重失效：既是 judge-only 或不可归属（D4），又是对不合格语料的测量（D6）。map 的基线表需加此警示。
- 重建的范围、次序与人力归 **G1b**；本票只定“不合格、需重建”这一约束。


---

## Resolution v1（2026-09-07，原文保留）

> 本节是 v1 grilling session 的原文，未经改写。v3 在未读本节的前提下独立重做，二者的裁定见文末「合并裁定」。

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

---

## 合并裁定（v3 × v1，2026-09-08）

v3 在**未读上一节**的前提下独立重做（git 历史可核：决议先于合并提交）。两版共同得出的结论不重述；下面只记**分歧与互补**。

### 唯一实质冲突：端口形状与归一位置

v1 锁定第 4 条：单函数 `(sql) => Promise<ExecutionResult>`，host 用 `mapQueryOutcome` 归一后交给 evaluation。v3 D3：窄接口 `{ execute, attach? }` 返回**原始** `QueryOutcome`，归一由 evaluation 的纯函数做。

**裁定：取 v3 的归一位置 + v1 的端口纪律。** host 只交出 capability、不交出 verdict（v1）；但归一必须在 evaluation 内——**理由是 v1 自己的发现 ①**：让 host 负责映射正是两份 adapter 分叉的成因（每个 host 各自实现一份映射，且已经跑偏）。`attach?` 保留（v3），以免把“遇 `pending` 就放弃”写成结构。

### v1 反过来修正 v3 的两处

1. **provider 的声明不可当证据**（v1 锁定第 6 条）：maxc sidecar 把 `truncated` 恒写 `false`、`executionMeta.durationMs` 恒 `0`、pending 的 `elapsedMs` 恒 `0`，且不传 `--max-rows`。所以 **D3 的 `ExecutionArtifact` 不得原样保留这些字段**：耗时由 adapter 在调用两端量 wall-clock；截断信号 `rowCount !== rows.length` 是**待验假设**，写作 T1 验收项，不成立则回落“透传 + 开 provider 缺陷票”。
2. **provenance 由 grader 装配、不由 executor 提供**（v1 锁定第 5 条）：snapshot id、policy id+version、raw/normalized digest 是 case+环境绑定的属性，不是一次 SQL 执行的属性；塞进端口会把端口弄宽。与 D3 兼容，**以 v1 表述为准**。

### v3 补 v1 的四处

1. **`case-defect` 自成一类**（D1）：v1 只分“模型错 / 仓库没答 / judge 意见”三事实，但它自己的发现 ④（expected 与自身 `expected.sql` 不符）与“拼错 `match_mode` 被记成答错”都需要这一类。
2. **`not-measured`**（D1/D4）：未接数仓时不得再用默认 `true` 或 judge 分数充数。
3. **模式必须落盘，且已测出代价**（D4）：全仓只 4 个批量 run 记了 `with_query`；同 39 case / 同模型 / 同 k 下 judge-only 61.5% vs real-exec 5.1%（**56.4pp**）；**从未有完整 168-case run 真连过数仓**。
4. **语料不合格需重建**（D6）：按已发表标准（gold 由人写参考 SQL、gold 与候选都执行），143 个 EXECUTION case 不是 benchmark case。

### 两条基线皆不可用，但原因不同

v1 指出 **12.8% 真执行基线已被污染**（它测在那 39 个 case 上，而其中 16/18 event 期望值与自身 `expected.sql` 不符）；v3 指出 **168-case 的百分数模式不可恢复且语料不合格**。两版合起来的结论：**judge-only 与 real-exec 两条基线都不能当基线用**，T1 后需重建基线而非对比旧数字。

### 不重复开票

v3 D5 的“loader 不得静默吐掉未知 `expected.*`”与 v1 开的 [T11](T11-loader-provenance-strip.md) 是同一件事，**归 T11**，本票不另开票。v1 的 T1 验收面与 open 风险全部保留，与 D2/D3 的验收信号合成 T1 的完整清单。GA-EVAL-CASESET-EVENT-ANCHOR 按 v1 裁定（不 supersede，正交并行），但 D6 使其口径决策更紧迫——它那 16/18 不符的期望值正是重建的第一批样本。
