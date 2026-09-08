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
