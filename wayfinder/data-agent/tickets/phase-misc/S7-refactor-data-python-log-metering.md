# S7 — Refactor data-python host log metering to reuse jsonStringBytesUpTo

**Type**: task (refactor — reuse sibling helper, delete hand-rolled)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: `packages/code-runtime/code-runtime-data-python/src/index.ts`, `packages/code-runtime/code-runtime-python/src/protocol.ts`, [.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md](../../../../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)

## Question
`data-python`'s host log ledger hand-rolls an allocating byte meter that a sibling package already provides non-allocating. Reuse the sibling helper.

## Original design purpose
`DataPythonCodeRuntime.execute()` meters each forged fd-3 `log` frame against the log budget by materializing the full escaped form: `JSON.stringify(frame.text)` + `Buffer.byteLength(...)`. This counts the bytes the log frame will consume.

## Why redo (refactor)
- The sibling `packages/code-runtime/code-runtime-python/src/protocol.ts:355` already has `jsonStringBytesUpTo(text, maxBytes)` — a **non-allocating** string meter (counts the escaped byte length up to a cap without materializing the escaped copy).
- `data-python` hand-rolls the allocating version — violates the "prefer maintained deps over hand-rolling" policy (the dependency-over-hand-rolling Agent Note).

## Replacement
Export `jsonStringBytesUpTo` from `protocol.ts` (it already exists at line 355) + import it in `data-python`'s host log-metering, replacing the inline `JSON.stringify`+`Buffer.byteLength` block.

## Evidence
- `code-runtime-python/src/protocol.ts:355` `function jsonStringBytesUpTo(text, maxBytes): number | undefined` (exists, used internally by the protocol package).
- `data-python` hand-rolled `JSON.stringify(frame.text)` + `Buffer.byteLength` block (host log ledger).
- The dependency-over-hand-rolling Agent Note (`.agents/notes/implemented/process/2026-07-26-...`) sets the bar.

## Risks
- Cross-package: adds one export to the published `code-runtime-python` protocol surface (currently internal). Confirm the export doesn't widen the package's public API undesirably.
- The scanner's `undefined`-on-overflow contract must match the ledger's `>budget` check — verify the semantics align (both count escaped bytes up to a cap).

## Acceptance criteria
- `data-python` imports + uses `jsonStringBytesUpTo` from `code-runtime-python/protocol`.
- The hand-rolled `JSON.stringify`+`Buffer.byteLength` block + its dedicated test removed.
- per-pkg `tsc` (both packages) + `data-python` tests pass; the ledger's byte accounting unchanged (same values, non-allocating).

## Follow-ups
- If other code-runtime packages hand-roll the same meter, reuse the helper there too.

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: `jsonStringBytesUpTo` (protocol.ts:355) uses the same strict-`>` contract as the ledger's budget check; both count the full JSON-escaped byte length. Exported `jsonStringBytesUpTo` from `code-runtime-python/src/protocol.ts` + re-export from index. Replaced `JSON.stringify(frame.text)` + `Buffer.byteLength(...)` block with non-allocating `jsonStringBytesUpTo` call. Both packages tsc clean, 23/23 data-python tests pass (including maxLogBytes budget enforcement test).
