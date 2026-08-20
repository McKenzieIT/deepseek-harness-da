# P5b — 检索/向量化 生产硬化

**Type**: prototype
**Phase**: 2
**Assignee**: —（unclaimed）
**Status**: Unblocked（graduated from P13b Q1 finding 2026-08-20）
**Graduated from**: P13b grilling Q1（P5/P6 生产 gap：P5 仅 prototype resolved，生产包未 ship）
**Blocked by**: P5（resolved, prototype）、P13b（resolved，local `RetrievalLinker` contract consumer）

**Question**: P5 prototype（`prototypes/p5-retrieval-vectorization/`）→ 生产 `ctx.retrieval` seam + 真 provider（hybrid BM25+vec+RRF k=60 + bge-m3/Qwen3 embedder [用户自部署经 OpenAI 兼容插件，T2: AGA-embeddings NO live-probe 实证]），替换 P13b 本地 `RetrievalLinker` 薄默认（additive swap，seam 契约不变，P13b 引擎逻辑不变）。

**Design**: P5 6 决策 + P13b Q1 contract（`RetrievalLinker.retrieve(query, {topK, mode}) → readonly RetrievalHit[]`，`RetrievalHit{id, score, payload, mode}`——见 `packages/data/nl2sql-engine/src/bm25-linking.ts`）。生产 `packages/{retrieval,embedder}/...`（镜像 P4/credentials）。P13b `Bm25Linker` 默认 → 真 `ctx.retrieval` provider swap（additive，`RetrievalLinker` 接口不变）。embedder 外置（P5 `InfinityEmbedder`，OpenAI 兼容 `POST /v1/embeddings`）/in-proc bge-m3/sqlite-vec/Qdrant 升级档（P5 既定梯）；`InferenceError`→BM25-only 降级。P5b 也声明 `ctx.embedder` seam。

**Research**: → `../../research/{vector-rbi-mirror.md, vector-embedder-intranet.md, retrieval-consumer-model.md, vectorization-frontier.md, vector-seam-structure.md, vector-backend-ts.md, t2-aga-embeddings-probe.md}` + P5 ticket + P13b ticket Q1。
