# @deepseek-ai/dsh-retrieval-inproc

[English](README.md) | 中文

进程内混合检索提供方（BM25 + 向量 + RRF k=60，内存余弦相似度，依赖 `ctx.embedder`；InferenceError 触发仅 BM25 降级），用于数据代理（P5b 默认梯度）。

## 概述

以 `HybridRetriever` 实现 `ctx.retrieval` 契约，融合 BM25（Okapi BM25，k1=1.5，b=0.75）与向量相似度（基于 `ctx.embedder` 向量的内存余弦）经 Reciprocal Rank Fusion（RRF，k=60，rank 从 1 开始）。嵌入器返回 `InferenceError` 时优雅降级为仅 BM25 结果。包含 `buildCorpus` 用于文档索引，以及重排器 post-RRF 噪声底板过滤（RERANKER_NOISE_FLOOR=0.1）。字段权重：`{id:3, description:1, metric:4}`。

## Model Experience

间接，通过 `ctx.retrieval` 接缝和 `search_data_sources` / nl2sql schema-linking 流水线，将其融合检索命中送入模型 prompt；该 provider 自身不暴露任何面向模型的 tool。

#### KV Cache effect

无直接影响；下游 `search_data_sources` 消费方拥有检索命中带来的任何请求前缀变更。

## Known Limitations and Deferred Work

- **sqlite-vec 升级** — 向量索引当前为内存余弦暴力搜索；升级到 sqlite-vec 以实现持久化、带索引的 ANN 搜索是计划中的梯度。
- **外部后端（Qdrant / Milvus）** — 与专用向量数据库集成以支持大规模语料库延后。
- **D2 keep/regress 评估驱动激活** — 此提供方为 opt-in（bundle 配置中注释）；是否默认激活（混合 vs. 仅 BM25Linker）等待 D2c 评估结果。
- **字段权重简化** — 当前权重 `{id:3, description:1, metric:4}`；rbi 有更丰富的 per-field 权重（field_name、desc、domain），完整实现需要 P6b `ctx.schema` 上下文。
- **重排器仅为噪声底板** — post-RRF 重排器应用静态噪声底板（0.1）过滤；学习型重排模型及 REJECT_FLOOR / no_strong_match 逻辑延后至消费方层。
- **tsconfig.host refs** — 在 `tsconfig.host.json` 中的注册因并发 host-typecheck-wiring session 而延后。
