# G5 — Dynamic case pipeline 与 fresh pack 生命周期

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R5 — 污染、语义近邻与 live benchmark 论文认读](R5-contamination-papers.md)
**Blocks**: T5-dynamic-cases-impl；T5b-evolving-slice-impl；[R17 — Contamination audit](R17-contamination-audit.md)
**Mode**: HITL
**Branch**: `grilling/G5-dynamic-case-pipeline`

## Question

`train`、长期私有 `heldout` 与按时间窗口生成的 `fresh` 应采用什么采集、冻结、轮换、公开、退役和访问审计生命周期？每次 fresh 发布应 append、partial rotation 还是 full replacement，公开 leaderboard 与 private monitoring 如何共存？

## 必须裁定

- Pack version、vintage、`collected_at`、`eligible_after`、`first_evaluated_at` 与公开性状态。
- Fresh case 的生成、人工复核、reference execution 与 snapshot 固定流程。
- Heldout/fresh 的访问权限、聚合返回与解封条件。
- 新旧 pack 的可比性、重锚规则和退役记录。
- Evaluation-time feedback、memory 与 acquired contamination 的隔离责任。

## 证据入口

[R5](R5-contamination-papers.md) 与 [`g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md) 的 LiveClin/FutureSim 分流。
