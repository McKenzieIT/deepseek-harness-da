# R4 — Estimand、cluster bootstrap 与重复可靠性论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: G4-significance-contract；[R22 — Consistency at k](R22-consistency-at-k.md)
**Mode**: AFK
**Branch**: `research/R4-significance-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

当一个 case 含多次 attempt、多个 rubric dimension、多个 judge 与位置交换时，正确的 estimand、aggregation level、sampling unit、cluster unit、abstention policy 和 CI 应如何定义？标准 `pass@n`、strict `pass^k` 与 retry-free stability 应如何共同报告？

## 新增一手来源

- Agreement Metrics for LLM-as-Judge Evaluation (`2606.00093`)
- Accuracy, Stability, and Repeated-Run Reliability (`2606.00920`)
- Efficient Evaluation of LLM Performance with Statistical Guarantees (`2601.20251`)
- Benchmark² (`2601.03986`)

## 产出

`../research/significance-estimand-papers.md`，给 G4/compare.ts 输出显式统计协议。
