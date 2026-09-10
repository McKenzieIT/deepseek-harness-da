# ADR-0002: UI Presenter Composition — Plan B (keep tool.call.toolview) over Plan A (merge into view-registry)

English | [中文](0002-ui-presenter-composition-plan-b.zh.md)

**Status**: Accepted (2026-09-09) **Context**: R-DA-UI-PRESENTER-COMPOSITION ticket, UM-flow Phase-B-adapt, data-agent upstream-sync

## Decision

The 4 fork UI presenters (`ui-present-table`, `ui-present-decomposition`, `ui-suggest-followups`, `ui-semantic-layer`) stay registered in the **`tool.call.toolview`** slot (an upstream slot, not a fork invention) and migrate off the zombie `dsh-client-runtime` by **repointing type imports to the split packages + re-homing the `blockText` helper + solving the `isLatestTurn` snapshot-access gap**. NOT Plan A (re-register as `ctx.uiConversation.views.register` / `events.register` conversation-node renderers).

## Context

Upstream decommissioned the monolith `@deepseek-ai/dsh-client-runtime` ("zombie") into focused packages (`ui-conversation`, `ui-chat`, `ui-tool`, `client-store`, `api-session-controller`, `client-connection`, `ui-renderer`). The 4 presenters still import types + helpers from the zombie. Two migration approaches:

- **Plan A (merge into view-registry)**: Re-register the 4 presenters as `ConversationViewDefinition` / `ConversationNodeDefinition` via `ctx.uiConversation.views.register()` / `events.register()` — the way view-tabs (chat, trajectory) + node-kinds (tool-call, assistant-step) register.
- **Plan B (keep-standalone)**: Keep the presenters in `tool.call.toolview` (keyed by wire-tool name, rendered inside the `tool-call` node by `ToolCallTree`); repoint imports (`ClientContext`→cordis `Context`, `SessionId`/`ISessions`→`dsh-session`/`api-session-controller`, `ConversationSnapshot`/`ToolCallBlock`→`ui-conversation`) + re-home `blockText` + solve the `isLatestTurn` gap.

## Consequences

### Chosen: Plan B

Three verified findings foreclose Plan A (grounded in the synced base `upstream/resync-2026-09-08`):

1. **`tool.call.toolview` is an upstream slot** (`ui-tool/src/client/contract/slots.ts:26`, confirmed in upstream `c389f96bf3` via `git ls-tree`). Upstream itself registers toolviews there (ask-question, bash, read, search, web, todo). The 4 fork presenters are peers — keeping the slot is not a fork workaround (UM-ADAPT criterion 4 ✓).
2. **The presenters are tool-name-keyed sub-views rendered inside the `tool-call` node by `ToolCallTree`** (`ui-tool/src/client/tool/ToolCallTree.tsx`) — not view-tabs (`conversation.view` slot) or node-kinds (`conversation.chat.node` slot). Plan A's `views.register`/`events.register` is architecturally misplaced (those are for per-target builders / node-kinds).
3. **`projectBlock` does not compute `isLatestTurn`/`blockText`** — so Plan A's "builder internalizes the helpers" premise is false for the synced base. The helpers are fork-only (zombie `runtime/src/client/cards.ts:16,33`).

Plan B mirrors upstream's own toolview implementation (`ui-tool/src/client/tool/toolviews/read-row.tsx`: same `tool.call.toolview` slot, same `ctx.slots.inject`/`register` pattern, imports from cordis / `ui-slots` / ui-tool's own contract — not the zombie).

### Why not Plan A

- Architecturally wrong layer: `views.register` takes per-target builders; `events.register` takes node-kind definitions. The presenters are neither — they are tool-name-keyed atomic sub-views.
- Plan A's premise (the builder internalizes `isLatestTurn`/`blockText`) is false — the grounding found `projectBlock` does not compute them, so Plan A would not make the helpers disappear; it would still require re-homing them.
- The ticket's "marginal fork-workaround risk" worry for Plan B is unfounded — `tool.call.toolview` is upstream, so keeping it is not a workaround against the new logic.

### `isLatestTurn` gap (Phase-2 execution detail)

Plan B's one real sub-problem: the presenters need the chat-specific `isLatestTurn` signal, but `tool.call.toolview` entries get only `useConversation` (target-neutral), not `useChat` (chat-specific, injected only into `conversation.chat.node` via `CHAT_NODE_INJECT` — `ui-chat/apply.ts:104`). `ToolCallOwnerProps` (`ui-tool/contract/slots.ts:55`) has no snapshot hook. Four solution options (lean: extend `ToolCallOwnerProps` with `isLatestTurn: boolean` computed by `ToolCallTree` and passed down); deferred to the Phase-2 session. This is a fork-specific need — upstream's `read` toolview does not use `isLatestTurn`.

### Blocks

R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 (4-presenter migration executes Plan B), zombie package deletion, UM10 typecheck-green.

## Addendum: Snapshot-access via `ChatSnapshot.legacy` (2026-09-12, Phase-2 execution)

Phase-2 execution surfaced a gap the Decision's 4 `isLatestTurn` options didn't anticipate. Upstream's `ConversationSnapshot` (`ui-conversation/contract/snapshot.ts`) is a **thin shell** `{ views, activeTargets }` — no top-level `nodes`/`chat`/`turnTimings`. The zombie's was a monolith (`runtime/src/client/sessions/conversation.ts`); its `nodes` was a "Legacy top-level compatibility field mirrored from the registered Chat Definitions" that upstream removed when it split the monolith.

**Resolution (does not change the Decision — fills an unanticipated detail)**: option **③'** — a path rewrite via `ChatSnapshot.legacy`, an intentional compat slice upstream preserved inside the chat view's snapshot (`ui-chat/contract/snapshot.ts`), accessible via `snapshot.views.get('chat')` (chat target registered in `ui-chat/apply.ts`, `ConversationViewSnapshotMap` augmented `chat: ChatSnapshot` in `ui-chat/contract/snapshot.ts`):

- `snapshot.nodes` → `snapshot.views.get('chat')?.legacy.nodes ?? []`
- `snapshot.turnTimings` → `snapshot.views.get('chat')?.legacy.turnTimings ?? new Map()`
- `snapshot.chat.timeline` → `snapshot.views.get('chat')?.timeline`

Consumers load the `ConversationViewSnapshotMap.chat` augmentation via a tsconfig ref to `../ui-chat` + a type-only side-effect `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'`.

This is consistent with Plan B (consume upstream's public contract, presenter-local, no fork workaround): `ChatSnapshot.legacy` is upstream's intentional replacement for the removed compat fields, not a fork invention. Options ① (insufficient — solves `isLatestTurn` not `snapshot.nodes`), ② (fights carrier-neutral `ToolCallOwnerProps`), ④ (Plan A re-eval — unnecessary; presenters remain tool-name-keyed sub-views) remain rejected.

`agentPresets`/Typert-registration is NOT a blocker: the `TypertRemoteNamespaceMap` augmentation loads transitively in full `tsc -b`; a bounded-`-p` residual a subagent reported was a false positive (R-DA-TYPERT-REMOTE-REGISTRATION's domain).

Validated: `tsc -b tsconfig.client.json --force` = 0 errors (144→0); vitest all green; boot (`pnpm --filter @deepseek-ai/dsh-web-app bundle`) OK — upstream packages `api-session-controller`/`ui-renderer`/`ui-conversation` mounted in `cordis.patch.yml`接管 `ctx.sessions`/`ctx.slots`/`ctx.conversationViews` (zombie `apply()` was fork-only dead code; deletion = no-op for boot wiring). See R-DA-UI-PRESENTER-COMPOSITION Resolution addendum + R-DA-CLIENT-RUNTIME-DECOMMISSION Resolution.
