# P5 — 检索/向量化插件

**Type**: prototype
**Phase**: 2
**Status**: Unblocked

**Question**: `ctx.embedder` + `ctx.retrieval` seam + 默认轻量进程内 backend（sqlite-vec/in-mem + 轻量 embedder）+ 重模型可选外置插件（bge-m3/Qwen3-Embedding/Qwen3-Reranker）+ hybrid（BM25+向量→RRF→rerank）。

**Research**: → `../../research/vectorization-frontier.md`（已完成）。
