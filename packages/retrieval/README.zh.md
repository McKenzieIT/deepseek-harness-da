---
description: "retrieval 能力包组：抽象 ctx.retrieval 混合检索接缝，以及用于数据代理 schema-linking 流水线的进程内 BM25 + 向量 + RRF 提供方。"
kind: "package-group"
---

# retrieval/ — 混合检索接缝家族

[English](README.md) | 中文

## 概述

`retrieval/` 组拥有数据代理的 schema-linking 与上下文获取检索能力。核心 `retrieval` 包定义抽象 `ctx.retrieval` 约定——`retrieve(query, {topK, mode}) → readonly RetrievalHit[]`——即提供方实现的接缝半部分，由 `search_data_sources` 以软回退方式消费（探测 `ctx.get('retrieval')`；缺失时降级到同步 `Bm25Linker`）。`retrieval-inproc` 是默认的进程内提供方：BM25 + 基于 `ctx.embedder` 的内存向量余弦 + RRF（k=60），在 `InferenceError` 时降级为纯 BM25。均为 **product** 包，于 P5b 建设；每个 README 负责各自的包级约定。混合提供方为 opt-in，取决于 D2c keep/regress 评估。本组依赖 `embedder/` 接缝（`ctx.embedder`）。

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
