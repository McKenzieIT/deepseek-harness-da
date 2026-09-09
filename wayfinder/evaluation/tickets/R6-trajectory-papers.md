# R6 — Persistent multi-turn、state lineage 与 trajectory provenance 论文认读

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: G6-trajectory-scoring
**Mode**: AFK
**Branch**: `research/R6-trajectory-papers`
**Scout**: [`../research/g10-2026-followup-papers.md`](../research/g10-2026-followup-papers.md)

## Question

真实多轮 agent evaluation 如何保存 workspace/environment state、累计 requirement、verifier version、artifact lineage、regression 与 fail-stop outcome？最终拿到答案时，怎样区分预期机制、直接暴露、记忆、外部查找、猜测或无证据声明？

## 新增一手来源

- EvoCode-Bench (`2605.24110`)
- How Do LLM Agents Actually Get the Flag? (`2608.26237`)
- Cross-View Correspondence Is a Measurement Intervention (`2608.17713`，与 R4 对账)
- R10 已认读的 LLMs Get Lost，用于单轮/多轮对账

## 产出

`../research/persistent-trajectory-papers.md`，给 G6 输出 session、workspace、verifier 与 evidence lineage 的最小协议。
