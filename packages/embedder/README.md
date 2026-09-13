---
description: "The embedder capability group: the abstract ctx.embedder / Reranker seam plus the default FakeHash stub and the external OpenAI-compatible HTTP provider for the data agent's retrieval/vectorization pipeline."
kind: "package-group"
---

# embedder/ — embedding & rerank seam family

English | [中文](README.zh.md)

## Summary

The `embedder/` group owns the data agent's embedding and rerank capability. The core `embedder` package defines the abstract `EmbedderService` (`ctx.embedder`) contract — `dim`, `modelId`, async `embed(texts) → float[][]` — plus the Reranker peer protocol (injected post-RRF) and the `InferenceError` taxonomy (unavailable / timeout / not_ready / dim_mismatch) that triggers BM25-only degradation in retrieval providers. Two providers ship: `embedder-fakehash` is the zero-dependency default (deterministic sha256 vectors, retrieval works out of the box), and `embedder-http` calls an external OpenAI-compatible endpoint (InfinityEmbedder, user-self-deployed heavy tier). All are **product** packages built in P5b; each README owns its per-package contract. Activation of the heavy tier is gated on D2c keep/regress evaluation.

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
