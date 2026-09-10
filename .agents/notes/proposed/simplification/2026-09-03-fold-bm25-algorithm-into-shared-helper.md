# Agent Note: Fold the drifted BM25 algorithm into one shared home

Status: proposed

## Problem

The BM25 scoring algorithm (`BM25Okapi` class + `buildCorpus` + `FIELD_WEIGHTS` + the idf formula) is independently translated from the same reverse-bi source (`rank_bm25.BM25Okapi` + `unified_search._FIELD_WEIGHTS`) in two packages, and they have **already drifted** on two load-bearing axes: (a) idf formula — `packages/retrieval/retrieval-inproc/src/hybrid.ts:151` uses the textbook `Math.max(0, Math.log((n - d + 0.5) / (d + 0.5)))` ("clamp >= 0 mirroring rbi"); `packages/data/nl2sql-engine/src/bm25-linking.ts:118` uses Lucene-style `Math.log(1 + (n - d + 0.5) / (d + 0.5))`; (b) field weights — `hybrid.ts:40` weights `{ id: 3, description: 1, metric: 4 }`; `bm25-linking.ts:162` weights `{ name: 3, description: 1 }` (no `metric`, different key). Both surfaces are live: `HybridRetriever` backs `ctx.retrieval` (retrieval-inproc, mounted in the data-agent bundle); `Bm25Linker` backs the three search tools + schema-gateway (nl2sql-engine). The drift means the same query against the same corpus yields different rankings depending on which retriever a tool reaches — a silent correctness divergence, not a style issue. (`tokenize` differs too: retrieval-inproc imports `@deepseek-ai/dsh-embedder/src/tokenize.ts` at `hybrid.ts:24`; nl2sql-engine hand-rolls its own at `bm25-linking.ts:60` — a related fold, not the verbatim dup the survey claimed.) Distinct from the Bm25Linker cache-fold note ([[fold-bm25linker-cache-across-search-tools]]): that folds the per-scope cache shape across three tools; this folds the algorithm itself across two packages.

## Proposal

Fold. Extract one `BM25Okapi` + `buildCorpus` + `FIELD_WEIGHTS` into a single home (`@deepseek-ai/dsh-retrieval-inproc` re-exports them already, or a small `dsh-bm25` util). nl2sql-engine consumes the shared copy and drops its `bm25-linking.ts` algorithm (~180 lines). Pick ONE idf formula and ONE field-weight shape (the metric-weighted form is the richer one). The `Bm25Linker`/`RetrievalLinker` interface stays nl2sql-engine's concern; only the algorithm + tokenizer collapse. Separately, nl2sql-engine's hand-rolled `tokenize` (`bm25-linking.ts:60`) can fold into the embedder's tokenize (`hybrid.ts:24` already imports it) — the CJK bigram+unigram walk is the same surface. Alternative, deferred until the P5 `ctx.retrieval` provider swap is imminent: dep-swap `BM25Okapi` for `wink-bm25-text-search` after verifying health + TS fit, keeping the name-match bonus — but `Bm25Linker` is throwaway then, so the fold-first is the better near-term move.

## What we give up

Two private algorithm copies let each retriever tune idf/weights independently; folding commits both to one shape. That independence is already a bug source (the drift), so the lost flexibility is the flexibility to reintroduce silent divergence.

## Alternatives considered

**Keep the two copies so each retriever can tune idf and field weights independently.** The two surfaces serve different consumers (`ctx.retrieval` vs the search tools), so independent tuning might be wanted. It lost because the copies have already drifted on two load-bearing axes (idf formula and field weights) with no test catching it, and the divergence is a silent correctness bug — the lost flexibility is the flexibility to reintroduce silent divergence.

**Dep-swap to `wink-bm25-text-search` instead of folding.** If the P5 `ctx.retrieval` provider swap is imminent, `Bm25Linker` is throwaway, so dep-swap is cleaner than folding first. It lost as sequencing (the proposal defers it until P5 is imminent) but not as the chosen path: P5 is not imminent, the drift is live today, and folding fixes the divergence now while leaving the dep-swap option open.

## Acceptance criteria

- One `BM25Okapi`/`buildCorpus`/`FIELD_WEIGHTS` definition (grep confirms a single home).
- idf formula + field-weight shape unified; the chosen shape documented in the shared module.
- Retrieval eval passes; `search_data_sources`/`retrieve`/`search_schema` snapshot parity tests pass after folding.
- If the idf/field-weight unification shifts rankings, the shift is documented and the eval baseline is re-captured intentionally.

## Risks

Re-rank risk is real — the idf/field-weight unification shifts both retrievers' rankings. Run the retrieval eval + the three search-tool snapshot parity tests before/after and capture any intentional baseline shift. If the P5 `ctx.retrieval` provider swap is imminent, defer (the whole `Bm25Linker` is throwaway then). Do not collapse the `Bm25Linker`/`RetrievalLinker` interface — only the algorithm + tokenizer.
