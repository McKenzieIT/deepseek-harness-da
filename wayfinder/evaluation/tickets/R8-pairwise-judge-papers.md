# R8 — Pairwise / rubric-anchored judge 与 RADAR 冗余审计论文认读

**Type**: research  ·  **Status**: in-progress（claim 于 2026-09-10）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [R20-radar-redundancy](../map.md)（experiment quick win）、G8-pairwise-judge（grilling）
**Mode**: AFK（本环境直接做，见 [playbook](../playbook.md) §1.1 —— R 认读一律本环境）
**Branch**: `master`（纯 `wayfinder/` 文档，CLAUDE.md 直推例外；按路径 stage、逐单元 commit）

## Question

方向 8 摆着三条互不等价的判官改造路线，map 目前把它们并列写在一行里：

- **(a) pairwise** —— 候选 vs reference 逐维 head-to-head + 位置 swap，Bradley-Terry/Elo 聚合成 pass^k；
- **(b) rubric-anchored** —— 逐维 isolated pass + gated 依赖图；
- **(c) 降维** —— 先做 RADAR 式冗余审计，把当前 5 维塌成更少的正交维。

一手来源对这三条各自**确立了什么**：测的是什么量、报告的效应量多大、各自需要什么输入（要 reference answer 吗？要人写 rubric 吗？要几次判官调用？）、彼此在哪里互相矛盾？

由此收窄成两个可执行的下游问题：

1. **G8 到底要裁什么** —— 哪些是论文已经替我们裁掉的（不必再 grill），哪些纯属本仓自主选择（不要假借论文权威）。
2. **R20 到底跑什么统计量** —— RADAR 式审计在本仓 5 维上的**确切算法**：输入是哪些已落盘字段、算什么、多少样本才有意义、什么阈值算「冗余」。R20 是 quick win，前提是 R8 把它降到「跑一个脚本」而不是「再设计一次实验」。

## 待认读论文

> 进产物前每条必须由本 session 亲自 primary-fetch `export.arxiv.org` 元数据核对 id↔标题↔作者↔日期（CLAUDE.md 引证纪律 2：subagent 输出 = 凭记忆断言）。核验结果表进研究笔记 §1。

- **RADAR(2608.01810)** —— preflight coupling / 冗余审计，**R20 的方法来源，本票主线**
- **TrustJudge(2509.21117)** ✅ 已 spot-check 真实 —— pointwise vs pairwise 23.32% 不一致
- **Am I More Pointwise or Pairwise(2602.02219)** —— pointwise/pairwise 取舍
- **Grading Needs a Rubric Not Intelligence(2608.17938)** —— answer 解释 95.6% 方差
- **SARA(2608.14684)** —— 多 rubric 单 pass 仅 1/3 一致
- **Graph-Structured Rubrics(2608.12097)** —— gating

## 本仓已知的纠缠事实（认读时直接映射，不必重新发现）

> 本节事实由本 session 自己用确定性命令重导后填入（见研究笔记 §2）。占位于 claim 时写下，避免把 map 的转述当既成事实。

- 当前判官是 P11d 落地的 **5 维 + 0.6 阈值**（table/field/filter/aggregation/overall），dual-score 与 execution 并列。
- 已测出的病灶：judge false-pass 35.9pp（**该数字连同 73.7%/61.9%/12.8% 已于 2026-09-08 全体失效**，见 map §Destination 警示；R8 只引「方向存在」不引具体百分数）。
- 便宜模式 vs 真执行同 39 case 差 **56.4pp**（G1 v3 D4）——判官在无执行事实时系统性偏松。
- fog 中的一条待判机制：judge 用 BM25 候选当 schema context，可能是独立的假通过来源（map §Not yet specified 第 2 条）。

## 产出

`../research/pairwise-judge-papers.md`，仿 [R1 v3](R1-exec-grader-papers.md) 的做法**严格区分**：

- **来源事实** —— 论文全文、官方实现源码或本仓确定性命令直接支持的，逐条给出处（`arXiv:id` + 节/行，或 `file:line`）
- **设计推论** —— 对 G8/R20 与 `packages/eval/` 的建议，不宣称是论文原文结论

**必答**：
1. 六篇的身份核验表（id↔标题↔作者↔日期↔journal_ref）。
2. (a)/(b)/(c) 三路线各自的输入需求与判官调用成本（本仓 pass^k 语义下 ×k 的代价）。
3. **R20 的可执行规格**：字段、统计量、样本量、判据阈值。
4. 三路线与方向 2（blind-solve-then-score）、方向 3（校准 + gated dual-score）的重叠与冲突——避免 G2/G3/G8 各裁一次同一件事。

## 不在本票范围

- 做出判官架构决策（G8）或实施（T7-pairwise-judge-impl）。
- 跑 R20 实验本身（R8 只交付它的规格）。
- 引用未 primary-fetch 确认的论文；本环境 429/403 时该条降级为「待核」，不进产物。
