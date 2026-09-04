# Agent Note: Demote the dormant scopeId threading through the tool-execution pipeline

Status: proposed

## Problem

`ToolExecutionInput.scopeId` (`packages/core/tools/src/index.ts:339`, 15-line JSDoc + field) and `AgentOptions.scopeId` (`packages/core/agent/src/runtime-types.ts:44`) are threaded through three fork-own sites (`agent-loop/src/tool-calls.ts:82`, `tools/src/code-mode.ts:479`, `tools/src/index.ts:1404`) via conditional spreads (`...x !== undefined ? { scopeId: x } : {}`). The JSDoc explicitly says "no caller sets `AgentOptions.scopeId` yet" and "Phase 5 call sites begin resolving a tenant->scope and supplying it here." A grep for `scopeId:` setters across `packages/ + examples/ + scripts/ + apps/` finds every assignment is on the eval/query path (`QuerySpec.scopeId`, `SemanticLayerService` config `scopeId`) — NOT `AgentOptions.scopeId`. The field is write-never: no production code constructs an `AgentOptions` with `scopeId`. The dormant readers (`tool-retrieve/src/index.ts:322` passes `exec.scopeId` to `getEnrichedLinker`; `tool-search-data-sources` similarly) both handle `undefined` via `ACTIVE_SENTINEL` already, so removing the always-undefined field changes no behavior. This is distinct from evidence-query's `scopeId`, which IS live (GA-GT1 Phase 3b: per-scope eval-record filter, per-scope layout, `resolveRoot(scopeId)`, `coverageQuery`/`gapAnalysis`/`reachabilityDelta`/`assetHealth(scopeId)`) — that `scopeId` flows through evidence-query's own method params, not through `AgentOptions`/`ToolExecutionInput`. No implemented Agent Note justifies the tool-exec threading (the cited "Decision D4" is about `AgentOptions` vs `Session`, not shipping a dormant field).

## Proposal

Demote — remove the `scopeId` field from `ToolExecutionInput`, the three threading spreads, the `AgentOptions.scopeId` field, and their JSDoc/comments until Phase 5 has a caller that sets `AgentOptions.scopeId`. The dormant readers in `tool-retrieve`/`tool-search-data-sources` already handle `undefined` via `ACTIVE_SENTINEL`, so update them to pass `undefined` explicitly (or drop the parameter). Re-add when a setter lands.

## What we give up

A forward-looking seam for per-scope tool execution. It is write-never today, and the three-line threading re-add is trivial when a setter lands, so removal now costs little.

## Alternatives considered

**Keep the field as a forward-looking seam for Phase 5.** The JSDoc documents the Phase 5 intent, so a setter could land. It lost because the field is write-never today (every `scopeId:` setter is on the eval/query path, not `AgentOptions`), the dormant readers already handle `undefined` via `ACTIVE_SENTINEL`, and re-adding the three-line threading when a setter lands is trivial — carrying a write-never field invites readers to assume per-scope tool execution works when it does not.

**Demote only the threading, keep the `AgentOptions.scopeId` field.** Preserve the option type for forward-looking typing. It lost because a field with no setter and three conditional spreads is the threading this note removes; keeping the field without the threading leaves the same dormant surface half-removed, and the live evidence-query `scopeId` (GA-GT1 Phase 3b) flows through its own method params, so this field is not needed for that.

## Acceptance criteria

- `grep -rn "AgentOptions.scopeId|ToolExecutionInput.scopeId|scopeId:" packages/*/src/` returns only the dormant readers (now passing `undefined` explicitly) and zero setters.
- `pnpm typecheck` clean across `core/tools`, `core/agent-loop`, `core/agent`, `data/tool-retrieve`, `data/tool-search-data-sources`.
- The `ACTIVE_SENTINEL` active-path in `tool-retrieve`/`tool-search-data-sources` is unchanged (it already handled `undefined`).

## Risks

Cross-domain change (`core/tools`, `core/agent-loop`, `core/agent`, `data/tool-retrieve`, `data/tool-search-data-sources`) — coordinate in one PR to avoid a mid-flight type mismatch. If a Phase 5 ticket is actively about to set `AgentOptions.scopeId`, defer the removal to avoid churn. Do NOT touch evidence-query's live `scopeId` (GA-GT1 Phase 3b) — that is a different, live feature flowing through its own method params. Interacts with the Bm25Linker cache-fold note ([[fold-bm25linker-cache-across-search-tools]]): that note's shared `getEnrichedLinker(schema, scopeId)` already accepts `undefined`, so demoting the upstream source composes cleanly.
