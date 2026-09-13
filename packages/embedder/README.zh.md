---
description: "embedder 能力包组：抽象 ctx.embedder / Reranker 接缝，加上默认的 FakeHash stub 与外部 OpenAI 兼容 HTTP 提供方，用于数据代理的检索／向量化流水线。"
kind: "package-group"
---

# embedder/ — 嵌入与重排接缝家族

[English](README.md) | 中文

## 概述

`embedder/` 组拥有数据代理的嵌入与重排能力。核心 `embedder` 包定义抽象 `EmbedderService`（`ctx.embedder`）约定——`dim`、`modelId`、异步 `embed(texts) → float[][]`——以及 Reranker 对等协议（RRF 后注入）和触发检索提供方降级为纯 BM25 的 `InferenceError` 分类（unavailable / timeout / not_ready / dim_mismatch）。两个提供方交付：`embedder-fakehash` 是零依赖默认档（确定性 sha256 向量，检索开箱即用），`embedder-http` 调用外部 OpenAI 兼容端点（InfinityEmbedder，用户自部署重档）。均为 **product** 包，于 P5b 建设；每个 README 负责各自的包级约定。重档激活取决于 D2c keep/regress 评估。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`embedder/`](embedder/README.zh.md) | 抽象 `EmbedderService` 接缝 + Reranker 对等协议 + `InferenceError` 词汇 | `ctx.embedder` |
| [`embedder-fakehash/`](embedder-fakehash/README.zh.md) | 零依赖确定性 sha256 stub 提供方（默认档）+ FakeReranker 对等 | 注册到 `ctx.embedder` |
| [`embedder-http/`](embedder-http/README.zh.md) | 外部 OpenAI 兼容 HTTP 提供方（InfinityEmbedder）+ InfinityReranker（重档） | 注册到 `ctx.embedder` |

-----

<a id="related-documentation"></a>
## 相关文档

- [数据代理子系统 — `ctx.embedder`](../../docs/subsystems/data-agent.zh.md#ctxembedder--embedderservice-abstract-seam)——embedder 接缝生成的 Cordis-surface 约定及其在 data-agent overlay 中的位置。

<a id="dev-note"></a>
## 开发备注

无。
