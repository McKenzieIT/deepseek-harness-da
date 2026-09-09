# R5 — 污染、语义近邻与 live benchmark 论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)；[R17 — Contamination audit](R17-contamination-audit.md)
**Mode**: AFK
**Branch**: `research/R5-contamination-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

Direct、derivative、temporal、distributional 与 acquired contamination 各能绕过哪些已有防护？语义近重复、未知 laundering transformation、审计功效不足和 live benchmark 暴露后退化应如何约束 case lineage、污染披露与 R17 的实验设计？

## 待认读一手来源

- Benchmark Contamination: A Taxonomy Organized by Defeated Mitigation (`2608.29463`)
- Soft Contamination Means Benchmarks Test Shallow Generalization (`2602.12413`)
- Combating Data Laundering in LLM Training (`2604.01904`)
- When Is Benchmark Contamination Detectable? (`2608.07914`)
- LiveClin (`2602.16747`)
- FutureSim (`2605.15188`)
- Excess Separability (`2608.12652`，detector validity)
- Auditing LLM Benchmarks with Item Response Theory (`2605.30504`，与 R4 对账)
- R10 已认读的 Data Laundering、MMLU-CF 与 WildBench，用于对账而非重复摘要

## 产出

`../research/contamination-live-benchmark-papers.md`，输出污染分类、可检测性状态机、lineage 字段、live lifecycle 约束及 R17 实验矩阵。
