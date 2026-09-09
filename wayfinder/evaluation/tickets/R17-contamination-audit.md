# R17 — Contamination audit 实验

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R5 — 污染论文认读](R5-contamination-papers.md)；[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)；T1-exec-grader-impl；T5-dynamic-cases-impl；T5b-evolving-slice-impl
**Blocks**: GA-EVAL-EXPAND 的可信功效解释
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R17-contamination-audit`

## Question

当前与未来的 train/heldout/fresh case 在 lexical、semantic、structural、lineage 和时间维度上存在多少污染或 benchmark-local shallow generalization？现有 detector 在目标污染比例上的统计功效是否足以支持 `not detected`，还是只能输出 `inconclusive`？

## 实验矩阵

- Exact exposure。
- Paraphrase/semantic duplicate。
- Structural transformation。
- Distillation/laundering surrogate。
- Clean matched control。
- 按相似度分桶的 performance lift。
- Detector calibration、transport gate、power 与 contamination-fraction certificate。

## 输出状态

`detected | not_detected_with_power | inconclusive`。每次完整运行按实验审计规则写入 `../research/experiment-audit-log.md`。
