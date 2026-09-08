# R1 — 执行级评分与非循环 ground truth 论文认读

**Type**: research  ·  **Status**: resolved（**v2 重做**，2026-09-08）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G1 — Execution grader seam](G1-exec-grader-seam.md)、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)
**Branch**: `grilling/G1-exec-grader-seam-redo`

## Question

为方向 1（EX grader + 非循环 expected 溯源）建立一手文献基线：**执行级评分（EX）在已发表基准里到底怎么定义、结果集怎么归一化、gold 怎么产出与验证、如何避免"用模型产 ground truth"的循环**。产出一份可直接喂 G1 grilling 的 research note，逐篇给核心方法 + 对本仓映射 + 可执行的规则清单。

## 为什么重做（2026-09-08）

前一轮 R1 与 G1 均在**多次中断**的 session 里完成，其结论未经独立复核即被 G1 采纳并据此开出 T11/R10/G10/T1 四张票。用户判定该轮"研究和 grilling 可能是错的"，要求 R1+G1 二次重做、**忽略已有结论**。

处置：

- 前一轮产物**未删除**，移到 [`../research/_superseded/2026-09-07-exec-grader-papers.SUSPECT.md`](../research/_superseded/2026-09-07-exec-grader-papers.SUSPECT.md) 保留审计痕迹；本轮**不引用、不作为前提**。
- 本轮所有 claim 必须由**一手来源**独立重建：arXiv API 权威元数据 + PDF 全文，以及本仓 `packages/eval/` 的实际代码（file:line 须为本轮亲自读过）。
- 前一轮的仓内发现（如 "mapQueryOutcome 从未被调用"、"loader 静默丢弃 expected.sql"）在本轮视为**未验证传闻**：独立复核后才可写入，且须标明本轮是否确认。
- 诚实披露：执行本轮的 agent 在收到重做指令**之前**已读过前一轮的 R1 Answer 与 v1 研究笔记全文，无法"未读"；但**未读**前一轮 G1 Resolution（在 `grilling/G1-exec-grader-seam` 分支，本轮刻意不打开），因此 G1 v2 的决策不继承其结论。本轮结论逐条注明与前一轮**一致 / 不一致 / 无法确认**，使锚定效应可被审查。

## Answer

**Status: resolved（v2，2026-09-08）**。完整认读见 [R1 v2 — 执行级评分与非循环 ground truth 认读](../research/exec-grader-papers-v2.md)。

**论文层**：v1 结论经一手复核后全部成立。四套官方 evaluator 在 v1 所引的同一 commit 上逐段读取，确认 execution-match **无统一语义**：BIRD 与 GradeSQL 用 `set(...)==set(...)`（忽略重复行）；distilled test-suite 用 `set ∧ multiset_eq`（**保留** multiplicity）加列排列搜索；Spider 2.0 Lite 用 focused `condition_cols`、逐题 `ignore_order`、多 gold 文件，并硬编码 `abs_tol=1e-2` 数值容差。故任何 comparator 默认档都是本仓自己的选择，必须显式、可版本化、逐 case 可覆写。

**仓内层**：v1 方向对但深度不足，且把分析力气花在零使用的 code path 上。本轮机械重导确认 168 / 143 EXECUTION / 25 DELIVERY-only / 0 reference SQL，并新发现 **143 个 EXECUTION case 只用 2 个 mode：`row_count_range` 86（只查行数）+ `scalar_exact` 57（只查首行首列）；`set_equal`/`ordered_subset`/`multi_scalar_exact` 零使用**——即**没有任何 case 断言超过一个单元格**。v1 大篇幅分析的 `set_equal` set-vs-bag 语义对现状不产生约束。

两条争议传闻均**确认**，且比 v1 所述更严重：(1) `mapQueryOutcome` 不止"未被调用"——整个 dsh-eval 评分栈（`driveSession` + 失败分类）都不在生产路径上，生产路径是 `eval-cli → eval-runner`，且 CLI fork 了一个**更弱**的 adapter，把 `pending`（仓库未作答）记成模型答错；(2) loader 静默丢弃 `expected.sql`——用仓内 zod 4.4.3 机械证明 `sql`/`snapshot_id`/`provenance` 均被 strip，不抛错不告警。

另新发现：`execution_match` 字段在 SQL-only 模式下由 LLM 意见填充（`eval-runner/src/runner.ts:286`，模式可从 `RunConfig.with_query` 恢复）；`query_result` 截断前 5 行致 `row_count_range` 判定不可重放；comparator 内部存在三种互相冲突的相等语义。

**未完成**：arXiv 元数据本轮**无法验证**（本环境直连 HTTP 000，WebFetch 超时/429）。所有 arXiv 编号沿用 map §验证 TODO 的既有状态，不因本轮升级为"已验"；GradeSQL 编号 `2606.30851` 与其仓库 README 所引 `2509.01308` 的矛盾**未解决**，G1 不依赖任一编号。

**交给 G1 的排序**：断言宽度 → `execution_match` 双义 → 环境性失败计入模型分母 → 不可重放 → provenance 无处可放 → comparator 语义三分。**G1 不应从"选哪个 comparator 默认档"起手**，那是第 6 位的问题。
