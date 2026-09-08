# R-DA-UI-PRESENTER-COMPOSITION — data-agent UI presenters vs new ui-conversation view-registry architecture

**Type**: grilling (design)
**Phase**: refactor (post-merge)
**Status**: open
**Assignee**: unclaimed
**Priority**: MEDIUM
**Related**: UM7 (client-runtime→split-packages repoint is the MINIMAL migration; this ticket is the post-merge DESIGN question); d5 audit; map § Context Layer; deep-research 2026-09-08

## Question

Should the fork's data-agent UI presenters (`ui-present-table`, `ui-present-decomposition`, `ui-suggest-followups`, `ui-semantic-layer`, `ui-context-layer`) compose with the new upstream `ui-conversation` view-registry architecture (register as conversation-node renderers via `ConversationViewRegistry`/`ConversationEventRegistry`) rather than remaining standalone packages that import `ToolCallBlock`/`ConversationSnapshot` to render tool-call results?

## Background (from UM7 deep research 2026-09-08)

Upstream restructured the old monolithic `@deepseek-ai/dsh-client-runtime` (`packages/client/runtime`) into 5+ split packages:
- `SlotRegistry` → `@deepseek-ai/dsh-client-ui-renderer` (`packages/client/ui-renderer/src/client/registry.ts`)
- `ToolCallBlock`/`ConversationSnapshot`/`ConversationNodeAssembler`/`ConversationLocationIndex` → `@deepseek-ai/dsh-client-ui-conversation` (`packages/client/ui-conversation/src/client/contract/{snapshot,records,slots}.ts`)
- `createSnapshotStore`/`defineStore`/`SnapshotStore`/`EngineStoreHandle` → `@deepseek-ai/dsh-client-store` (`packages/client/store/src/contract.ts`) — NEW package
- `ISessions`/`createScope`/`scopeOf`/`AgentScopeHandle` → `@deepseek-ai/dsh-api-session-controller` (`packages/api/session-controller/src/client/{scope,contract/sessions}.ts`) — NEW package
- `SessionId`/`SessionEvent` → `@deepseek-ai/dsh-client-connection` (stayed)
- `ClientContext` → GONE (was `type ClientContext = Context`; upstream ui now imports `Context` from `@deepseek-ai/cordis` directly)

The new upstream architecture centers conversation-node rendering in `ui-conversation`/`ui-chat`/`ui-tool` (the `ConversationEventRegistry`/`ConversationViewRegistry` pattern). The fork's data-agent presenters are ADDITIVE PEERS that consume `ToolCallBlock`/`ConversationSnapshot` to render tool-call results (tables/decompositions/followups/semantic-layer/context-layer). They imported these from the (now-deleted) monolith.

UM7's per-type repoint (delete `client/runtime` + repoint each presenter's imports to the specific split packages) is the MINIMAL migration to unblock the merge — it is NOT over-patching, but it is NOT the final design either. The composition question (standalone-peer vs register-with-view-registry) is a DESIGN decision requiring prototype + grilling, not an import repoint.

## Scope

1. Audit each data-agent presenter's rendering entry point (how it currently renders: standalone `SlotRegistry` slot vs conversation-node).
2. Evaluate registering via `ConversationViewRegistry` (the new upstream pattern) vs current standalone-slot approach.
3. Decide: merge-into-ui-conversation (presenters become conversation-node renderers) vs keep-standalone (presenters remain additive peers importing the split types).
4. If merge: prototype the registration + grilling.

## Why-not-a-patch

It's a composition-DESIGN decision (where presenters live in the UI architecture) requiring prototype + grilling, not a one-time import repoint. The UM7 repoint unblocks the merge; this ticket decides the post-merge composition.

## Blocks / Blocked-by

- Post-merge (after UM7's repoint + the merge commits).
- Doesn't block the merge (UM7's repoint is the minimal migration).

## Other refactor tickets surfaced by the deep research (LOW, nice-to-have post-merge)

- **R-DA-DASHSCOPE-STRICT-SYNC** (LOW): establish a sync contract so `llm-dashscope` tracks `llm-deepseek`'s streaming-identity + brand changes automatically (shared `acceptIdentity` helper extraction OR sync-test gate). The UM7 minimal-patch (port `acceptIdentity` + `CallId`→`ToolCallId`) is the one-time fix; this is the maintenance discipline.
- **R-DA-SQLITE-STORAGE-ALIGNMENT** (LOW): evaluate whether fork's `storage-sqlite` (kv) + `data/audit` (node:sqlite relational) should route through the new upstream `storage-domain` hub rather than direct sqlite, for storage-substrate consistency. (Neither is based on the dropped session-persistence-sqlite; both are deliberate sqlite choices.)
- **R-DA-JSONL-FIBER-LIFECYCLE-VERIFY** (LOW, tied to B-DA1): verify `ctx.effect` disposer capture (PB-COMPLY R2) still binds to the correct fiber under the new jsonl write-ownership lease (cross-process). The lease changes write-ownership, which could interact with fiber disposal timing. Runtime systematic-debug (B-DA1 task #10).
- **B-DA1** (already tracked, task #10): preset-autojoin's `agent/created` fire-and-forget race (its own docstring admits the design flaw) — real fix = move preset-join to the awaited setup path (session-controller `@Remote('prompt')`/`@Remote('create')`), retire `preset-autojoin`. Post-build runtime systematic-debug.
