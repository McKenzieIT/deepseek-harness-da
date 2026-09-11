# R-DA-CLIENT-RUNTIME-DECOMMISSION — retire the fork-local `client/runtime` zombie; migrate consumers to upstream's public modular seams

**Type**: refactor (post-merge) · **Phase**: refactor · **Status**: open · **Assignee**: unclaimed · **Priority**: HIGH
**Blocked by (Phase-1)**: UM14（synced base 8112743d69 needed to apply on）
**Blocked by (Phase-2)**: [R-DA-UI-PRESENTER-COMPOSITION](R-DA-UI-PRESENTER-COMPOSITION.md)（4 presenter 迁移的注册模式设计闸门）+ UM-ADAPT（seam 4 manifest 集中化 + view-registry seam 的 adaptive 判定）
**Blocks**: zombie 包整体删除 · UM10（typecheck 全绿依赖 4 presenter 完成迁移）· UM16（build:official 绿一部分依赖 catalog regen ← Phase-1 unblock）
**Related**: R-DA-UI-PRESENTER-COMPOSITION（姊妹票，管 presenter 注册模式的**设计决策**——本票是迁移执行）· UM-ADAPT（每移位 adaptive 判定，给本 Phase-2 判据）· UM7（预期 merge 时的最小 shim；被 UM14 re-sync 取代——本票才是真 alignment）· map § additive-only + intranet-security-first · design-research 2026-09-08

## Question

在 UM14 synced base（`8112743d69`，含 upstream `c389f96bf3` 的所有 seam 移位）上，**分两相**退役 fork-local zombie `packages/client/runtime`（上游已删的 monolith `@deepseek-ai/dsh-client-runtime` 的完整拷贝）：

**Phase-1（AFK-safe unblock）**——完成 3 个 trivial 消费者的 import 迁移 + 清理 zombie 内部的 catalog 阻塞项。这一相**不做**任何"让 zombie 苟活的补丁"，只是完成 7 个消费者里那 3 个无设计依赖的，和删除 zombie 里的 fork-only 冗余/死代码。

**Phase-2（adaptive full migration）**——4 个 presenter 包按 R-DA-UI-PRESENTER-COMPOSITION 定下的注册模式做真迁移（旧 `ctx.slots.register('tool.call.toolview',...)` + `isLatestTurn`/`blockText` → 新的 view-registry 模式或明确保留 standalone-peer 模式），boot wiring（`SessionRuntime`/`SlotRegistry`/`ConversationViewRegistry`/`ConversationNodeAssembler`）重新分布到各自新拥有者包，最终**删除 `packages/client/runtime` 本体** + 清 tsconfig 引用。这是核心「适配性改造」（adaptive，per UM-ADAPT）——不是 import repoint。

## 事实基线（2026-09-08 subagent survey，已核）

**消费者数：7 个包 / 29 个源码文件**（不是票原头部的 45）。逐 grep `@deepseek-ai/dsh-client-runtime` 得：`result-cache`、`ui-context-layer`、`ui-present-decomposition`、`ui-present-table`、`ui-semantic-layer`、`ui-settings-models`、`ui-suggest-followups`。另有 `packages/bundle/web-app` 在 `package.json` 声明依赖但 src 零引用（peer-dep 合规，非真消费者），`packages/client/runtime` 自己有一个自引用 spec（随包一起删）。原 "45" 来源于 ticket 头部叙述，未逐文件核实——subagent 全仓 grep 后修正。

**分类**：

| 桶 | 包数 | 文件数 | 包名 | 说明 |
|---|---|---|---|---|
| TRIVIAL | 3 | 9 | `result-cache`, `ui-context-layer`, `ui-settings-models` | 只 import `ClientContext`/`SessionId`/`SnapshotStore`/`SettingsScope`/`createSnapshotStore`；`slots.register` 目标是 `shell.overlay`/`settings.section`/`settings.onboarding`（与 tool-call 渲染无关）。无 `ToolCallBlock`/`ConversationSnapshot`/`isLatestTurn`/`blockText`。→ **Phase-1** |
| NEEDS-LOGIC-CHANGE | 4 | 20 | `ui-present-table`, `ui-present-decomposition`, `ui-suggest-followups`, `ui-semantic-layer` | 直接用 `ConversationSnapshot`/`ToolCallBlock`/`isLatestTurn`/`blockText`；通过旧 `ctx.slots.register('tool.call.toolview',...)` 模式注册。**`isLatestTurn`/`blockText` 在新架构下无对应物**——替代逻辑只有在选定 R-DA-UI-PRESENTER-COMPOSITION 的注册模式后才存在。→ **Phase-2** |

**note**：原假设 `ui-context-layer` 属 needs-logic-change 是**错误**——它只用 `ClientContext`，`slots.register` 目标是 `shell.overlay`（fullscreen overlay，非对话渲染），属 TRIVIAL。R-DA-UI-PRESENTER-COMPOSITION 把它归进 5-包 list 是按产品功能族分类（都属 data-agent UI），非按技术债。真 needs-logic-change 是 **4** 不是 5。

**Zombie 内部两处 catalog 阻塞**（Session A 定位）：
1. `client/runtime/src/client/slots.ts:41` 声明 slot `'root'`——与 `packages/client/ui-renderer/src/client/registry.ts:43` 的声明**是完全冗余的重复**（两处对 `SlotMap['root']` 做同类型合并声明）。真正的 owner 是**第三个包** `packages/client/ui-slots/src/index.ts:739-740`（`SlotCore` 构造时录入核心槽位）；生产环境真实占用者是 `packages/client/ui-layout/src/client/index.ts:146`（`AppFrame` 注册）。→ **删掉 zombie 里 `slots.ts:41` 的重复声明**（不是改名 `'root'`——改名会触及 `ui-slots`/`ui-layout`/`test-support/client-runtime` + ~40 个 test 夹具文件）。
2. `client/runtime/tsconfig.json:20` 引用 `../../host/apiproxy`——该目录已被 upstream 删（只剩两个孤儿 src 文件，无 `package.json`/`tsconfig.json`），TS project ref 无法解析（TS6053/TS5083）。→ **直接删该 reference 行**。

## Phase-1 — AFK-safe unblock（可放入下一 session 并行批）

**Scope**：
1. **3 个 trivial 包 import 迁移**（预计每包 <20 min）：
   - `result-cache`: `ClientContext`→cordis `Context`；`SnapshotStore`/`createSnapshotStore`→`@deepseek-ai/dsh-client-store`（新包）；`SessionId`→`@deepseek-ai/dsh-client-connection`。
   - `ui-context-layer`: `ClientContext`→cordis `Context`。仅 1 文件 src/client/index.ts。
   - `ui-settings-models`: `SettingsScope`→（确认新家；候选 `api-session-controller` 或 store 相关）；其余 trivial。
   逐包核对：跑该包的 vitest/tsc，绿即完成。
2. **删 zombie 冗余 `'root'` 声明**：`client/runtime/src/client/slots.ts:41` 一行（+ 相关类型合并块）——**不改任何其他文件**（真 owner `ui-slots` + 真 occupant `ui-layout` 保持不变）。跑 `pnpm run gen-client-catalog` 应能通过 root-slot 重复门。
3. **删死 apiproxy tsconfig ref**：`client/runtime/tsconfig.json:20` 单行——不动 zombie 其余 tsconfig / src / package.json（仍然被 4 个 presenter 依赖）。tsc 应少 9 个 TS6053/TS5083 错误。

**Deliver**：
- 3 个 TRIVIAL 包 zombie-free（`grep 'dsh-client-runtime' packages/{result-cache,client/ui-context-layer,client/ui-settings-models}/src` = 0 hits）。
- `gen-client-catalog` 通过 root-slot 门（catalog regen 的 client 半解锁——UM-CORDIS-REGEN Phase-B 之一）。
- client tsc TS6053/TS5083 从 zombie apiproxy ref 归零（不是 client tsc 整体绿——206 err 里剩 60× TS2339 ClientRemote namespace-missing 等，属于 UM16/UM-ADAPT/CORDIS 的其他门）。
- zombie 包**保留**（4 presenter 仍依赖）——本 Phase 不删。

**why-not-a-patch（针对原 ticket 警告）**：Phase-1 **不是"再造一次 minimal-patch 让 zombie 苟活"**——那种警告针对的是"永远补丁绕着 zombie 走，从不做真迁移"。Phase-1 做的是①**完成** 7 个消费者中的 3 个（不是给它们打 shim）②**删除** zombie 里 fork-only 冗余/死代码（不是加 shim）。是真进度，不是绕过。UM-ADAPT 判据 4「不用 fork workaround 对抗新逻辑」不适用——这里在删的是 fork-only 冗余（上游真 owner `ui-slots`+`ui-layout` 已正确处理），不是在对抗新逻辑。

## Phase-2 — adaptive full migration（blocked by R-DA-UI-PRESENTER-COMPOSITION）

**Scope**：
1. **等 R-DA-UI-PRESENTER-COMPOSITION resolved**（该票决定 4 presenter 的注册模式：merge-into-ui-conversation 走 `ConversationViewRegistry` vs. keep-standalone 直接 import 拆分类型）。
2. **迁 4 个 needs-logic-change 包**（20 files）按 Phase-1 决定的模式：
   - `ui-present-table`, `ui-present-decomposition`, `ui-suggest-followups`, `ui-semantic-layer`。
   - `isLatestTurn`/`blockText` 的等价替代按新模式实现（若走 view-registry：builder 提供已投影视图，函数消失；若走 standalone-peer：对新 `ConversationSnapshot` 形状手写）。
3. **重新分布 boot wiring**：`SessionRuntime` → 各自新拥有者包（`ui-conversation`'s `UiConversation` assembly / `client-connection`'s connection plugin / `client-store` 等）。`immediately: true` + `inject: ['client-connection','typert-registry','api-remotes']` 的 apply() 拆散。
4. **删除 `packages/client/runtime` 本体** + 清 tsconfig 引用（`tsconfig.client.json` + `test-support/client-runtime` 引用块）+ 清 `pnpm-workspace.yaml`。
5. **验证 typecheck + boot**：`pnpm run typecheck` 绿；boot 仍正确 wire `ctx.sessions`/`ctx.slots`/`ctx.uiConversation`；四 presenter 在 web-app 里真实渲染 tool-call 结果（浏览器 QA）。

**Deliver**：zombie 包彻底不存在；4 presenter 消费上游 public modular seam（真适配性改造，per UM-ADAPT）；typecheck 绿。

## Session A finding (2026-09-08)

zombie `packages/client/runtime`（fork-only，0 upstream commits in 449，absent at base `d347e703`+tip `c389f96bf3`）在 synced base `8112743d69` 仍存。R-DA 入口（UM14 发现）：
1. `client/runtime/src/client/slots.ts:41` 声明 slot `'root'`（owner props `RootOwnerProps` 未 export）+ 与 `packages/client/ui-renderer/src/client/registry.ts:43` 的 `'root'` 重复 → 阻塞 `gen-client-catalog`（CORDIS catalog regen）。
2. `client/runtime/tsconfig.json:20` 引用已删 `packages/host/apiproxy`（TS6053；449-impact 确认 apiproxy pre-base 已删）→ client tsc error。

R-DA 解这两处后，CORDIS catalog regen + client tsc 的 zombie 相关 error 可解。

## 2026-09-09 subagent survey 补充

- 修正头部数字：45→**7 包 / 29 文件**（逐 grep 全仓核实）。
- 拆 Phase-1（AFK-safe）/ Phase-2（adaptive）。
- 明确"删 root 冗余声明"非"改名 root"（避免触及 ~40 test 夹具）。
- 明确 Phase-2 blocked-by R-DA-UI-PRESENTER-COMPOSITION（不是 blocked-by UM-ADAPT——UM-ADAPT 给判据，R-DA-UI-PRESENTER-COMPOSITION 才是设计决策）。

## Resolution

**[2026-09-12] Phase-2 RESOLVED — client/runtime zombie decommissioned + 4 presenter Plan-B migration landed; tsc client 144→0.**

Phase-1 (resolved 2026-09-09, 5 `[R-DA-P1]` commits on `refactor/rda-client-runtime-phase1-2026-09-09`) cleared the 3 trivial consumers (result-cache/ui-context-layer/ui-settings-models) + zombie's dead apiproxy tsconfig ref + redundant root-slot `SlotMap` declaration. Phase-2 (2026-09-12) executed the 4 needs-logic-change presenters per ADR-0002 Plan B + deleted the zombie:

- **ui-present-table** (`22a263a4` + `36cf22fdfb` on `refactor/p2-present-table-2026-09-12`): repoint imports (ClientContext→cordis Context, SessionId→connection, ISessions→session-controller, ConversationSnapshot/ToolCallBlock→ui-conversation, SlotRegistry→ui-renderer) + re-home `blockText` inline + rename `useSession`→`useConversation` + fix `collectQueryCandidates` snapshot-access via `ChatSnapshot.legacy` compat slice + augmentation loading (tsconfig `../ui-chat` ref + `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'`) + `as unknown as SlotRegistry` TS2352 fix.
- **ui-present-decomposition** (`505f7439`): same repoints + re-home `blockText`/`isLatestTurn` (isLatestTurn legacy path: `views.get('chat')?.{timeline.turnOrder, legacy.turnTimings}`) + `as unknown as ToolCallBlock` cast for `callView`-less `makeRunningBlock`.
- **ui-suggest-followups** (`04365891`): same isLatestTurn legacy path + removed zombie-only `callView`/`resultView` from test mocks.
- **ui-semantic-layer** (`bb994970`): `connection.api`→`scope.remote.agentPresets` (positional `select(sessionId, agentPreset)` returning `RemoteResult<string>`) + drop `sessions.noteAgentPreset` (zombie-only; updates via `agent-preset/selected` event projection → `summary.projectionValues?.agentPreset`) + `workspaces.startSession`→`scope.uiWorkspace.startSession` + inject `['sessions','workspaces','connection','remote']`→`['sessions','uiWorkspace','remote']` + 5× `ToolCallBlock` repoint + `defineStore`/`EngineStoreHandle`→`dsh-client-store` + context-merge side-effect imports.
- **zombie `packages/client/runtime` deleted** + `tsconfig.base.json` (2 path-mapping lines 238-239) + `tsconfig.client.json` (1 project ref line 68) + 4 package.json peerDeps/devDeps/inject entries cleaned (web-app + 3 presenters; ui-semantic-layer cleaned by its migration).

**Verified (main session, iron law — re-derived, not subagent-claimed)**: `tsc -b tsconfig.client.json --force` = **0 errors** (144→0). vitest all green: ui-present-table 147/147 + ui-present-decomposition 31/31 + ui-suggest-followups 27/27 + ui-semantic-layer 110/110 + result-cache 30/30 + ui-settings-models 222/222. boot: `pnpm --filter @deepseek-ai/dsh-web-app build` OK (ctx.sessions/slots/conversationViews wire via upstream packages `api-session-controller`/`ui-renderer`/`ui-conversation` mounted in `cordis.patch.yml` — zombie's `apply()` was fork-only dead code, deletion is no-op for boot wiring).

**Key decision (extends ADR-0002 — see addendum in `docs/adr/0002-ui-presenter-composition-plan-b.md`)**: snapshot-access resolved via `ChatSnapshot.legacy` compat slice — option **③'** (a path rewrite, not a logic rewrite): `snapshot.nodes`→`snapshot.views.get('chat')?.legacy.nodes`, `snapshot.turnTimings`→`?.legacy.turnTimings`, `snapshot.chat.timeline`→`?.timeline`. The ADR's 4 `isLatestTurn` options didn't anticipate the thin-shell `ConversationSnapshot` gap (upstream removed the zombie's legacy top-level `nodes`/`turnTimings` compat fields; `ChatSnapshot.legacy` is upstream's intentional replacement, accessible via the chat view). `agentPresets`/Typert-registration is NOT a blocker (the `TypertRemoteNamespaceMap` augmentation loads transitively in full `-b`; the bounded-`-p` residual subagent 6 reported was a false positive — R-DA-TYPERT-REMOTE-REGISTRATION's domain, not this shard's).

**Vitest debt (线 B, [R-DA-UI-SETTINGS-MODELS-VITEST-DEBT](R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md)) cleared alongside**: 122→0 (D1 dual-call fold root-cause confirmed + fixed) + 6 full-`-b` test tsc errors fixed (callView removal, unused-import cleanup, `as RemoteErrorCode` casts, exactOptional conditional-spread).

Commit on resync `upstream/resync-2026-09-08` (Phase-2, no `--no-verify`, lefthook 3 gate green). **Push deferred** (UM11 PR + UM12 GA-FORK-CI + 方案D — separate flow).〔docs/adr/0002-ui-presenter-composition-plan-b.md, R-DA-UI-PRESENTER-COMPOSITION.md, R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md〕
