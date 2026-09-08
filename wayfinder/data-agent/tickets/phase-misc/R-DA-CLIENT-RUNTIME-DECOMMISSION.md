# R-DA-CLIENT-RUNTIME-DECOMMISSION — retire the fork-local client/runtime zombie; migrate 45 packages to upstream's public modular seams

**Type**: refactor (post-merge)
**Phase**: refactor
**Status**: open
**Assignee**: unclaimed
**Priority**: HIGH (structural debt — the antithesis of the additive-only/modular-seam strategy)
**Related**: R-DA-UI-PRESENTER-COMPOSITION (presenter view-registry migration is a sub-part); design-research 2026-09-08; map § additive-only; UM7 (minimal-patch keeps zombie alive)

## Question

How to decommission the fork-local zombie `packages/client/runtime` (a full copy of the deleted monolith `@deepseek-ai/dsh-client-runtime`, load-bearing for 45 fork packages) — migrating those packages to upstream's public modular seams (`./client` exports of `ui-conversation`/`api-session-controller`/`client-connection`/`store`/`ui-renderer` + cordis `Context` + the `ui-conversation` view-registry registration pattern) + redistributing the zombie's boot wiring (`SessionRuntime`/`SlotRegistry`/`ConversationViewRegistry`/`ConversationNodeAssembler` constructed in `apply()` via `immediately: true`) to the new split packages?

## Background (from design-research 2026-09-08)

Upstream DELETED the monolithic `@deepseek-ai/dsh-client-runtime` + SPLIT its ~60 types across 5+ focused packages (`ui-renderer`/`ui-conversation`/`store`/`api-session-controller`/`client-connection`; `ClientContext`→gone, use cordis `Context`). The fork KEPT the entire old `client/runtime` as a fork-local zombie (a full standalone copy, NOT a re-export shim) — load-bearing for 45 packages that import `ClientContext`/`SessionId`/`ISessions`/`SlotRegistry`/`ToolCallBlock`/`ConversationSnapshot`/`isLatestTurn`/`blockText`/etc. from `dsh-client-runtime/client`.

The zombie is the antithesis of the additive-only/modular-seam strategy: a fork-local copy of a deleted monolith that perpetuates the old `ClientContext` type, the old `ConversationSnapshot` shape (`chat.timeline.turnOrder`/`turnTimings` — GONE upstream), + the old `ctx.slots.register` registration pattern (vs the new `ctx.uiConversation.views.register`/`ConversationNodeDefinition`).

The merge (UM7) keeps the zombie alive as a minimal-merge compatibility shim (only its `transportError` import repointed to `dsh-client-connection` + its `dsh-host-apiproxy` dep removed, to unblock `pnpm install`). The full decommission is post-merge.

## Scope

1. **Audit** the 45 packages importing `dsh-client-runtime/client`; map each imported symbol to its new public `./client` export home (per the verified mapping).
2. **Migrate** each package's imports to the public `./client` exports + replace `ClientContext` with cordis `Context`.
3. **Migrate the presenters** (`ui-present-table`/`ui-present-decomposition`/`ui-suggest-followups`/`ui-semantic-layer`/`ui-context-layer`) to the `ui-conversation` view-registry pattern: register as `ConversationNodeDefinition` via `ctx.uiConversation.views.register()`, receive projected view-snapshots through builders (eliminating `isLatestTurn`/`blockText` — they have NO upstream equivalent; the old snapshot model is gone). (Overlaps R-DA-UI-PRESENTER-COMPOSITION.)
4. **Redistribute the boot wiring**: the zombie's `apply()` (with `immediately: true` + `inject: ['client-connection','typert-registry','api-remotes']`) constructs `SessionRuntime`/`SlotRegistry`/`ConversationViewRegistry`/`ConversationNodeAssembler` at boot. Move each to its new split-package owner (`ui-conversation`'s `UiConversation` assembly, `client-connection`'s connection plugin, `client-store`, etc.).
5. **Delete** `packages/client/runtime` + remove its tsconfig references (`tsconfig.client.json` + `test-support/client-runtime`) + clean `pnpm-workspace.yaml`.
6. **Verify** typecheck + the boot still wires `ctx.sessions`/`ctx.slots`/`ctx.uiConversation` correctly.

## Why-not-a-patch

It's a boot-order migration + snapshot-model change + registration-pattern change across 45 packages — NOT an import repoint. The merge's minimal-patch (keep zombie + repoint transportError) unblocks `pnpm install`; this ticket does the real alignment.

## Blocks / Blocked-by

- Post-merge (after the merge commits + UM11 PR + UM12 CI re-sweep).
- Doesn't block the merge (the minimal-patch keeps the zombie alive).
- Overlaps R-DA-UI-PRESENTER-COMPOSITION (the presenter view-registry migration is a sub-part).
## Session A finding (2026-09-08)

zombie `packages/client/runtime`（fork-only，0 upstream commits in 449，absent at base `d347e703`+tip `c389f96bf3`）在 synced base `8112743d69` 仍存。R-DA 入口（UM14 发现）：
1. `client/runtime/src/client/slots.ts:41` 声明 slot `'root'`（owner props `RootOwnerProps` 未 export）+ 与 `packages/client/ui-renderer/src/client/registry.ts:43` 的 `'root'` 重复 → 阻塞 `gen-client-catalog`（CORDIS catalog regen）。
2. `client/runtime/tsconfig.json:20` 引用已删 `packages/host/apiproxy`（TS6053；449-impact 确认 apiproxy pre-base 已删）→ client tsc error。
R-DA 解这两处后，CORDIS catalog regen + client tsc 的 zombie 相关 error 可解。

