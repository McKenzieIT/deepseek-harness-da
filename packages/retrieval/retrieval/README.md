# @deepseek-ai/dsh-retrieval

English | [中文](README.zh.md)

Abstract retrieval seam (`ctx.retrieval`): hybrid BM25 + vector + RRF retrieval contract for the data agent's schema-linking and context fetch (P5b).

## Overview

Defines the retrieval Service Definition: `ctx.retrieval.retrieve(query, {topK, mode}) → readonly RetrievalHit[]` with `RetrievalHit{id, score, payload, mode}`. This is the seam half — it declares the contract that providers (e.g. `retrieval-inproc`) implement. The `search_data_sources` tool performs a soft fallback: `ctx.get('retrieval')` probe — if registered, awaits the real hybrid provider; if absent, falls back to the synchronous `Bm25Linker` (P13b status quo). The seam ships async (`Promise<readonly RetrievalHit[]>`) to support HTTP-based embedders.

## Known Limitations and Deferred Work

- **Deferred backends** — external vector stores (Qdrant, Milvus) and managed sidecar embedding services are planned upgrade tiers but not yet integrated behind this seam.
- **D2 keep/regress evals-driven activation** — the hybrid provider is opt-in (commented in `cordis.patch.yml`); default boot has no `ctx.retrieval` registered (BM25Linker, no regression). Activation gated on D2c keep/regress evaluation outcomes.
- **retrieve-tool (model-facing)** — a dedicated `retrieve` tool exposed to the model is D2c scope; P5b only ships the pipeline-internal seam + provider + soft fallback in `search_data_sources`.
- **tsconfig.host refs** — registration in `tsconfig.host.json` references deferred due to concurrent host-typecheck-wiring session.
