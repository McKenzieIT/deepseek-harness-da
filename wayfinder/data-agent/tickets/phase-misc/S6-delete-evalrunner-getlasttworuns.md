# S6 — Delete EvalRunnerService.getLastTwoRuns() + lastTwoRuns field

**Type**: task (deletion)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: `packages/eval/eval-runner-service/src/index.ts`, `packages/data/tool-trigger-eval/src/index.ts` (seam interface), `map.md` (no mention — impl detail)

## Question
`EvalRunnerService.getLastTwoRuns()` + the `lastTwoRuns` field are test-only + redundant with `trigger_eval`'s inline pair. Delete them.

## Original design purpose
`EvalRunnerService.getLastTwoRuns()` + `lastTwoRuns` field track the last 2 eval runs (likely intended for `trigger_eval` to reference the prior run pair).

## Why no longer needed
- grep: callers are **only** `packages/eval/eval-runner-service/tests/eval-runner-service.spec.ts` (lines 71/77/125) — **no production caller**.
- `trigger_eval` uses an **inline pair** (not `getLastTwoRuns`) — the live path does not call it.

## Replacement
`trigger_eval`'s inline pair (the live path).

## Evidence
- grep `getLastTwoRuns`/`lastTwoRuns` outside `packages/eval/eval-runner-service/` → only the spec file.
- The seam interface declares it (`packages/data/tool-trigger-eval/src/index.ts`), the impl at `eval-runner-service/src/index.ts`, maintained in `runBatch`, pinned by tests.

## Risks
Public seam API change — but pre-release (no external consumer), and the only callers are the package's own tests. Mitigated: remove the interface declaration + impl + field + the pinning tests together.

## Acceptance criteria
- `getLastTwoRuns()`, the `lastTwoRuns` field, its update in `runBatch`, the interface declaration in `tool-trigger-eval`, + the pinning tests removed.
- `trigger_eval`'s inline pair unchanged.
- per-pkg `tsc` + eval-runner-service tests pass.

## Follow-ups
- If an observability surface later needs last-N-runs, re-add with a real consumer.

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: `getLastTwoRuns` has no production caller — only in `tool-trigger-eval` interface declaration (never called at runtime) + eval-runner-service tests. Removed: method, field, `runBatch` update logic, interface declaration, test mock, test assertions. Per-pkg tsc clean (both packages), trigger-eval tests 6/6 pass, eval-runner-service 4/4 unit tests pass (2 integration tests with pre-existing env-dep failures unchanged).
