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

---

## ⊕ 身份闸已预先完成（2026-10-06，R5/R9/R4/R8b 批次顺带）

下表经一次 28-id 批量 `curl -sSL "https://export.arxiv.org/api/query?id_list=…"`（`totalResults=28`，0 臆造）验真。**接手者可直接做全文认读，不必重跑身份闸**；但**引标题前仍须查 `arxiv.org/html/<id>` 渲染页**（元数据对身份权威、对标题不一定——见 [map](../map.md) §⚠ 验证 TODO 坑 2）。

| arXiv | ver / dates | Title（元数据，已验真） | Authors | Venue |
|---|---|---|---|---|
| `2608.24419` | v1，2026-08-25 | *A Judge Should Know What Changed:Construct Validity for LLM-as-a-Judge Evaluation*（原文元数据缺一个空格，照录） | Jianlin Chen, Wenhui Chen, Ziyao Lin, Chi Man Vong | 无 venue（39pp, 10 fig, 11 tables） |
| `2608.26623` | v1，2026-08-27 | *AgentJudgeBench: A Multi-Difficulty Benchmark for Evaluating LLM Judges on Agentic Tool-Calling* | Abhigya Verma, Amit Kumar Saha, Seganrasan Subramanian, Sai Harshitha Aluru | **EMNLP 2026 主会** |
| `2604.23178` | v2，2026-04-25 → 2026-06-24 | *Judging the Judges: A Systematic Evaluation of Bias Mitigation Strategies in LLM-as-a-Judge Pipelines* | Sadman Kabir Soumik（**单作者**） | **TMLR 2026**（journal_ref 实证） |
| `2606.00093` | v2，2026-05-25 → 2026-07-31 | ⚠ **双标题孤例**，见 [map](../map.md) §⚠ 验证 TODO 坑 2；**R4 与 R8b 已分别全文认读其统计协议半边与聚合半边**，本票勿重复，只取 calibration/confusion 相关 | Delip Rao, Chris Callison-Burch | 无 venue |

**已被本批次占用的角度（勿重做）**：`2606.00093` 的 estimand/CI/cluster 口径 → [R4](R4-significance-papers.md) §3–§7；其 micro/macro/item-level 池化与 decision rule → [R8b](R8b-judge-readout-papers.md)。本票的增量应是 **invariance vs construct sensitivity 的双向 mutation contract**。
