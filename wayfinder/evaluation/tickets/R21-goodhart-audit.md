# R21 — 跨 slice 与跨时间 Goodhart audit

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R25 — New Evaluation stack baseline re-anchor](R25-evaluation-rebaseline.md)、[G15 — Dynamic data evaluation lifecycle](G15-dynamic-evaluation-lifecycle.md)、T5-dynamic-cases-impl、T5b-evolving-slice-impl
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R21-goodhart-audit`

## Question

候选系统在 train、heldout、fresh 与连续 fresh batches 上的提升是否一致，还是来自公开 case 适配、judge/style gaming、Harness 预算变化、evaluation-time feedback、memory 或 acquired contamination？

## 必须测量

- 每个 slice 的 execution、judge、gap、失败结构、样本数和 CI。
- `Δ_train-heldout` 与 `Δ_heldout-fresh` 相对冻结 baseline 的变化。
- Benchmark provenance、run provenance、Comparison Plan、PublicationEligibility 与 coverage accounting。
- 完整 Run Identity Graph：Benchmark、Harness、model/interface、DataScope、Environment assurance、Context、grading、Observer、operation 与 seed。
- Chronological fresh replay 中首次表现、反馈后表现和下一 fresh batch 表现。
- Tool、network、memory、retry 与 elicitation budget 的消融。
- Standard `pass@n` 与 strict `pass^k`；observational、unresolved、invalid 与 cleanup/separation failure 不得混入独立-trial headline。

每次完整运行写入 `../research/experiment-audit-log.md`。
