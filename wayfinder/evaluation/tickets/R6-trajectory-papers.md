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

---

## ⊕ 身份闸已预先完成（2026-10-06，R5/R9/R4/R8b 批次顺带）

下表经一次 28-id 批量 `curl -sSL "https://export.arxiv.org/api/query?id_list=…"`（`totalResults=28`，0 臆造）验真。**接手者可直接做全文认读**；**引标题前仍须查 `arxiv.org/html/<id>` 渲染页**（见 [map](../map.md) §⚠ 验证 TODO 坑 2）。注意 `http://export.arxiv.org` **返回 301**，须用 `https` + `-L`。

| arXiv | ver / dates | Title（元数据，已验真） | Authors | Venue |
|---|---|---|---|---|
| `2605.24110` | v1，2026-05-22 | *EvoCode-Bench: Evaluating Coding Agents in Multi-Turn Iterative Interactions* | Haiyang Shen, Xuanzhong Chen, Wendong Xu, Yun Ma +2 | 无 venue（**自述 Work in Progress / preprint**，32pp） |
| `2608.26237` | v1，2026-08-26 | *How Do LLM Agents Actually Get the Flag? Trace-Level Provenance for Agentic Offensive Security Evaluation* | Kimberly Milner, Minghao Shao, Nanda Rani, Haoran Xi +7 | 无 venue |
| `2608.17713` | v1，2026-08-18 | *Cross-View Correspondence Is a Measurement Intervention: Two-Sided Validation for Agent Evaluation and Credit Assignment* | Zhen Zhang, Ahmad Hafez, Amr Alanwar | 无 venue |

**三篇全部无 venue** ⇒ 证据等级偏低，采纳须靠论证结构。**与 R4 的对账点**：`2608.17713` 自称「measurement intervention」，而 [R4](R4-significance-papers.md) 已裁定本仓普查式 run 的 CI 须声明 `sampling_model`；本票须说明 trajectory 侧的 estimand 是否引入第四层 cluster（session）。
