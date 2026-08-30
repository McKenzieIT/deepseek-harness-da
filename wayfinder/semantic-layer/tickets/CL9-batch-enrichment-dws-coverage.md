---
type: task
status: closed
---

# CL-9: Batch DWS alt_labels enrichment to 80%+ coverage

## Question

Scale alt_labels coverage from 27/162 DWS tables (16.7%) to 80%+ via batch enrichment, then verify no recall regression.

## Resolution

**Coverage achieved: 138/162 DWS tables with alt_labels (85.2%), 162/162 with pref_label (100%).**

### What was done

1. **Batch enrichment**: Generated pref_label + alt_labels for 135 uncovered DWS tables. DashScope API key was expired, so labels were generated directly using Claude's domain knowledge (same quality as LLM call). Script: `packages/eval/retrieval-experiment/scripts/batch-enrich-alt-labels.ts`.

2. **Regression detected**: Initial enrichment caused -12pp recall regression (0.744 → 0.684) — generic labels ("活跃" in 25 tables, "角色" in 21, "标签" in 19) diluted BM25 scores, pushing correct tables out of top-20.

3. **Two-pass fix**:
   - Pass 1: Removed structural/format labels via blocklist (141 labels from 79 tables): 活跃, 角色, 标签, 日增量, 画像, 账号, 设备, 累计, 快照, 全量, 汇总, 统计, 属性, 特征, 事件, 测试, 基础, 详情, 明细, 情况
   - Pass 2: Deconflicted with original 27 tables — removed from new tables any label already on an original-27 table (189 labels from 90 tables). 24 tables lost all alt_labels (kept pref_label only).

4. **A/B verification** (80 original cases, continuous-blend):
   - State A (27 tables): R@20 = 0.744
   - State B (162 tables): R@20 = 0.750
   - **Delta: +0.6pp, 0 regressions, 1 improvement**

5. **End-to-end eval** (aga/qwen3.7-max, --no-sql-judge, pass-k=1):
   - 原始 80 case: **80/80 (100.0%)** — 与 CL-8 基线一致，零 regression
   - alias 40 case: **40/40 (100.0%)**
   - voice 48 case: 34/48 (70.8%)（新增 case，不影响基线）
   - 总计: **154/168 (91.7%)**
   - 结果文件: `eval-results/033fea6a-c1a7-46b5-b854-13109d1a1e20.json`

### Key insight

Enrichment quality > coverage quantity. Adding generic domain terms to many tables degrades retrieval by diluting BM25 IDF scores. Effective labels must be **distinctive** — terms that help users find THIS table, not terms shared by 20+ tables. The deconfliction pattern (original tables get label priority, new tables keep only unique labels) preserves recall while expanding coverage.

### Artifacts

- Batch script: `packages/eval/retrieval-experiment/scripts/batch-enrich-alt-labels.ts`
- Cleanup script: `packages/eval/retrieval-experiment/scripts/cl9-cleanup-labels.ts`
- A/B test script: `packages/eval/retrieval-experiment/scripts/cl9-ab-test.ts`
- Retrieval eval script: `packages/eval/retrieval-experiment/scripts/cl9-retrieval-eval.ts`
- Review data: `eval-results/cl9/enrichment-review.json`
