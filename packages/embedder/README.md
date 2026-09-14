---
description: "The embedder capability group: the abstract ctx.embedder / Reranker seam plus the default FakeHash stub and the external OpenAI-compatible HTTP provider for the data agent's retrieval/vectorization pipeline."
kind: "package-group"
---

# embedder/ — embedding & rerank seam family

English | [中文](README.zh.md)

## Summary

The `embedder/` group owns embedding and reranking for data-agent retrieval. `embedder` defines `ctx.embedder`, the vector and reranker contracts, and classified inference failures. `embedder-fakehash` provides deterministic zero-dependency vectors for the default tier; `embedder-http` connects to an external OpenAI-compatible service. Retrieval providers consume this seam and may degrade to BM25 when inference is unavailable. Heavy providers remain opt-in pending retrieval-quality evaluation.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`embedder/`](embedder/README.md) | Abstract `EmbedderService` seam + Reranker peer protocol + `InferenceError` vocabulary | `ctx.embedder` |
| [`embedder-fakehash/`](embedder-fakehash/README.md) | Zero-dependency deterministic sha256 stub provider (default tier) + FakeReranker peer | registers on `ctx.embedder` |
| [`embedder-http/`](embedder-http/README.md) | External OpenAI-compatible HTTP provider (InfinityEmbedder) + InfinityReranker (heavy tier) | registers on `ctx.embedder` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Data Agent subsystem — `ctx.embedder`](../../docs/subsystems/data-agent.md#ctxembedder--embedderservice-abstract-seam) — the generated Cordis-surface contract for the embedder seam and its place in the data-agent overlay.

<a id="dev-note"></a>
## Dev Note

None.
