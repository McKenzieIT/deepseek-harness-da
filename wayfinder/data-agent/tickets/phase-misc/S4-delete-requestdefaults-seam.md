# S4 — Delete the empty RequestDefaults speculative seam (llm-dashscope)

**Type**: task (deletion)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: `packages/llm/llm-dashscope/src/{serialize,adapter,index}.ts`, `map.md` (no mention — speculative, not a design decision)

## Question
`RequestDefaults` is an empty speculative seam threaded but never read. Delete it.

## Original design purpose
`serialize.ts:21` JSDoc admits: "kept as a seam for future adapter-owned defaults." It mirrors `llm-deepseek`'s file structure (`src/{adapter,sse,translate,serialize,types,invariant,index}.ts`). It was **speculative generality** — a placeholder for adapter-owned request defaults that never materialized.

## Why no longer needed
- The interface is **empty** (`export interface RequestDefaults {}`).
- It is threaded (`adapter.ts:63` `defaults: RequestDefaults` field; `index.ts:181` `defaults: {}`) but the `defaults` field is **always `{}`** and **never read** — no consumer reads `RequestDefaults`.
- No map/ticket references it (not a design decision, pure speculative seam).

## Replacement
None needed (it was speculative, never used). If adapter-owned defaults are needed later, re-add with real content + a real consumer.

## Evidence
- `serialize.ts:21` `export interface RequestDefaults {}` (empty).
- `adapter.ts:30` `import type { RequestDefaults }`, `:63` `defaults: RequestDefaults`.
- `index.ts:44` `export type { RequestDefaults }`, `:181` `defaults: {}`.
- grep: no read of `defaults` beyond the declaration/assignment.

## Risks
None — empty, never read, no consumer.

## Acceptance criteria
- `RequestDefaults` interface (serialize.ts) + `defaults` field (adapter.ts) + `defaults: {}` line (index.ts) + the re-export (index.ts:44) removed.
- per-pkg `tsc` + llm-dashscope tests pass.

## Follow-ups
- If adapter-owned defaults become real, re-add with content + a consumer.

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: `RequestDefaults` interface is empty, `_defaults` param unused (prefixed `_`), `defaults` field always `{}` and never read. Removed: interface, field, param, re-export, assignment. Per-pkg tsc clean, 75/75 tests pass.
