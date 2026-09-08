# R1 — 执行级评分与非循环 ground truth 论文认读

**Type**: research  ·  **Status**: claimed（**重做 v2**，2026-09-08）
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
- 诚实披露：执行本轮的 agent 在收到重做指令**之前**已读过前一轮的 R1 Answer 与 G1 Resolution，无法"未读"。因此本轮结论须逐条注明与前一轮**一致 / 不一致 / 无法确认**，使锚定效应可被审查。

## Answer

（待本轮认读完成后填写）
