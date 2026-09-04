# Agent Note: Fold the per-scope Bm25Linker cache shared across the three data-asset search tools

Status: proposed

## Problem

The per-scope, version+root-keyed `Bm25Linker` cache — `ACTIVE_SENTINEL` WeakMap, `getEnrichedLinker`, the `corpusVersion`/`resolveScopeRoot` root-guard check — is duplicated near-verbatim across three fork-own tool packages:

- `packages/data/tool-search-data-sources/src/index.ts` (~447-477)
- `packages/data/tool-retrieve/src/index.ts`
- `packages/data/tool-search-schema/src/index.ts`

The three copies have **already drifted**: `tool-retrieve` builds its `Bm25Linker` from `schema.loadRetrievalCorpus(scopeId)` (events-only), while its two siblings prefer `loadRetrievalCorpusAll?.() ?? loadRetrievalCorpus()` (full tables+events+metrics). `tool-retrieve` therefore silently misses tables and metrics, and its module docstring's "recall == search_data_sources" contract is false. Production consumers: all three tools are mounted live in the data-agent bundle (`cordis.patch.yml`) and called by the agent in the search/discovery phase; tests exercise each in isolation but no test asserts cross-tool recall parity, so the drift went unnoticed.

## Proposal

Extract a single shared `getEnrichedLinker(schema, scopeId)` + a `SchemaCorpusSource` interface (the `loadRetrievalCorpusAll ?? loadRetrievalCorpus` + `corpusVersion` + `resolveScopeRoot` surface) into `@deepseek-ai/dsh-nl2sql-engine` (which already owns `Bm25Linker` + `RetrievalLinker`) or a small new `dsh-data-retrieval-util`. All three tools import it. The extraction carries the `loadRetrievalCorpusAll ?? loadRetrievalCorpus` fallback (the corrected form) so `tool-retrieve`'s drift is fixed by construction.

## What we give up

Three private copies let each tool tweak its cache key independently; folding them commits the three to one cache shape. That shape is already identical in two of three sites, and the third's divergence is a bug, not a feature, so the lost flexibility is the flexibility to reintroduce this bug.

## Alternatives considered

**Keep three copies so each tool can tweak its cache key independently.** It lost because two of three copies are already identical and the third's divergence (`tool-retrieve` using events-only `loadRetrievalCorpus` while siblings use `loadRetrievalCorpusAll ?? loadRetrievalCorpus`) is a bug that makes `tool-retrieve` silently miss tables and metrics, breaking its own "recall == search_data_sources" contract — the lost flexibility is the flexibility to keep this bug.

**Standardize on `tool-retrieve`'s events-only form.** Picking the narrower corpus as the shared shape. It lost because the events-only form is the drifted, buggy one; the proposal carries `loadRetrievalCorpusAll ?? loadRetrievalCorpus` (the full tables+events+metrics form) as the shared shape, fixing `tool-retrieve`'s recall by construction rather than propagating its gap to the other two tools.

## Acceptance criteria

- One definition of `getEnrichedLinker`/`SchemaCorpusSource`; the three tools' `index.ts` import it and contain no `ACTIVE_SENTINEL`/`WeakMap`/`corpusVersion` copy.
- `tool-retrieve`'s recall matches `search_data_sources` on the K11 corpus (a cross-tool parity test is added).
- `pnpm run lint && pnpm run typecheck && pnpm run test` green; the data-agent bundle boots + `search_data_sources`/`retrieve`/`search_schema` resolve the enriched linker through the shared path.

## Risks

Public API: none (the cache is private to each tool; the extraction is internal). Behavior: `tool-retrieve` gains tables+metrics in its linker, which changes its retrieval ranking — a correction, but it shifts any eval that pinned retrieve's events-only behavior (re-run the retrieval eval). The shared cache lives in `dsh-nl2sql-engine` (already a peer of all three tools via the bundle), so no new dependency edge.
