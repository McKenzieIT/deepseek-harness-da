---
description: "TODO: translate: Abstract retrieval seam (ctx.retrieval): hybrid BM25+vector+RRF retrieval contract for the data agent's schema-linking / context fetch (P5b)"
kind: "package-reference"
---

# @deepseek-ai/dsh-retrieval

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Abstract retrieval seam (ctx.retrieval): hybrid BM25+vector+RRF retrieval contract for the data agent's schema-linking / context fetch (P5b)

## 目录

- [Overview](#overview)
- [开发备注](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


抽象检索接缝（`ctx.retrieval`）：混合 BM25 + 向量 + RRF 检索契约，用于数据代理的 schema-linking 与上下文获取（P5b）。

<a id="overview"></a>
## Overview

定义检索 Service Definition：`ctx.retrieval.retrieve(query, {topK, mode}) → readonly RetrievalHit[]`，`RetrievalHit{id, score, payload, mode}`。本包为接缝半部分——声明提供方（如 `retrieval-inproc`）实现的契约。`search_data_sources` 工具执行软回退：`ctx.get('retrieval')` 探测——若已注册则 await 真实混合提供方；若缺失则回退到同步 `Bm25Linker`（P13b 现状）。接缝为异步（`Promise<readonly RetrievalHit[]>`）以支持基于 HTTP 的嵌入器。

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-retrieval` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## Model Experience

间接，通过 `search_data_sources` 和 nl2sql schema-linking 流水线，将检索到的数据源命中送入模型 prompt；专用的面向模型的 `retrieve` 工具延后（D2c 范围）。

#### KV Cache effect

无直接失效；具名消费方拥有任何请求前缀变更。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **延后的后端** — 外部向量存储（Qdrant、Milvus）和托管 sidecar 嵌入服务是计划中的升级梯度，但尚未集成到此接缝之后。
- **D2 keep/regress 评估驱动激活** — 混合提供方为 opt-in（`cordis.patch.yml` 中注释）；默认启动无 `ctx.retrieval` 注册（BM25Linker，无回归）。激活取决于 D2c keep/regress 评估结果。
- **retrieve-tool（面向模型）** — 暴露给模型的专用 `retrieve` 工具属 D2c 范围；P5b 仅交付管线内部接缝 + 提供方 + `search_data_sources` 中的软回退。
- **tsconfig.host refs** — 在 `tsconfig.host.json` references 中的注册因并发 host-typecheck-wiring session 而延后。
