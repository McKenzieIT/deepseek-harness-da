# Next-session prompt — Follow-on 3 → rescope B：consumer ghost-type 重写 + barrel re-export + transport 补全

> 本 prompt **按 2026-09-10 session 思路重写**（用户拍板 B + 指示不继承 stale 的 `next-session-2026-09-10-phase-c-integration.md`）。自洽——新 session 据此可独立执行。

## 决策

Follow-on 3（R-DA-TYPERT-REMOTE-REGISTRATION）re-scope = **B**（用户 2026-09-10 拍板，按主 session 推荐）。
- 非 A（18 包 `src/remote.ts` 结构重构——reframe 证 ~0 error drop、不解 UM10）。
- 非 A-then-B。
- **B = 直接攻 217 真路径（consumer 包改造）** → UM10 typecheck-green（217→0）→ UM11 PR（resync→master）→ UM12 GA-FORK-CI re-sweep → push（方案 D，node 24，pre-push `build:lib:host`）。直接服务核心需求 #1（sync upstream）+ #2（适配性改造采新 Typert 类型）。

## ⚠️ Second-order reframe（2026-09-10，shard-1 subagent 调研 + 主 session 重验后——修正下方"217 真路径 / B 执行计划"的不完整框架）

shard-1（client/runtime 131，B 最大 shard）调研 + 重验发现：**client/runtime 是 fork 重引入的 zombie**——upstream `be531688f3`（"refactor(client): migrate consumers and remove Runtime"，200 files / 2148 deletions，全文件删）**删了 client/runtime 包**；fork 经 `8112743d69` merge 重引入 + 正退役。**fork 方向 = RETIRE（非 keep+migrate）**，见 `wayfinder/data-agent/tickets/phase-misc/R-DA-CLIENT-RUNTIME-DECOMMISSION.md`（Type: refactor, Status: open, Priority: HIGH，标题即"retire the fork-local client/runtime zombie; migrate consumers to upstream's public modular seams"）：

- **Phase-1（AFK-safe unblock，可并行批）**：迁 3 个 trivial consumer OFF zombie（`result-cache`/`ui-context-layer`/`ui-settings-models`：`ClientContext`→cordis `Context`、`SnapshotStore`/`createSnapshotStore`→`@deepseek-ai/dsh-client-store`、`SessionId`→`@deepseek-ai/dsh-client-connection`、`SettingsScope`→新家候选 `api-session-controller`/store 相关）+ 删 zombie 冗余 `'root'` slot 声明（`client/runtime/src/client/slots.ts:41`，真 owner=`packages/client/ui-slots`、真 occupant=`packages/client/ui-layout`，非改名避触 ~40 test 夹具）+ 删死 apiproxy tsconfig ref（`client/runtime/tsconfig.json:20`，清 9 TS6053/TS5083 + unblock `gen-client-catalog` root-slot 门）。zombie 包**保留**（4 presenter 仍依赖）。
- **Phase-2（adaptive full migration，blocked by R-DA-UI-PRESENTER-COMPOSITION = Plan B ADR-0002，本 session 已确认 grill=Plan B）**：迁 4 个 needs-logic-change presenter（`ui-present-table`/`ui-present-decomposition`/`ui-suggest-followups`/`ui-semantic-layer`）按 Plan B 注册模式 + 重分布 boot wiring（`SessionRuntime`/`SlotRegistry`/`ConversationViewRegistry`/`ConversationNodeAssembler`→各新拥有者包）+ **删 `packages/client/runtime` 本体** + 清 tsconfig/`pnpm-workspace.yaml` → 清 client/runtime 的 131。

**故 B 的 client/runtime shard = decommission（退役 zombie），非下方"217 真路径"的 in-place fix（ghost→Typert / misplaced→barrel / transport→complete）**——那三类框架只适用于 **NON-zombie consumer 的非 zombie 错误**（client/runtime 整包 Phase-2 删，其 131 自消；但 `ui-settings-models`/`ui-semantic-layer` 等的非 zombie ghost/misplaced/transport 错误仍需 in-place fix per 三类 driver）。

**修正后 B = (1) R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1（AFK-safe，next 可做）+ Phase-2（blocked by Plan B）+ (2) non-zombie consumer 的 in-place fix（三类 driver，下方框架）**。217 清于合力（zombie 删清 131 + consumer 迁移/fix 清余 86）。

**per #3**：上游驱动（upstream `be531688f3` 删 client/runtime；fork 重引入 zombie；retire = align upstream 删除）。retire 是上游忠实最佳（对齐 upstream 模块化架构、卸 fork-only zombie 负担、利未来 upstream sync）+ 最利 data-agent。master 决策**非 open**（fork 已定 retire，decommission ticket）。

**消费者基线（decommission ticket 已核，2026-09-09 subagent survey）**：7 包 / 29 文件 grep `@deepseek-ai/dsh-client-runtime` 得——TRIVIAL 3（result-cache/ui-context-layer/ui-settings-models，9 文件）→ Phase-1；NEEDS-LOGIC-CHANGE 4（ui-present-table/ui-present-decomposition/ui-suggest-followups/ui-semantic-layer，20 文件）→ Phase-2。原"45"已修正为 7/29。

## 前置（本 session 已完成，已 commit）

- **Follow-on 1 UM-CONNECTION-FIXTURE-DEAD-APICLIENT** resolved：fixture apiproxy→Typert 适配收尾（删死 `FixtureApiClient` 子类 `ac6c8c6c2b` 38/41 + 迁 results/downloads arms → `ClientConnectionRpc.call` switch 新增 `case 'result/get'` 返 `sessionErr` `result-not-found` 镜像 host `ResultsRemoteGateway.get` 契约）。resync `63659a22d4`，master `b399e3aee8`。
- **Follow-on 2 UM-CLIENT-CONFIG-CLEANUP** resolved：4 composite project refs 加 `api/remotes/tsconfig.client.json`（`../../data/semantic-layer`/`evidence-query`/`audit` + `../../identity/identity`）；E 坍缩进 D（data 包各 extend `tsconfig.base.json` `types:["node"]`、`@types/node@22.20.0` 已装→自解，无需单独 `@types/node` 编辑）。resync `5ee128214d`，master `502ed34714`。
- **Follow-on 3 reframe**（subagent Explore 调研 + 主 session 重验 6 条断言）：ticket 前提证伪。master `81d7d4665a`（ticket `## Reframe finding` + 本 prompt 前身 reframe 版）。
- tsc `tsconfig.client.json`（node 24，dsh-resync worktree）：**287→217**（--force 权威确认）。余 217 全 B 域。

## ⚠️ 关键 reframe（已验证，下一 session 勿重导）

Follow-on 3 ticket 原假设"18 包缺 `src/remote.ts` → `ClientRemote` 缺 X → ~81 error"**证伪**：
- 18 包**已有生成的** `lib/typert.remote-client.d.ts`（`@deepseek-ai/dsh-typert-generator` 发），声明 `interface TypertRemoteNamespaceMap { '<ns>': ... }` augment `TypertClientRemote extends TypertRemoteNamespaceMap`（`packages/typert/protocol/src/types.ts:307`）。→ `ctx.remote.<ns>.Y()` **已 resolve**。
- `tsc -b tsconfig.client.json` `TS2307`=0。35 TS2339 全 transport 层（非 `remote.<ns>` 失败）。
- 67 TS2305 在 **consumer** 包（`packages/client/*`），非 18 provider（provider 0 TS2305）。
- 18 包 `src/remote.ts` = 结构提取重构，~0 error drop。UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS 的"~122 adaptive（B/C/G 18 包 ~81）"归因有误（map 该行 :246 区现已知 stale，待修正）。

## 217 真路径（B）— 已验证 driver + 分布

**全量 log**：`/tmp/dsh-um10-fo2-force.log`（217，dsh-resync worktree）。按 consumer 包：

| consumer 包 | error | 主要码 |
|---|---|---|
| `packages/client/runtime` | 131 | TS2305(47) TS2339(24) TS7006(23) TS2379(9) TS2345(9) TS2353(7) TS2352(5) TS2367(3) … |
| `packages/client/ui-settings-models` | 39 | TS2322(11) TS2339(9) TS2305(9) TS7006(3) … |
| `packages/client/connection` | 30 | TS7006(22) TS2305(8) |
| `packages/client/ui-semantic-layer` | 7 | TS2769(5) … |
| `packages/client/result-cache` | 4 | TS2305(3) TS2339(1) |
| `ui-suggest-followups` / `ui-present-table` / `ui-present-decomposition` | 各 2 | TS2352(1) |

**三类 driver（B 的三类工作）**：
1. **Ghost transport 类型（TS2305 主）**：`IApiclient`/`MuxFrame`/`HostFrame`/`RpcReceipt`/`ClientResponse`/`SessionModels`——apiproxy（`4f00a8b82a`）删除残留，fork src 无定义；`RpcError`→`RemoteError` 改名（`RemoteError` 在 `packages/typert/protocol/src/remote-error.ts`）。consumer 从 `@deepseek-ai/dsh-api-remotes/client` barrel import 已不存在的 export。**修法**：调研每个 ghost 对应的 Typert 新类型 → 改 consumer import + 用法。
2. **错位 view 类型（TS2305 次）**：`ToolEventView`（在 `client/runtime`）、`SubagentAddress`（在 `api/session-controller/src/types.ts`）、`JobView`（connection barrel 已 re-export `SessionJob as JobView` 但 consumer 从 connection/client import）、`DirectoryEntry`/`DirectoryListing`（在 `host/directory-picker*`）、`SessionMaybeProvideInfo`/`SessionProvideInfo`（疑 ghost，在 `client/ui-slots`?）、`TodoItem`（在 `todo/tool-todo/src/types.ts`）、`isTokenDelta`（在 `client/ui-chat`/`ui-trajectory`）、`HistoryEntry`（在 `client/ui-dockkit`）、`CredentialView`（在 `client/ui-settings-models/store.ts`）。**修法**：每类型二选一——(i) 在正确 barrel 加 re-export，或 (ii) 改 consumer import 路径指到定义包。按"上游忠实 + repo barrel 风格"选。
3. **Transport 层（TS2339）**：`$dispatch` on ClientRemote、`.api` on ConnectionHandle、`onHostEnvelope`/`onMuxEnvelope` on ConnectionSinks、`agentPreset` on SessionSummary、`currentProvideInfo` on ISessions、`data`/`time` on `never`。**修法**：补全 transport 类型（在 `typert/protocol` 或 `connection` transport 声明处加成员）或修 consumer 用法。

## B 执行计划（按 consumer 包分片，subagent 驱动，铁律）

- **Shard 1 = client/runtime（131，最大）**——B 主战场，先做。
- **Shard 2 = ui-settings-models（39）**。
- **Shard 3 = connection（30，多 TS7006 implicit any——可能随 shard 1 类型修复连带清）**。
- **Shard 4 = 小包（ui-semantic-layer 7 + result-cache 4 + 3 个 UI 各 2 = 17）**。

**每 shard 流程（本 session 验证有效）**：
1. **dispatch Explore subagent**（只读）调研该 consumer 包 error 逐条 → ghost 对应 Typert 新类型 / 错位 view 定义包+barrel 现状 / transport 成员缺处。prompt 内置 `mcp__local__*` only + 5× retry + "NO MCP-LOCAL ACCESS" 快速失败 + grep 用 bash rg（`mcp__local__grep` 不可靠）。
2. **主 session 重验**（铁律）：subagent 报告 = 未验证断言；至少重导 1 条关键（如 grep 确认 ghost 确无定义 / Typert 新类型确存在 / barrel 确缺 re-export）。
3. **决策**（若有）：按 #3 先答"是否上游驱动 + 哪个上游忠实最佳重构、最利 data-agent"再 grill 用户。机械修复（barrel re-export 模式明确）直接做。
4. **实现**：小改主 session 直接做；大改 dispatch general-purpose subagent。改落 dsh-resync worktree（branch `upstream/resync-2026-09-08`）。
5. **tsc 验**：`PATH="/usr/local/bin:$PATH" tsc -b tsconfig.client.json`（node 24）确认 shard error 清、无新增；关键节点 `--force` 权威确认。
6. **记 resolution + 关票/更新 map Decisions-so-far**：resync commit `[Follow-on-3-B]` 或 `[R-DA-TYPERT-REMOTE-REGISTRATION]` 前缀；master commit `[wayfinder(um-flow)]` 前缀。不 `--no-verify`（lefthook pre-commit oxlint/whitespace + pre-push typecheck）。不 `git add -A`（`.tmp` 未 gitignore，用具体 path）。
7. 多 shard 推进到主上下文 ~70% 切下一 session（本 prompt 持续更新进度）。

**B 完成判据**：tsc client 217→0（UM10 typecheck-green）→ 解锁 UM11 PR + UM12 + push。

## 环境 & 纪律（复用，本 session 验证）

- 主仓 `/Users/mckenzie/workspace/deepseek-harness-da`（master，ahead origin 13，含本 session 4 commit，未 push）；dsh-resync worktree `/Users/mckenzie/workspace/dsh-resync`（branch `upstream/resync-2026-09-08`，tip `5ee128214d`，含 fixture+config fix，未 push）。B 改动落 dsh-resync。
- **主 session 强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob 全 BLOCKED）；subagent 也须用。`mcp__local__grep` 不可靠——用 `mcp__local__bash` 的 `grep -rEl`/`rg`。
- node v24：`PATH="/usr/local/bin:$PATH"`（nvm 无 v24，用 `/usr/local/bin/node` v24.15.0；push/build:official 需 v24）。
- **铁律**：subagent 报告 = 未验证断言，主 session 至少重导 1 条关键断言才进产物。
- **#3 决策纪律**：grill 用户前先答"是否上游驱动 + 哪个上游忠实最佳重构、最利 data-agent"。
- **#1 subagent 驱动**：dispatch subagent 省主上下文，多 shard 推进到 70% 切 session。

## Deferred（非 B）

- **(A) 18 包 `src/remote.ts` 结构重构**：B 之后或独立低优 ticket（是 B 部分 consumer 重写前置——barrel re-export `XRemote` interface；但不解 UM10）。
- **Phase-2**（4 presenter 迁移 per Plan B ADR-0002）+ **Round 2**（isLatestTurn gap，lean 给 `ToolCallOwnerProps` 加 `isLatestTurn: boolean` 由 `ToolCallTree` 传下）：另开 session，需 QA。
- **UM-CORDIS subtask 3**（gen-client-catalog）：blocked by RootOwnerProps homing（R-DA decommission——true owner=ui-slots SlotCore、true occupant=ui-layout AppFrame；当前在 zombie `runtime/slots.ts` re-export at `runtime/index.ts:38`）。
- **UM-ADAPT 剩余 shifts**（agent-inbox durable projection、subprocess native containment、session-format v0→v2 migration）：UM15 训练样本，低优。
- **map UM-APIPROXY-REMOVAL 归因行**（:246 区）stale 待修正。

## 起手

1. 读本 prompt + Follow-on 3 ticket `## Reframe finding`（`wayfinder/data-agent/tickets/phase-misc/R-DA-TYPERT-REMOTE-REGISTRATION.md`）。
2. Shard 1：dispatch Explore subagent 调研 `packages/client/runtime` 131 error 三类 driver（ghost→Typert 映射 / 错位 view 定义包+barrel / transport 成员缺处）。
3. 主 session 重验 → 决策（若需，按 #3 grill）→ 实现 → tsc 验 → 记。
4. 推进 shard 2-4 到 70% 切 session。

## Session progress（2026-09-10 end — 主 session 重验，铁律）

**tsc client 287→187（-100）**。3 fix 全 clean/mechanical（type-only / test-fake，无 logic 改）：
- Follow-on 1 fixture（resync `63659a22d4`）+ Follow-on 2 config（`5ee128214d`）→ 287→217。
- **connection fake-api**（resync `[Follow-on-3-B]`，本 session）→ 217→187。`packages/client/connection/tests/fake-api.client.ts`：strip `implements IApiClient` + 12 `IApiClient['X']` 注解 + repoint 4 misplaced 到 `@deepseek-ai/dsh-api-remotes/client` barrel + 3 ghost（HostFrame/MuxFrame/SessionModels）→`unknown` + 22 payload `:unknown`（D4-a 最小，test fake 上游忠实）。30→0，无新增。

## 剩余 B（187→0）

**actionable 非 Phase-2（D3 方法签名迁移，PRODUCTION src，delicate，需 QA）**：
- **ui-settings-models（39 visible + ~15-20 D3 masked）**：`IApiClient`→`ClientRemote`（6 site）+ `CredentialView`→`CredentialInfo`（3）+ `DiscoveredModelView`→`LlmDiscoveredModel` + `ConfigurableProviderView`→`LlmConfigurableProvider`（unmask D3）+ `.api`→`ctx.remote`（3）+ `$dispatch`→`emit`（6 test）+ event 名 `'credentials/updated'`→`'credentials/reference-updated'` + JsonValue cast（12）+ shorthand（2）+ double cast（1）。**D3**：`api.llm.providers()`→`ctx.remote.llm.listConfigurableProviders()`、`response.result.ok/value`→`response.ok/value`（RemoteResult 无 `.result` wrapper）、positional args——按已迁移 `ui-settings`/`ui-settings-plugins` 模式。**D1 决策**：`LlmConfigurableProvider` 无 `active` field（旧 `ConfigurableProviderView` 有，code 用 `row.entry.active`）——(a) cross-ref `ctx.remote.llm.listProviders()` 定 active / (b) 若 `listConfigurableProviders` 只返 active 则删 check（**事实，先查 settings-controller/llm Host impl**）/ (c) fork 加 `active`（非上游忠实，排除）。
- **result-cache（4 visible + D3）**：`IApiClient`→`ClientRemote`（3）+ `.api`→`ctx.remote`（1）unmask D3——`api.results.get({resultId})`→`ctx.remote.result.get(resultId)`（ResultsRemote namespace）+ fetcher 契约改 `RpcResult<ResultEntry>`→throw-based `RemoteError`（adapt miss→undefined vs error→`ResultFetchError`）。delicate（result-cache error 语义）。

**Phase-2（144，blocked by Plan B ADR-0002，本 session 已确认 grill=Plan B）**：client/runtime 131（删包）+ 4 presenter 13（`ui-semantic-layer` 7 + `ui-suggest-followups`/`ui-present-table`/`ui-present-decomposition` 各 2；按 Plan B 注册模式迁）。

## 噪声（下 session 查）

- `packages/data/audit/src` + `data/evidence-query/src` 有 untracked `.d.ts`/`.js`/`.map`（tsdown 输出?——pre-existing，非 connection fix 产；验 + gitignore/clean）。
- `pnpm-lock.yaml` modified（pre-existing，非本 session）。

## 下 session 起手

1. **ui-settings-models**（D3+D1，PRODUCTION src，careful + QA）→ 187→~130。dispatch subagent 实现（按 Explore 详案：rename+D3+transport+casts）+ 主 session 重验 tsc + diff logic + D1 事实查（`listConfigurableProviders` 返 active 否）+ 浏览器 QA settings UI。
2. **result-cache**（D3，careful）→ ~130→~126。
3. **Phase-2**（blocked by Plan B）= 144，另 session（Plan B presenter 迁移 + 删 client/runtime）。
