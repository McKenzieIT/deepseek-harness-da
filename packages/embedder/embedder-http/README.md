# @deepseek-ai/dsh-embedder-http

English | [中文](README.zh.md)

External OpenAI-compatible HTTP embedder provider (InfinityEmbedder) + InfinityReranker peer for the data agent's retrieval pipeline (P5b heavy tier; user-self-deployed).

## Overview

Provides `InfinityEmbedder` — an embedder provider that calls an external OpenAI-compatible `POST /v1/embeddings` endpoint, and `InfinityReranker` calling `POST /rerank`. Configurable via `url`, `model`, and `timeout`. Designed for user-self-deployed inference services (T2 scenario: AGA-embeddings probe negative). Uses injectable `fetch` for testing without a live endpoint.

## Known Limitations and Deferred Work

- **No authentication** — current implementation assumes no auth token is required (user-self-deployed scenario). Auth-token injection via the credentials seam (`ctx.credentials`) is deferred.
- **Real embedder sidecar (Infinity/TEI/Ollama)** — a managed sidecar deployment model (vs. user-self-deployed) is deferred to a future production tier.
- **In-process bge-m3 / sqlite-vec** — local model inference and vector indexing are deferred upgrade paths; this provider is HTTP-only.
- **InferenceError degradation** — on `InferenceError` (unavailable/timeout/not_ready/dim_mismatch), the retrieval layer degrades to BM25-only. Error recovery and retry policies are provider-level concerns deferred to production hardening.
- **D2 keep/regress evals-driven activation** — whether to activate this provider by default is gated on D2c keep/regress evaluation results.
