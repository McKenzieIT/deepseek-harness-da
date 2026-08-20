# @deepseek-ai/dsh-embedder

[English](README.md) | 中文

抽象嵌入器接缝（`ctx.embedder`）+ Reranker 对等协议 + InferenceError 词汇表，用于数据代理的检索/向量化管线（P5b）。

## 概述

定义 `EmbedderService extends Service` 契约：`dim`、`modelId`、`embed(texts) → float[][]` 异步方法。同时声明 Reranker 对等协议（`modelId`、`rerank` 异步——RRF 后注入，非顶层 seam）及 `InferenceError` 分类（unavailable / timeout / not_ready / dim_mismatch），在检索提供方中触发 BM25-only 降级。

## Model Experience

无，因为 embedder 接缝为检索提供方生成检索相似度向量和重排分数，不注册任何 prompt、tool、schema 或 session 事件。

#### KV Cache effect

无直接影响；嵌入服务于检索相似度，不进入 LLM 上下文。

## Known Limitations and Deferred Work

- **真实嵌入器 sidecar 未上线** — 通过 Infinity、TEI 或 Ollama sidecar 的生产部署延后；当前提供方为 FakeHash（stub）和 InfinityEmbedder（用户自部署 HTTP）。
- **sqlite-vec 升级档** — 通过 sqlite-vec 实现进程内向量索引是计划中的升级路径，但尚未实现。
- **外部向量后端（Qdrant / Milvus）** — 与专用向量数据库的集成延后至未来梯度。
- **D2 keep/regress 评估驱动激活** — 是否默认激活混合检索（vs. 仅 BM25）取决于 D2c keep/regress 评估结果；接缝已交付但激活延后。
- **经 credentials seam 的 auth-token** — 通过凭证服务的嵌入器认证延后；当前 InfinityEmbedder 假设无 auth（用户自部署 T2 场景）。
