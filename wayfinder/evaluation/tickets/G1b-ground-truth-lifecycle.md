# G1b — Ground-truth lifecycle

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R1 — 执行级评分与非循环 ground truth 论文认读](R1-exec-grader-papers.md)（resolved）
**Blocks**: T1-exec-grader-impl
**Mode**: HITL
**Branch**: `grilling/G1b-ground-truth-lifecycle`

## Question

一个 execution case 从 reference SQL 审核、不可变 snapshot 执行、raw/normalized artifact 固化、digest 与 comparator-policy version 记录，到 benchmark 版本发布和后续修订，应采用什么 lifecycle，才能让 expected result 独立于被测模型、可重放、可审计且不把历史错误静默改写成新 ground truth？

本票需要与人共同决定作者与 reviewer 独立性、snapshot identity、artifact provenance、变更与退役规则、多个可接受 artifact 的表达、动态 case 或 relation assertion 的准入条件，以及 143 个 legacy/unverified expectation 与 25 个 delivery-only case 的迁移分类。SQL 的实际执行复用 dsh-data-agent 的 `@deepseek-ai/dsh-query` capability；evaluation 只拥有 ground-truth provenance、benchmark versioning、policy reference 和证据语义。

本票不凭论文直接锁定 comparator 默认值、数值容差或 mutation 阈值；这些选择由 [R23 — Comparator-policy mutation baseline](R23-comparator-policy-mutation-baseline.md) 提供实验证据。决议须明确 T1 与 GA-EVAL-EXPAND 的 lifecycle 验收面，并产出或更新一篇 `.agents/notes/proposed/testing/` Agent Note；本票不迁移 case 或实现 SQL executor。
