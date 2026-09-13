---
description: "The retrieval capability group: the abstract ctx.retrieval hybrid-search seam and the in-process BM25 + vector + RRF provider for the data agent's schema-linking pipeline."
kind: "package-group"
---

# retrieval/ — hybrid-retrieval seam family

English | [中文](README.zh.md)

## Summary

The `retrieval/` group owns the data agent's schema-linking and context-fetch retrieval capability. The core `retrieval` package defines the abstract `ctx.retrieval` contract — `retrieve(query, {topK, mode}) → readonly RetrievalHit[]` — the seam half that providers implement, consumed with a soft fallback by `search_data_sources` (probes `ctx.get('retrieval')`; degrades to the synchronous `Bm25Linker` when absent). `retrieval-inproc` is the default in-process provider: BM25 + in-memory vector cosine over `ctx.embedder` + RRF (k=60), degrading to BM25-only on `InferenceError`. All are **product** packages built in P5b; each README owns its per-package contract. The hybrid provider is opt-in, gated on D2c keep/regress evaluation. This group depends on the `embedder/` seam (`ctx.embedder`).

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`retrieval/`](retrieval/README.md) | Abstract retrieval seam (Def): `retrieve` contract + `RetrievalHit` vocabulary | `ctx.retrieval` |
| [`retrieval-inproc/`](retrieval-inproc/README.md) | In-process hybrid Provider: BM25 + vector cosine + RRF k=60, `ctx.embedder`-dependent, BM25-only degradation | registers on `ctx.retrieval` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Data Agent subsystem](../../docs/subsystems/data-agent.md#ctxembedder--embedderservice-abstract-seam) — the data-agent overlay this retrieval pipeline serves; the retrieval seam consumes the embedder contract documented there and feeds the nl2sql schema-linking / `search_data_sources` surface. (No dedicated `ctx.retrieval` Cordis-surface section exists yet — the seam is pipeline-internal; the embedder anchor is the nearest owning contract.)

<a id="dev-note"></a>
## Dev Note

None.
