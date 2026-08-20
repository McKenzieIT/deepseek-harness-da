# @deepseek-ai/dsh-retrieval

[English](README.md) | 中文

抽象检索接缝（`ctx.retrieval`）：混合 BM25 + 向量 + RRF 检索契约，用于数据代理的 schema-linking 与上下文获取（P5b）。

## 概述

定义检索 Service Definition：`ctx.retrieval.retrieve(query, {topK, mode}) → readonly RetrievalHit[]`，`RetrievalHit{id, score, payload, mode}`。本包为接缝半部分——声明提供方（如 `retrieval-inproc`）实现的契约。`search_data_sources` 工具执行软回退：`ctx.get('retrieval')` 探测——若已注册则 await 真实混合提供方；若缺失则回退到同步 `Bm25Linker`（P13b 现状）。接缝为异步（`Promise<readonly RetrievalHit[]>`）以支持基于 HTTP 的嵌入器。

## Known Limitations and Deferred Work

- **延后的后端** — 外部向量存储（Qdrant、Milvus）和托管 sidecar 嵌入服务是计划中的升级梯度，但尚未集成到此接缝之后。
- **D2 keep/regress 评估驱动激活** — 混合提供方为 opt-in（`cordis.patch.yml` 中注释）；默认启动无 `ctx.retrieval` 注册（BM25Linker，无回归）。激活取决于 D2c keep/regress 评估结果。
- **retrieve-tool（面向模型）** — 暴露给模型的专用 `retrieve` 工具属 D2c 范围；P5b 仅交付管线内部接缝 + 提供方 + `search_data_sources` 中的软回退。
- **tsconfig.host refs** — 在 `tsconfig.host.json` references 中的注册因并发 host-typecheck-wiring session 而延后。
