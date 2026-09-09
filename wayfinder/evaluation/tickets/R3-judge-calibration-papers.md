# R3 — Judge calibration 与 construct validity 论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: G3-judge-calibration
**Mode**: AFK
**Branch**: `research/R3-judge-calibration-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

LLM judge 如何同时证明对无关表面变化保持 invariance，并对最小实质错误具备 construct sensitivity？Judge calibration 应如何记录 abstention、invalid、difficulty、ground-truth availability 与 per-dimension confusion，避免“稳定但无效”的 judge？

## 新增一手来源

- A Judge Should Know What Changed (`2608.24419`)
- AgentJudgeBench (`2608.26623`，与 R8 对账)
- Agreement Metrics for LLM-as-Judge Evaluation (`2606.00093`，与 R4 对账)
- Judging the Judges (`2604.23178`，与 R8 对账)

## 产出

`../research/judge-calibration-papers.md`，给 G3 输出 SQL 等价变换与最小语义错误的双向 mutation contract。
