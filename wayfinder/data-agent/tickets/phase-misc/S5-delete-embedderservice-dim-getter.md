# S5 — Delete the dead EmbedderService.dim public getter

**Type**: task (deletion)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: [P5b](../phase-2/P5b-retrieval-vectorization-hardening.md), `map.md:108`, `packages/embedder/embedder/src/index.ts`, `packages/embedder/{embedder-fakehash,embedder-http}/src/index.ts`

## Question
The public `dim` getter on `EmbedderService` has no reader. Delete the getter (keep private `_dim`).

## Original design purpose
[P5b] (`map.md:108`): the abstract `EmbedderService` declares `dim`/`modelId`/`embed` async. `dim` = the embedding dimension (for cosine similarity / RRF). `FakeHashEmbedder` + `InfinityEmbedder` implement `get dim()`.

## Why no longer needed (the public getter)
- grep: **no reader** of the public `.dim` outside the getter declarations themselves.
- `dim` is used **internally via private `_dim`** only (`FakeHash` `hashVec`, `Infinity` expected-dim mismatch guard) — the public getter is dead surface.

## Replacement
The private `_dim` fields stay (internal use). If a future config/logging surface wants to display the cached embedding dimension, re-add a getter.

## Evidence
- `map.md:108` (P5b — "abstract EmbedderService dim/modelId/embed async").
- grep `\.dim\b` across `packages/embedder` + `packages/retrieval` (excluding `get dim`/`_dim`/`abstract`) → **no readers**.
- `FakeHashEmbedder.get dim` (embedder-fakehash) + `InfinityEmbedder.get dim` (embedder-http) + `abstract get dim()` (embedder) are the only matches.

## Risks
Low — private `_dim` stays for internal use; only the dead public getter is removed. A future consumer would re-add a getter (cheap).

## Acceptance criteria
- `abstract get dim()` (embedder) + the 2 `get dim()` impls (embedder-fakehash, embedder-http) removed.
- Private `_dim` fields unchanged.
- per-pkg `tsc` + embedder tests pass.

## Follow-ups
- If a config/logging surface needs the dimension, re-add a public getter.

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: no `.dim` reader exists (only a `dim.data` variable in semantic-layer test — unrelated). Removed: `abstract get dim()` from EmbedderService + `get dim()` impls from FakeHashEmbedder and InfinityEmbedder. Private `_dim` fields preserved. Per-pkg tsc clean (all 3 packages), 13/13 embedder tests pass.
