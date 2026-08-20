# P5 prototype — retrieval/vectorization seam

> Throwaway node prototype for P5 (wayfinder ticket `phase-2/P5-retrieval-vectorization.md`). **Stub-fidelity mirror of `rbi-retrieval/semantic`** (read-only source `/Users/mckenzie/workspace/reverse-bi`). **NOT real Cordis wiring** — production step (like P4 `prototypes/p4-query-engine/`).

## Run
```bash
node run.mjs --demo
```
(spawns `sidecar.mjs` for the external-plugin + degradation scenarios)

## What it proves (decisions D1–D3 + D6 scenarios)
- **D1**: `ctx.embedder` + `ctx.retrieval` seam; hybrid (BM25 + vec + RRF) internal to the retrieval provider; **reranker = peer-protocol** refinement AFTER RRF (mirrors rbi `unified_search.py`, NOT a top-level `ctx.reranker` seam).
- **D2 (c)**: pipeline-internal consumer (scenario 1) **+** additive `retrieve`-tool escape-hatch (scenario 6) — guided agentic hybrid.
- **D3**: embedder factory tiers (`FakeHashEmbedder` default zero-dep / `InfinityEmbedder` external OpenAI-compat HTTP) + `InferenceError`→BM25-only degradation (scenario 5).
- **D6**: 6 scenarios — index→search, hybrid RRF > single-channel, embedder-swap, reranker-inject, degradation, retrieval-tool escape-hatch.

## rbi mirror (stub fidelity, not a copy)
- `embedder.py` → `Embedder`/`Reranker` Protocol + `FakeHashEmbedder`/`FakeReranker` + `InfinityEmbedder`/`InfinityReranker` + `load_embedder`/`load_reranker` factories + `InferenceError`
- `retrieval.py` → `HybridRetriever` (BM25 + vec + RRF) + `rrf_fuse` + `_clamp_bm25_scores`
- `constants.py` → `RRF_K=60`, `RERANKER_NOISE_FLOOR=0.1`, `RERANKER_REJECT_FLOOR=0.2`
- `unified_search.py` → reranker applied as a refinement layer AFTER RRF (with noise/reject floors)

## NOT in this prototype (production / pending — → ticket surfaced tensions)
- **Real Cordis Service Definition registration** (`ctx.embedder`/`ctx.retrieval` seam wiring) — production step, not prototype scope (mirrors P4's "真 dsh-mcp-client Cordis 接线是生产步骤").
- **D4 storage**: in-mem cosine here; **sqlite-vec** (rbi) pending S2 TS-binding verdict. Seam contract unchanged; only the default provider's storage differs.
- **AGA-embeddings live-probe**: DashScope text-embedding via the intranet AGA gateway = UNVERIFIED (live-probe, expect NO — AGA relays chat, embeddings likely not relayed).
- **intranet heavy-embedder deployment**: needs a separate inference sidecar (chat rides AGA, embeddings likely don't).

## Files
- `run.mjs` — demo harness: seam stubs + `HybridRetriever` + 6 scenarios.
- `sidecar.mjs` — tiny OpenAI-compatible `/v1/embeddings` + `/rerank` HTTP service (fake-over-HTTP, mirrors rbi `InfinityEmbedder`/`InfinityReranker` wire).
