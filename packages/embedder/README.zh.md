---
description: "embedder 能力包组：抽象 ctx.embedder / Reranker 接缝，加上默认的 FakeHash stub 与外部 OpenAI 兼容 HTTP 提供方，用于数据代理的检索／向量化流水线。"
kind: "package-group"
---

# embedder/ — 嵌入与重排接缝家族

[English](README.md) | 中文

## 概述

`embedder/` 组拥有 data agent 检索所需的嵌入与重排能力。`embedder` 定义 `ctx.embedder`、向量与 reranker 约定，以及分类后的推理失败。`embedder-fakehash` 提供默认的确定性零依赖向量；`embedder-http` 连接外部 OpenAI-compatible 服务。检索 provider 消费此 seam，并可在推理不可用时降级到 BM25。重型 provider 在检索质量评测完成前保持 opt-in。

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
