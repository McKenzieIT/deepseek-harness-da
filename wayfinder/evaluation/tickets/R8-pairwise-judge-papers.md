# R8 — Pairwise、rubric 与 agent-trajectory judge 论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: G8-pairwise-judge
**Mode**: AFK
**Branch**: `research/R8-pairwise-judge-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

Pairwise、rubric、judge panel 与 agent trajectory judging 在位置、风格、共享混杂因素、workflow DAG 和 ground-truth availability 下各有哪些可靠性限制？本仓应保存哪些 per-judge 与 per-dimension evidence，才能校准而不是只保留多数票？

## 新增一手来源

- AgentJudgeBench (`2608.26623`)
- A Judge Should Know What Changed (`2608.24419`，与 R3 对账)
- Judging the Judges (`2604.23178`)
- CARE: Confounder-Aware Aggregation (`2603.00039`)

## 产出

`../research/pairwise-agent-judge-papers.md`，给 G8 输出 position swap、style control、DAG dependency、per-judge evidence 与 correlated-error 要求。
