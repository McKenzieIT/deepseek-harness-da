---
description: "retrieval 能力包组：抽象 ctx.retrieval 混合检索接缝，以及用于数据代理 schema-linking 流水线的进程内 BM25 + 向量 + RRF 提供方。"
kind: "package-group"
---

# retrieval/ — 混合检索接缝家族

[English](README.md) | 中文

## 概述

`retrieval/` 组拥有 data agent 的 schema linking 与上下文检索能力。`retrieval` 定义 `ctx.retrieval` 与结果词汇；`retrieval-inproc` 组合 BM25、经 `ctx.embedder` 取得的向量余弦，以及 reciprocal-rank fusion，并在推理不可用时降级为 BM25。混合 provider 在检索质量评测完成前保持 opt-in，各包 README 负责详细行为。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`retrieval/`](retrieval/README.zh.md) | 抽象检索接缝（Def）：`retrieve` 约定 + `RetrievalHit` 词汇 | `ctx.retrieval` |
| [`retrieval-inproc/`](retrieval-inproc/README.zh.md) | 进程内混合 Provider：BM25 + 向量余弦 + RRF k=60，依赖 `ctx.embedder`，纯 BM25 降级 | 注册到 `ctx.retrieval` |

-----

<a id="related-documentation"></a>
## 相关文档

- [数据代理子系统](../../docs/subsystems/data-agent.zh.md#ctxembedder--embedderservice-abstract-seam)——本检索流水线服务的 data-agent overlay；检索接缝消费那里记录的 embedder 约定，并馈入 nl2sql schema-linking / `search_data_sources` 面。（暂无专用 `ctx.retrieval` Cordis-surface 章节——该接缝为管线内部；embedder 锚点为最近的拥有约定。）

<a id="dev-note"></a>
## 开发备注

无。
