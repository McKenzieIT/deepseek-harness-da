# G1 — Execution grader seam

**Type**: grilling  ·  **Status**: **claimed 2026-09-08（mckenzie）——v3 独立重做**
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R1 — 执行级评分与非循环 ground truth 论文认读](R1-exec-grader-papers.md)（v3 重做中，同会话）
**Blocks**: T1-exec-grader-impl
**Mode**: HITL
**Branch**: `grilling/R1-G1-v3-independent`（主工作区）；v1 已在 `grilling/G1-exec-grader-seam` 上 resolve 过，本轮先独立重定、再与 v1 对账

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
