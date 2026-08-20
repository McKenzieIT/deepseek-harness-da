# @deepseek-ai/dsh-retrieval-inproc

English | [中文](README.zh.md)

In-process hybrid retrieval provider (BM25 + vector + RRF k=60, in-memory cosine similarity, `ctx.embedder` dependency; InferenceError triggers BM25-only degradation) for the data agent (P5b default tier).

## Overview

Implements the `ctx.retrieval` contract with a `HybridRetriever` that fuses BM25 (Okapi BM25, k1=1.5, b=0.75) and vector similarity (in-memory cosine over `ctx.embedder` vectors) via Reciprocal Rank Fusion (RRF, k=60, rank 1-indexed). On `InferenceError` from the embedder, degrades gracefully to BM25-only results. Includes `buildCorpus` for document indexing and reranker post-RRF noise-floor filtering (RERANKER_NOISE_FLOOR=0.1). Field weights: `{id:3, description:1, metric:4}`.

## Known Limitations and Deferred Work

- **sqlite-vec upgrade** — vector indexing is currently in-memory cosine brute-force; upgrading to sqlite-vec for persistent, indexed ANN search is a planned tier.
- **External backends (Qdrant / Milvus)** — integration with dedicated vector databases for large-scale corpora is deferred.
- **D2 keep/regress evals-driven activation** — this provider is opt-in (commented in bundle config); activation by default (hybrid vs. BM25Linker alone) awaits D2c evaluation results.
- **Field weights are simplified** — current weights `{id:3, description:1, metric:4}`; rbi has richer per-field weights (field_name, desc, domain) which require P6b `ctx.schema` context to implement fully.
- **Reranker is noise-floor only** — post-RRF reranker applies a static noise floor (0.1) filter; learned reranking models and REJECT_FLOOR / no_strong_match logic are deferred to the consumer layer.
- **tsconfig.host refs** — registration in `tsconfig.host.json` deferred due to concurrent host-typecheck-wiring session.
