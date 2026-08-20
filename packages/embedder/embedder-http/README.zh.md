# @deepseek-ai/dsh-embedder-http

[English](README.md) | 中文

外部 OpenAI 兼容 HTTP 嵌入器提供方（InfinityEmbedder）+ InfinityReranker 对等方，用于数据代理的检索管线（P5b 重量级梯度；用户自部署）。

## 概述

提供 `InfinityEmbedder`——调用外部 OpenAI 兼容 `POST /v1/embeddings` 端点的嵌入器提供方，及调用 `POST /rerank` 的 `InfinityReranker`。可通过 `url`、`model`、`timeout` 配置。设计用于用户自部署的推理服务（T2 场景：AGA-embeddings 探测为否定）。使用可注入的 `fetch` 以便在无活跃端点时进行测试。

## Known Limitations and Deferred Work

- **无认证** — 当前实现假设不需要 auth token（用户自部署场景）。通过凭证接缝（`ctx.credentials`）注入 auth-token 延后。
- **真实嵌入器 sidecar（Infinity/TEI/Ollama）** — 托管 sidecar 部署模型（相对于用户自部署）延后至未来生产梯度。
- **进程内 bge-m3 / sqlite-vec** — 本地模型推理和向量索引是延后的升级路径；此提供方仅支持 HTTP。
- **InferenceError 降级** — 在 `InferenceError`（unavailable/timeout/not_ready/dim_mismatch）时，检索层降级为仅 BM25。错误恢复和重试策略是提供方级别的关注点，延后至生产硬化。
- **D2 keep/regress 评估驱动激活** — 是否默认激活此提供方取决于 D2c keep/regress 评估结果。
