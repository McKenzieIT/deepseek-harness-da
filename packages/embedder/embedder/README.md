# @deepseek-ai/dsh-embedder

English | [中文](README.zh.md)

Abstract embedder seam (`ctx.embedder`) + Reranker peer protocol + InferenceError vocabulary for the data agent's retrieval/vectorization pipeline (P5b).

## Overview

Defines the `EmbedderService extends Service` contract: `dim`, `modelId`, `embed(texts) → float[][]` async. Also declares the Reranker peer protocol (`modelId`, `rerank` async — injected post-RRF, not a top-level seam) and the `InferenceError` taxonomy (unavailable / timeout / not_ready / dim_mismatch) that triggers BM25-only degradation in retrieval providers.

## Known Limitations and Deferred Work

- **Real embedder sidecar not yet shipped** — production deployment via Infinity, TEI, or Ollama sidecar is deferred; current providers are FakeHash (stub) and InfinityEmbedder (user-self-deployed HTTP).
- **sqlite-vec upgrade tier** — in-process vector indexing via sqlite-vec is a planned upgrade path but not yet implemented.
- **External vector backends (Qdrant / Milvus)** — integration with dedicated vector databases is deferred to a future tier.
- **D2 keep/regress evals-driven activation** — whether to activate hybrid retrieval by default vs. BM25-only is gated on D2c keep/regress evaluation results; the seam ships but activation is deferred.
- **Auth-token via credentials seam** — embedder authentication through the credentials service is deferred; current InfinityEmbedder assumes no auth (user-self-deployed T2 scenario).
