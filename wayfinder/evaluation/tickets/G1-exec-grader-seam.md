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
