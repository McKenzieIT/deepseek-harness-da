# Next-session prompt — Follow-on 3-B Phase-2：client/runtime 131 zombie decommission + 4 presenter Plan-B 迁移（144 → 0）

> 承接：`next-session-2026-09-11-follow-on-3-B-result-cache.md`（shard 3-b result-cache，tsc 148→144，commit `d0f152ba32`）。本 prompt **自洽**，next session 据此独立执行。
> **本 session 主轴 = 提速**：用 subagent fanout 把 144→0 拆成可并行的小批，但守安全铁律。最优化 = 先并行调研+trailblaze、再串行复制 pattern、最后主 session 集中验证+删包。

## 决策历史（本 prompt 前提，勿再重决）

- **Follow-on 3 rescope = B**（2026-09-10 user 拍板）——攻 217 consumer 真路径。B 分 shard（按 error 数从大到小）：
  - shard 1 = client/runtime 131（**decommission，本 session 主战场**——Phase-2）
  - shard 2 = ui-settings-models 39（resolved 2026-09-11，`03e865a148`，tsc 187→148，**但有 vitest 债**）
  - shard 3 = connection 30（resolved，`2504169487`）
  - shard 3-b = result-cache 4（resolved 2026-09-11，`d0f152ba32`，tsc 148→144，vitest 30/30 green）
  - shard 4 = 小包 17（**4 presenter**，本 session 随 Phase-2 一起清——它们是 zombie 唯一剩余消费者）
- **Plan B = ADR-0002 keep-standalone**（2026-09-10 grill 落定，`docs/adr/0002-ui-presenter-composition-plan-b.md` + `tickets/phase-misc/R-DA-UI-PRESENTER-COMPOSITION.md` Resolution）：
  - 4 presenter **保** `tool.call.toolview` slot + `ctx.slots.register` 模式（**不** merge 进 `ConversationViewRegistry`）——是 upstream 自己 toolview 的做法（`ui-tool/src/client/tool/toolviews/read-row.tsx` 镜像）。
  - 只 repoint type imports（`ClientContext`→cordis `Context`、`SessionId`/`ISessions`→`api-session-controller`、`ConversationSnapshot`/`ToolCallBlock`→`ui-conversation`）+ re-home `blockText`（5 行纯函数，从 zombie `cards.ts` 搬到 presenter 自己的 util）+ 解 `isLatestTurn` gap。
  - **⚠️ shard 3-b handoff 笔误**：本 prompt 前提里"4 presenter migrate by 'register 模式'（不 keep-standalone）"一句的括号注解是**错**——ADR-0002 Resolution 明确 Plan B **= keep-standalone**。以 ADR 文件 + ticket Resolution 为准，勿被那句带偏。

## 累进进度（tsc client `--force` 权威）

| session | 事件 | 起→止 | commit（resync） |
|---|---|---|---|
| 2026-09-09/10 | Follow-on 1 fixture + Follow-on 2 config | 287 → 217 | `63659a22d4` + `5ee128214d` |
| 2026-09-10 | connection fake-api（shard 3）| 217 → 187 | `2504169487` |
| 2026-09-11 | ui-settings-models（shard 2）| 187 → 148 | `03e865a148`（**vitest 债未清**）|
| 2026-09-11 | result-cache（shard 3-b）| 148 → 144 | `d0f152ba32` |
| **next** | **client/runtime decommission + 4 presenter Plan-B（本 session）** | **144 → 0** | — |
| parallel | **ui-settings-models vitest 债清（122→0）** | — | — |

**resync tip**: `d0f152ba32`（branch `upstream/resync-2026-09-08`，未 push）
**master tip**: `e23d20fc77`（ahead origin 19，未 push；push 由 UM11+UM12+push 独立负责）

## 本 session 目标：144 → 0 + vitest 债清（双线，并行）

### 线 A（主轴）：client/runtime 131 zombie decommission → tsc 144→0

**核心洞察（主 session 已验证，勿重导）**：client/runtime 的 131 error **不是要一个个修的错**——是**上游已删的 monolith 的 fork-only 拷贝**，其 131 error 全是 ghost（`connection.api`/`$dispatch`/`onMuxEnvelope`/`IApiclient` 残留 + `ToolEventView`/`SubagentAddress`/`JobView`/`DirectoryEntry` 等错位/ghost view 类型）。**Phase-2 deliver = 删包本体 → 131 归零**，不是修 131 个错。

**131 error 分布**（`/Users/mckenzie/workspace/dsh-tsc-shard-3b-post.log`，已跑）：47× TS2305 + 24× TS2339 + 23× TS7006 + 9× TS2379 + 9× TS2345 + 7× TS2353 + 余散。全在 zombie 内部 src，删包即清。

**安全前提（主 session 已实证，是删包可行性基线，subagent 删包前须再确认）**：
1. **只有 4 presenter 仍 import zombie**（33 import sites：ui-present-decomposition 6 + ui-present-table 6 + ui-semantic-layer 15 + ui-suggest-followups 6）。3 个 trivial 消费者（result-cache / ui-settings-models / ui-context-layer）**已 zombie-free**（前 shard 清完）。
2. **zombie apply() 是死代码**：`packages/bundle/web-app/cordis.patch.yml` 挂的是 **upstream** 模块化包（line 106 `api-session-controller`=ctx.sessions、210 `ui-renderer`=ctx.slots、249 `ui-conversation`=ctx.conversationViews），**不挂** `dsh-client-runtime`。`web-app/package.json:56` 仅 peer-dep 声明（合规，非真 mount）。→ zombie 的 boot wiring（`SessionRuntime`/`SlotRegistry`/`WorkspaceRuntime`）是 fork-only 死拷贝，**boot-wiring redistribution = no-op**（不需把 zombie 的 apply() 搬去别处——upstream 包已接管）。
3. **删包要清的 tsconfig ref**：`tsconfig.base.json:238-239`（2 行 paths）+ `tsconfig.client.json:68`（1 project ref）+ `pnpm-workspace.yaml`（如有）+ `web-app/package.json:56` peer-dep + 4 presenter 的 `package.json` peerDependencies 里若列了 zombie（迁完 import 后顺手清）。

**`isLatestTurn` gap（Plan B 唯一设计未决点，本 session 必决）**：`tool.call.toolview` entries 只拿 `useConversation`（target-neutral），拿不到 `useChat`（chat-specific）。ADR-0002 留 4 选项：① 给 `ToolCallOwnerProps`（`packages/client/ui-tool/src/client/contract/slots.ts:55`）加 `isLatestTurn: boolean` 由 `ToolCallTree` 算好传下（**主 session 倾向，最简**）；② 传 `useChat` hook；③ 用 `useConversation` 重算（跨 target 边界）；④ 改成 `conversation.chat.node` renderer（架构错，拒）。**先 trailblaze `ui-present-table` 时实证哪个对**，再复制到其余 3。

### 线 B（并行，debt）：ui-settings-models vitest 122 → 0

`tickets/phase-misc/R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md`（本 shard 3-b 落的 follow-up 票）。122 failed / 100 passed / 6 spec files。signature = `status: 'error' 期望 'ready'` + `Cannot read properties of undefined (reading 'credentials')`。hypothesis = shard 2 D1 双调 fold（`listConfigurableProviders` + `listProviders`，hard-fail-on-either-half）在 bench 只 mock 一半时 throw。**AFK-subagent-drivable**，与线 A 解耦，可并行。

## Subagent fanout 策略（提速 + 安全）

**纪律**（来自 #1 + #3 + 铁律）：
- **#1 subagent 驱动**：dispatch subagent 省主上下文，多 shard 推进到 70% 切 session。
- **#3 决策纪律**：subagent 推荐前先答"上游忠实最佳重构、最利 data-agent"。
- **铁律**：subagent 报告 = 未验证断言，主 session 重导 ≥1 关键（tsc/vitest）。

### Round 1（并行 3 subagent，读+trailblaze，AFK-safe）

**subagent 1 — Plan-B presenter trailblaze（`ui-present-table`，最简）**：
- 任务：`general-purpose`，`isolation: "worktree"`（**写代码必用 worktree 隔离**，主 resync 树不脏）。
- 做：① Read `packages/client/ui-present-table/src/client/index.ts`（6 import sites，2 error：`ui-present-table/src/client/index.ts(43,15): TS2769` + `tests/apply.client.spec.ts(21,17): TS2352`）。② 实证 `isLatestTurn` gap 选哪个选项（读 `packages/client/ui-tool/src/client/tool/ToolCallTree.tsx` + `contract/slots.ts:55` `ToolCallOwnerProps`，看 `ToolCallTree` 是否已算好 turn / 能否传下）。③ 按 Plan B 迁：repoint type imports + re-home `blockText`（从 `packages/client/runtime/src/client/cards.ts:33` 搬 5 行纯函数到 `ui-present-table/src/client/util.ts` 或 inline）+ 解 `isLatestTurn`。④ 跑 bounded tsc + vitest 该包。⑤ 报：①选哪个 `isLatestTurn` 选项 + why（上游忠实最佳）②pattern 全貌（每个 import 改成什么、`blockText` 去哪、`isLatestTurn` 怎么传）③`ui-present-table` tsc/vitest 绿否。
- **worktree path**：`/Users/mckenzie/workspace/dsh-resync/.worktrees/p2-present-table`（或 git worktree add 手建后 EnterWorktree path= 进）。

**subagent 2 — ui-semantic-layer 深度（15 import sites，最大，单独拆）**：
- 任务：`general-purpose`，`isolation: "worktree"`。
- 做：Read `packages/client/ui-semantic-layer/src/client/index.ts`（15 import sites，7 error：`(101,13) TS2339 api` + `(115,89) TS7006 response any` + `presenters/index.ts:21-25` 5× TS2769 overload）。**先判**：这包的 5 个 TS2769 overload + `connection.api` 是否同 shard 3-b 同构（`inject=['remote']` + `ctx.remote.X.Y()`）？若是，pattern 直接复用 subagent 1；若不是（semantic-layer 有特殊查询路径），单列。报：①是否同构 ②特殊点 ③迁移草案（不实现，trailblaze subagent 1 出 pattern 后复制）。
- **此 subagent 只读+设计，不写代码**（pattern 未定，避免 worktree 冲突）。

**subagent 3 — ui-settings-models vitest 债（线 B，AFK，与线 A 解耦）**：
- 任务：`general-purpose`，`isolation: "worktree"`。
- 做：按 `R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md` 的 hypothesis——实证 D1 双调 fold 是否 root cause（改一个失败 spec 加 `providers: vi.fn(...)` mock，跑看绿否）。若实证成立，批量补 mock（6 spec files）；若不成立，走 `diagnosing-bugs` skill 深挖。报：①root cause 实证 ②修法 ③vitest 122→0 否。
- **不碰 result-cache / 4 presenter src**（解耦）。

### Round 2（串行复制 pattern，subagent 1 出 pattern 后）

主 session 读 subagent 1 报告 → 锁 `isLatestTurn` 选项 + Plan-B pattern → dispatch：
- **subagent 4**（`general-purpose`，worktree）：复制 pattern 迁 `ui-present-decomposition`（6 import，2 error）。
- **subagent 5**（`general-purpose`，worktree）：复制 pattern 迁 `ui-suggest-followups`（6 import，2 error）。
- **subagent 6**（`general-purpose`，worktree）：复制 pattern 迁 `ui-semantic-layer`（15 import，7 error；若 subagent 2 判同构则直接复制，否则按其草案）。
- 3 subagent 可**真并行**（worktree 隔离，无共享 state）。

### Round 3（主 session 集中，不可委托）

1. **合并 worktree**：Round 2 的 3 worktree + Round 1 subagent 1 的 worktree，逐个 cherry-pick / merge 到主 resync 树。**每合并一个跑 bounded tsc**。
2. **删 zombie 本体**：`rm -rf packages/client/runtime` + 清 3 tsconfig ref（`tsconfig.base.json:238-239` + `tsconfig.client.json:68`）+ `pnpm-workspace.yaml` + `web-app/package.json:56` peer-dep + 4 presenter package.json peerDependencies。
3. **tsc `--force` 权威**：`PATH="/usr/local/bin:$PATH" /usr/local/bin/node ./node_modules/typescript/bin/tsc -b tsconfig.client.json --force 2>&1 | grep -cE 'error TS'`——目标 = **0**。
4. **vitest 权威**：4 presenter + result-cache（30）+ ui-settings-models（线 B subagent 3 清完）全跑。目标全绿。
5. **boot 实证**（安全铁律，tsc 不能证）：`pnpm --filter @deepseek-ai/dsh-web-app build` 或 dev boot，确认 `ctx.sessions`/`ctx.slots`/`ctx.conversationViews` 仍 wire（upstream 包接管）。若 boot 断，回滚 zombie 删除，查 `cordis.patch.yml` 是否漏挂 seam。
6. **commit + 记**：resync `[Follow-on-3-B] Phase-2: decommission client/runtime zombie + 4 presenter Plan-B migration (144->0)`；master `[wayfinder(um-flow)]` + ticket `## Session progress` + map Decisions-so-far。**不 `--no-verify`**（lefthook 3 gate）。**不 `git add -A`**（untracked tsdown outputs pre-existing；用具体 path）。

## 执行流程（铁律）

1. **Read** 本 prompt + `tickets/phase-misc/R-DA-CLIENT-RUNTIME-DECOMMISSION.md`（Phase-2 scope）+ `tickets/phase-misc/R-DA-UI-PRESENTER-COMPOSITION.md`（Plan B Resolution）+ `docs/adr/0002-ui-presenter-composition-plan-b.md`。
2. **Round 1**：dispatch 3 并行 subagent（1 trailblaze + 2 读/债）。等齐。
3. **决策 `isLatestTurn` 选项**（按 #3：subagent 1 推荐先答"上游忠实最佳"再主 session 锁）。
4. **Round 2**：dispatch 3 并行 subagent 复制 pattern 迁余 3 presenter。
5. **Round 3**：主 session 合并 worktree → 删 zombie → tsc `--force` 0 + vitest 全绿 + boot 实证 → commit + 记。
6. **70% 切 session 纪律**：若 Round 2 后主上下文 >70%，本 session 合并完 + 删包 + tsc 0 后即停，boot 实证 + commit 记录可切下一 session（但 **boot 实证不可跳**——删包安全基线）。

## 关键上下文（已验证，勿重导）

- **新 import homes 都在**（resync synced base 已带）：`packages/client/store`（`SnapshotStore`/`createSnapshotStore`）、`packages/api/session-controller`（`ISessions`/`createScope`/`scopeOf`）、`packages/client/connection`（`SessionId`）、`packages/client/ui-conversation`（`ConversationSnapshot`/`ToolCallBlock`）、`packages/client/ui-renderer`（`SlotRegistry`）。`ClientContext` → cordis `Context`（`type ClientContext = Context`，上游已删）。
- **`blockText` + `isLatestTurn` 在 zombie**：`packages/client/runtime/src/client/cards.ts:16,33`（fork-only，upstream `projectBlock` 不计算这俩——ADR-0002 三铁证之一）。re-home `blockText`（5 行纯函数）到 presenter 自己；`isLatestTurn` 走 gap 选项。
- **`tool.call.toolview` 是 upstream slot**（`ui-tool/src/client/contract/slots.ts:26`，`git ls-tree c389f96bf3` 确认 upstream）——4 presenter 是 peer 非 fork workaround（UM-ADAPT 判据 4 ✓）。镜像 `ui-tool/src/client/tool/toolviews/read-row.tsx`。
- **api-remotes barrel**（`packages/api/remotes/src/client/index.ts`）：exports `ClientRemote`/`CredentialInfo`/`LlmConfigurableProvider`/`LlmDiscoveredModel`/`SettingsNamespaceView` + `RemoteResult`（line 138）+ `RemoteError`*（test 从 `dsh-client-test-runtime` value re-export，非直接从 protocol——拉 owner /remote lib artifacts 会爆）*；不 exports `IApiClient`/`ToolEventView`/`SubagentAddress`/`JobView`/`DirectoryEntry`/`DirectoryListing`（这些是 ghost/错位，从正确包 import 或 barrel re-export）。
- **4 presenter error 全貌**（`/Users/mckenzie/workspace/dsh-tsc-shard-3b-post.log`）：
  - `ui-present-table`: `index.ts(43,15) TS2769` + `tests/apply.client.spec.ts(21,17) TS2352`。
  - `ui-present-decomposition`: `index.ts(26,15) TS2769` + `tests/apply.client.spec.ts(19,17) TS2352`。
  - `ui-suggest-followups`: `index.ts(30,58) TS2769` + `tests/apply.client.spec.ts(21,17) TS2352`。
  - `ui-semantic-layer`: `index.ts(101,13) TS2339 api` + `(115,89) TS7006 response any` + `presenters/index.ts:21-25` 5× TS2769。
  - **3 个 `TS2352 SlotRegistry | undefined` test error 同构**（`as SlotRegistry` 改 `as unknown as SlotRegistry` 或加 undefined check）。
- **reference 迁移**：ui-settings-plugins（inject remote + `ctx.on('connection/reset')` 模式）+ result-cache（shard 3-b，`d0f152ba32`，Plan-B 同构——`TestRemote(ctx, {namespace: {method}})` mock + `new RemoteError(code,msg,details)`）。
- **worktrees**：master `/Users/mckenzie/workspace/deepseek-harness-da`（tip `e23d20fc77`）+ resync `/Users/mckenzie/workspace/dsh-resync`（`upstream/resync-2026-09-08`，tip `d0f152ba32`）。**Phase-2 全在 resync 树**。
- **node v24 强制**：`PATH="/usr/local/bin:$PATH"`（`/usr/local/bin/node` = v24.15.0；nvm 无 v24）。
- **主 session + subagent 强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠——用 `mcp__local__bash` 的 `rg` / `grep -rEn`。
- **worktree subagent**：`Agent` tool 的 `isolation: "worktree"` 自动建临时 git worktree（agent 改文件不脏主树）；或主 session `git -C /Users/mckenzie/workspace/dsh-resync worktree add` 手建后 `EnterWorktree path=` 进。

## Deferred（本 session 不做）

- **push**（UM11 PR + UM12 GA-FORK-CI + 方案 D）：Phase-2 完成后做。
- **untracked tsdown `.d.ts`/`.js`/`.map`**（`data/audit` + `data/evidence-query` + `data/semantic-layer`）：pre-existing，非本 session 产；查 + gitignore follow-up。
- **`pnpm-lock.yaml` modified**：pre-existing。
- **ui-settings-models README drift**（EN+ZH line 37 提 `ConfigurableProviderView`）：doc-sync gate follow-up，1 分钟可顺手改。

## 起手 checklist

1. Read 本 prompt + `R-DA-CLIENT-RUNTIME-DECOMMISSION.md` Phase-2 scope + `R-DA-UI-PRESENTER-COMPOSITION.md` Resolution + `docs/adr/0002-ui-presenter-composition-plan-b.md`。
2. 确认 resync tip = `d0f152ba32`（`git -C /Users/mckenzie/workspace/dsh-resync log --oneline -1`），working tree 仅 pre-existing artifacts（`pnpm-lock.yaml` + untracked tsdown）。
3. **Round 1**：dispatch 3 并行 subagent（subagent 1 trailblaze `ui-present-table` worktree / subagent 2 读 `ui-semantic-layer` 设计 / subagent 3 线 B vitest 债 worktree）。
4. 等 Round 1 齐 → 锁 `isLatestTurn` 选项 + Plan-B pattern → **Round 2** dispatch 3 并行 subagent 迁余 3 presenter（worktree）。
5. **Round 3**：主 session 合并 → 删 zombie → tsc `--force` 0 + vitest 全绿 + boot 实证 → commit + 记。
6. 目标：144 → 0，vitest 全绿（4 presenter + result-cache 30 + ui-settings-models 线 B 清），boot 不断。
