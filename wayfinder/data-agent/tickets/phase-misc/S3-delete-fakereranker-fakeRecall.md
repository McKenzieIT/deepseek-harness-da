# S3 — Delete FakeReranker + fakeRecall from embedder-fakehash

**Type**: task (deletion)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: [P5](../phase-2/P5-retrieval-vectorization.md), [P5b](../phase-2/P5b-retrieval-vectorization-hardening.md), [D2c-impl](D2c-impl-retrieve-tool-shipping.md), [D2d](D2d-retrieval-quality-reframe.md), `map.md:57/108/122/124`

## Question
`FakeReranker` + `fakeRecall` in `packages/embedder/embedder-fakehash` are measured harmful + have no production consumer. Delete them.

## Original design purpose
[P5]/[P5b]: the retrieval hybrid (BM25+vec+RRF) has a **Reranker peer-protocol** (RRF后注入, non-top-level seam). `FakeReranker` was a **zero-dep stub reranker** — to exercise the reranker peer protocol in tests/no-egress evals without a real cross-encoder.

## Why no longer needed
- [D2d] **measured `FakeReranker` harmful** (64% < 84% on implicit cases; "FakeReranker 有害").
- [D2c-impl] decision recorded: "**不默认挂 FakeReranker per F2**" + "retrieve-tool 软回退 Bm25Linker 不挂 FakeHash".
- No production mount: no bundle/preset wires the reranker peer into `retrieval-inproc`'s config (grep: only `embedder-fakehash/tests/fakehash.spec.ts` references `FakeReranker`/`fakeRecall`).

## Replacement
The **Reranker peer protocol** (in the `embedder` seam, `packages/embedder/embedder`) stays + **`InfinityReranker`** (`packages/embedder/embedder-http`, real cross-encoder tier) covers the real-reranker need. `FakeReranker` was only a test stub.

## Evidence
- `map.md:57` (P5 reranker peer), `:108` (P5b), `:122` (D2c — "FakeReranker 有害 64%, 不默认挂"), `:124` (D2d re-frame).
- `tickets/phase-2/P5` + `P5b` + `phase-misc/D2c-impl-retrieve-tool-shipping.md` ("不默认挂 FakeReranker per F2").
- grep: `FakeReranker`/`fakeRecall` consumers = only `packages/embedder/embedder-fakehash/tests/fakehash.spec.ts`.

## Risks
Lose the zero-dep reranker stub for future no-egress evals. Mitigated: the Reranker peer protocol + `InfinityReranker` remain; a real cross-encoder is the production path.

## Acceptance criteria
- `FakeReranker` class + `fakeRecall` helper + their dedicated test removed from `embedder-fakehash/src/index.ts`.
- The Reranker peer protocol (`packages/embedder/embedder`) + `InfinityReranker` (`embedder-http`) unchanged.
- per-pkg `tsc` + embedder tests pass.

## Follow-ups
- If a no-egress eval later needs a stub reranker, re-add a clearly-test-only one (not exported).

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: `FakeReranker`/`fakeRecall` references outside embedder-fakehash are only JSDoc comments in `embedder/src/index.ts` (line 8) and `tool-retrieve/src/index.ts` (lines 31, 224) — no actual imports/consumers. Deleted: `fakeRecall` function, `FakeReranker` class, `Reranker` type import, corresponding tests. Per-pkg tsc clean, 3/3 tests pass.
