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

## ⚠ 前提修正（[G1](G1-exec-grader-seam.md) 2026-09-07 发现 ④，本票开票时未知）

**本票原假设「provenance schema 待设计」是错的——它已经存在。** 实测：

| case set | 文件数 | 带 `expected.sql` | 带 `meta.anchor_ds` |
| --- | ---: | ---: | ---: |
| `k11-v2` | 168 | **0** | 0 |
| `rbi-10000251-exec` | 39 | **39** | 37 |

`rbi-10000251-exec` 的 case 带 rbi `schema_version: 3` 的完整 provenance：`expected.sql`（人写的 reference SQL）、`meta.anchor_ds`、`meta.tier: verified`、`meta.provenance: migrated`。R1 的「0 个 case 有 reference SQL」**只对 k11-v2 成立**。

三处后果，本票必须据此重写起点：

1. **迁移分类的起点是「保留既有 rbi schema 还是与 k11-v2 合流」，不是从零设计。** 两套 schema 如何合流本身归 [G10](G10-harness-bhe-split.md)；本票只定 lifecycle 语义。
2. **`loadCase` 正在静默丢弃这些字段**（zod object strip）→ [T11](T11-loader-provenance-strip.md)。所以「39 个已有 provenance」目前在 eval 路径上**不可达**，本票的任何 lifecycle 设计在 T11 之前无法落地验证。
3. **`expected.sql` 是模板不是可执行 SQL** —— 37/39 含 `{{ds_yesterday}}`/`{{ds_7d_ago}}`，解析依赖同 case 的 `meta.anchor_ds`。所以「reference SQL 可重放」这条要求包含**参数绑定契约**，不只是保存 SQL 文本。

并且 **`anchor_ds` 已被证明不是有效的冻结锚点**（对 event 数据）：GA-EVAL-CASESET-EVENT-ANCHOR 实测 event 16/18 期望值已与自己的 `expected.sql` 不符，而 DWS 13/13 相符——ODS 原始视图历史分区不冻结，DWS T+1 算完即冻。本票在裁定 snapshot identity 时不得把 `anchor_ds` 当作已有的答案，它恰恰是反例。
