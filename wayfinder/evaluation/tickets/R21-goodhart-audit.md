# R21 — 跨 slice 与跨时间 Goodhart audit

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: T1-exec-grader-impl；T9-bhe-split-impl；T5-dynamic-cases-impl；T5b-evolving-slice-impl；[G10 — Harness B/H/E 拆分](G10-harness-bhe-split.md)；[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R21-goodhart-audit`

## Question

候选系统在 train、heldout、fresh 与连续 fresh batches 上的提升是否一致，还是来自公开 case 适配、judge/style gaming、Harness 预算变化、evaluation-time feedback、memory 或 acquired contamination？

## 必须测量

- 每个 slice 的 execution、judge、gap、失败结构、样本数和 CI。
- `Δ_train-heldout` 与 `Δ_heldout-fresh` 相对冻结 baseline 的变化。
- Benchmark provenance 与 run provenance。
- Model/Harness/Environment/adapter/policy/seed identity。
- Chronological fresh replay 中首次表现、反馈后表现和下一 fresh batch 表现。
- Tool、network、memory、retry 与 elicitation budget 的消融。
- Standard `pass@n` 与 strict `pass^k`。

每次完整运行写入 `../research/experiment-audit-log.md`。
