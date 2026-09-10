# ADR-0002：UI Presenter 组合——Plan B（保留 tool.call.toolview）而非 Plan A（并入 view-registry）

[English](0002-ui-presenter-composition-plan-b.md) | 中文

**Status**：Accepted（2026-09-09） **Context**：R-DA-UI-PRESENTER-COMPOSITION 票、UM-flow Phase-B-adapt、data-agent upstream-sync

## Decision

fork 的 4 个 UI presenter（`ui-present-table`、`ui-present-decomposition`、`ui-suggest-followups`、`ui-semantic-layer`）**保留注册在 `tool.call.toolview` slot**（upstream slot，非 fork 自造），通过 **repoint type imports 到拆分包 + re-home `blockText` helper + 解 `isLatestTurn` snapshot-access gap** 迁出 zombie `dsh-client-runtime`。**不**走 Plan A（重注册为 `ctx.uiConversation.views.register` / `events.register` conversation-node renderer）。

## Context

upstream 把单体 `@deepseek-ai/dsh-client-runtime`（"zombie"）拆成专注包（`ui-conversation`、`ui-chat`、`ui-tool`、`client-store`、`api-session-controller`、`client-connection`、`ui-renderer`）。4 个 presenter 仍从 zombie import 类型 + helper。两条迁移路径：

- **Plan A（并入 view-registry）**：把 4 个 presenter 重注册为 `ConversationViewDefinition` / `ConversationNodeDefinition`，经 `ctx.uiConversation.views.register()` / `events.register()`——view-tab（chat、trajectory）+ node-kind（tool-call、assistant-step）的注册方式。
- **Plan B（保持独立）**：presenter 留在 `tool.call.toolview`（按 wire-tool 名 keyed，由 `ToolCallTree` 在 `tool-call` node 内部渲染）；repoint imports（`ClientContext`→cordis `Context`、`SessionId`/`ISessions`→`dsh-session`/`api-session-controller`、`ConversationSnapshot`/`ToolCallBlock`→`ui-conversation`）+ re-home `blockText` + 解 `isLatestTurn` gap。

## Consequences

### 选定：Plan B

三条已验证铁证 foreclose Plan A（在 synced base `upstream/resync-2026-09-08` 上接地）：

1. **`tool.call.toolview` 是 upstream slot**（`ui-tool/src/client/contract/slots.ts:26`，经 `git ls-tree` 确认在 upstream `c389f96bf3`）。upstream 自己就注册 toolview 在此（ask-question、bash、read、search、web、todo）。fork 4 presenter 是 peer——保留该 slot 非 fork workaround（UM-ADAPT 判据 4 ✓）。
2. **presenter 是 tool-name-keyed sub-view，由 `ToolCallTree`（`ui-tool/src/client/tool/ToolCallTree.tsx`）在 `tool-call` node 内部渲染**——非 view-tab（`conversation.view` slot）/node-kind（`conversation.chat.node` slot）。Plan A 的 `views.register`/`events.register` 架构错位（那俩是给 per-target builder / node-kind 的）。
3. **`projectBlock` 不计算 `isLatestTurn`/`blockText`**——Plan A"builder 内建 helper"前提对 synced base 为假。两 helper 是 fork-only（zombie `runtime/src/client/cards.ts:16,33`）。

Plan B 镜像 upstream 自己的 toolview 实现（`ui-tool/src/client/tool/toolviews/read-row.tsx`：同 `tool.call.toolview` slot、同 `ctx.slots.inject`/`register` 模式、imports 从 cordis / `ui-slots` / ui-tool 自有 contract，不从 zombie）。

### 为何不选 Plan A

- 架构错层：`views.register` 收 per-target builder；`events.register` 收 node-kind definition。presenter 两者皆非——是 tool-name-keyed 原子子视图。
- Plan A 前提（builder 内建 `isLatestTurn`/`blockText`）为假——接地发现 `projectBlock` 不算这俩，故 Plan A 不会让 helper 消失，仍需 re-home。
- ticket 对 Plan B 的"marginal fork-workaround 风险"担忧不成立——`tool.call.toolview` 是 upstream，保留它非对抗新逻辑的 workaround。

### `isLatestTurn` gap（Phase-2 执行细节）

Plan B 唯一真子问题：presenter 需 chat-specific `isLatestTurn` 信号，但 `tool.call.toolview` entries 只拿 `useConversation`（target-neutral），拿不到 `useChat`（chat-specific，仅经 `CHAT_NODE_INJECT` 注入 `conversation.chat.node`——`ui-chat/apply.ts:104`）。`ToolCallOwnerProps`（`ui-tool/contract/slots.ts:55`）无 snapshot hook。4 种解法（倾向：给 `ToolCallOwnerProps` 加 `isLatestTurn: boolean`，由 `ToolCallTree` 算好传下）；留 Phase-2 session 定。fork 特有需求——upstream 的 `read` toolview 不用 `isLatestTurn`。

### Blocks

R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2（4 presenter 迁移按 Plan B 执行）、zombie 包删除、UM10 typecheck 全绿。

## 补充：snapshot-access via `ChatSnapshot.legacy`（2026-09-12，Phase-2 执行）

Phase-2 执行暴露了原 Decision 的 4 个 `isLatestTurn` 选项未 anticipated 的 gap：upstream `ConversationSnapshot`（`ui-conversation/contract/snapshot.ts`）是 **thin shell** `{ views, activeTargets }`——无顶层 `nodes`/`chat`/`turnTimings`（zombie 的是 monolith；其 `nodes` 是 "Legacy top-level compatibility field mirrored from the registered Chat Definitions"，upstream 拆 monolith 时删了此 legacy compat 字段）。

**解法（不改 Decision——填未 anticipated 细节）**：option **③'**——经 `ChatSnapshot.legacy` 的 path rewrite。`ChatSnapshot`（chat view 的 snapshot，经 `snapshot.views.get('chat')` 取——chat target 在 `ui-chat/apply.ts` 注册，`ConversationViewSnapshotMap` 在 `ui-chat/contract/snapshot.ts` augmented `chat: ChatSnapshot`）有 `legacy: LegacyConversationSlice`（`ui-chat/contract/snapshot.ts`）——upstream **有意保留**的 compat bridge（注释："Compatibility projection backing StatsLine and the legacy top-level snapshot fields"），含 `nodes: readonly ConversationNode[]` + `turnTimings` + `turnEnds` + `partial` + `runningCalls`。

- `snapshot.nodes` → `snapshot.views.get('chat')?.legacy.nodes ?? []`
- `snapshot.turnTimings` → `snapshot.views.get('chat')?.legacy.turnTimings ?? new Map()`
- `snapshot.chat.timeline` → `snapshot.views.get('chat')?.timeline`

消费者经 tsconfig ref 加 `../ui-chat` + 文件顶 `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'`（load `declare module` augmentation，使 `views.get('chat')` typecheck 为 `ChatSnapshot`）。

此与 Plan B 一致（消费 upstream public 契约，presenter-local，非 fork workaround）：`ChatSnapshot.legacy` 是 upstream 对已删 compat 字段的有意替代，非 fork 新造。option ①（不充分——只解 isLatestTurn 不解 `snapshot.nodes`）、②（fights carrier-neutral `ToolCallOwnerProps`）、④（Plan A 重评——不必）仍拒。

`agentPresets`/Typert 注册 **非 blocker**：`TypertRemoteNamespaceMap` augmentation 在 full `tsc -b` transitively loads；subagent 报的 bounded-`-p` 残留是假阳性（R-DA-TYPERT-REMOTE-REGISTRATION 的域）。

验证：`tsc -b tsconfig.client.json --force` = 0 errors（144→0）；vitest 全绿；boot（`tsc -b tsconfig.host.json`）OK——upstream 包 `api-session-controller`/`ui-renderer`/`ui-conversation` 在 `cordis.patch.yml` mount 接管 `ctx.sessions`/`ctx.slots`/`ctx.conversationViews`（zombie `apply()` 是 fork-only 死代码，删 = no-op for boot wiring）。见 R-DA-UI-PRESENTER-COMPOSITION Resolution 补充 + R-DA-CLIENT-RUNTIME-DECOMMISSION Resolution。
