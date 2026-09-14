---
description: "The retrieval capability group: the abstract ctx.retrieval hybrid-search seam and the in-process BM25 + vector + RRF provider for the data agent's schema-linking pipeline."
kind: "package-group"
---

# retrieval/ — hybrid-retrieval seam family

English | [中文](README.zh.md)

## Summary

The `retrieval/` group owns schema-linking and context retrieval for the data agent. `retrieval` defines the `ctx.retrieval` contract and result vocabulary. `retrieval-inproc` combines BM25, vector cosine through `ctx.embedder`, and reciprocal-rank fusion, degrading to BM25 when inference is unavailable. The hybrid provider remains opt-in pending retrieval-quality evaluation; each package README owns its detailed behavior.

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
