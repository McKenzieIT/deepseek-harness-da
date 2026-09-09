# R-DA-TYPERT-REMOTE-REGISTRATION — Typert Remote registration sprint: 18 domain packages declare src/remote.ts @Remote markers

**Type**: task · **Status**: open · **Phase**: misc
**Priority**: HIGH（核心适配性改造，block UM10 typecheck-green + 多 downstream）
**Blocked by**: UM14（synced base）、UM16（root-entry fix 解 mask）、UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS（research 票，识别本 sprint）
**Blocks**: UM10（typecheck-green gate——B+C+G ~81 error 卡它）、R-DA-CLIENT-RUNTIME-DECOMMISSION（zombie 删除——zombie 的 ClientRemote refs）、R-DA-UI-PRESENTER-COMPOSITION Phase-2（presenter 调 `remote.X.Y()`）
**Related**: UM-CORDIS-REGEN（subtask 2 已 regen `api-catalog.ts` 的 `resultGateway`，但 `ClientRemote` namespace 仍缺 17 个 `/remote` augmentation）、UM-CLIENT-CONFIG-CLEANUP（surface D+E，并行）、UM-CONNECTION-FIXTURE-DEAD-APICLIENT（adaptive A，并行）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase-B-adapt / 后续 session）

## Question

upstream 把 apiproxy（HTTP/JSON-RPC fetch-carrier）替换成 **Typert Remote** 体系（`@Remote` decorator + `ClientRemote` namespace + `TypertGateway` WebSocket-mux over Cordis Services）。fork 的 client 包 mid-migration：调 `remote.X.Y()` 但 `ClientRemote` 缺 X（17 个 `/remote` source 模块缺失 → 无 declaration-merge augmentation）。

**本 sprint**：18 个调 `remote.X.Y()` 的 domain 包，每个声明 `src/remote.ts`（`@Remote('method')` marker + `XRemote` interface + `XRemoteGateway`），export `/remote`，让 `api/remotes` 聚合 → `ClientRemote` 经 declaration-merge 获得属性。

**模板**：`packages/data/result-cache/src/remote.ts`（`@Remote('get')` + `ResultsRemote` interface + `ResultsRemoteGateway`）。全 repo 现仅 3 包有 `src/remote.ts`（result-cache + 2）。

**18 包**（来自 UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS Class B+C 识别）：agent-presets、commands、settings-controller、goal、llm、cordis-host-runner、plugin-inventory、message-feedback、client-file-upload、session-reference、subagent、session-controller、workspace-controller、schema-gateway、evidence-query、workspace-files、agent-team（+ result-cache done）。fork data-agent 包（evidence-query、schema-gateway）须声明 remote 加入 `ClientRemote`。

## adaptive 判据（UM-ADAPT 5 条，research 票已 PASS）

① upstream why（apiproxy → Typert Remote）② 冲突（mid-migration）③ 干净 seam（不 re-declare 删掉 types；改采 `@Remote`+`ClientConnectionRpc`）④ 不 fork workaround ⑤ 可验证（`tsc -b tsconfig.client.json` exit 0 + `remote.X.Y()` 全 domain resolve）。

**大 sprint**——18 包，多 session。建议后续 session 分批认领（按 domain 分片）。

## Reframe finding（2026-09-10 — main session 重验，subagent Explore 调研）

**Ticket 前提被 on-disk 状态证伪**。原 Question 假设"18 包缺 `src/remote.ts` → 无 declaration-merge → `ClientRemote` 缺 X → ~81 error"。**重验（铁律，主 session 6 条断言全过）**：

- 18 包**已有生成的** `lib/typert.remote-client.d.ts`（`@deepseek-ai/dsh-typert-generator` 发；session-controller 67L/5532B、commands 29L/1624B、evidence-query 36L/2284B），声明 `interface TypertRemoteNamespaceMap { '<ns>': TypertRemoteNamespace$… }`，augment `TypertClientRemote extends TypertRemoteNamespaceMap`（`packages/typert/protocol/src/types.ts:307`）。→ `ctx.remote.<ns>.Y()` **已 resolve**。
- `tsc -b tsconfig.client.json` `TS2307`（cannot-find-module）= **0**。35 TS2339 全 transport 层（`$dispatch`/`ConnectionHandle.api`/`ConnectionSinks.onHostEnvelope`/`agentPreset` on SessionSummary 等），零 `remote.<ns>` 失败。
- 67 TS2305 在 **consumer 包**（`packages/client/runtime` 47、`ui-settings-models` 9、`connection` 8、`result-cache` 3），**非 18 provider**（provider 0 TS2305）。driver = (a) **ghost transport 类型**（`IApiclient`/`MuxFrame`/`HostFrame`/`RpcReceipt`/`ClientResponse`/`SessionModels`——apiproxy 删除残留，fork src 无定义；`RpcError`→`RemoteError` 改名，`RemoteError` 在 `packages/typert/protocol/src/remote-error.ts`）；(b) **错位 view 类型**（`ToolEventView`/`SubagentAddress`/`JobView`/`DirectoryEntry`/`DirectoryListing`/`SessionMaybeProvideInfo`/`TodoItem`——存于其它包，consumer 从错 barrel import，需 barrel re-export 或修 import 路径）。
- 故 18 包 `src/remote.ts` = **结构提取重构**（gateway 已 inline 在 `src/index.ts`，仅搬到 `src/remote.ts`），**~0 直接 error drop**。UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS 的"~122 adaptive（B/C/G 18 包 ~81）"归因**有误**——18 包注册不清 error。

**217 真路径（B）= consumer 包改造**：ghost 类型改用 Typert 新类型（`RemoteError` 非 `RpcError`；Typert transport 类型替 ghost）+ 错位 view 类型 barrel re-export / 修 import + transport 类型补全（`$dispatch`/`.api`/`onHostEnvelope`）。UM10 typecheck-green（217→0）的**直接路径**，上游忠实（采新 Typert 类型），最利 data-agent（解锁 UM10→UM11→push）。

**18 包 `src/remote.ts`（A）**：上游忠实结构工作，~0 error drop，不解 UM10；是 B 部分 consumer 重写的前置（barrel re-export `XRemote` interface）。可作独立低优 ticket 或 B 之后。

**开放决策（用户，下一 session 拍板）**：(A) 保 18 包结构 / (B) 重 scope 到 217 真路径 / (A-then-B)。**主 session 荐 B**（直接解 UM10、上游忠实、最利 data-agent）。本 session 不决，handoff 见 `prompts/next-session-2026-09-10-follow-on-3-reframe.md`。

**已验证事实**（下一 session 免重导）：见上 + `/tmp/dsh-um10-fo2-force.log`（217 全量 log）+ `packages/data/result-cache/src/remote.ts`（template，host gateway 源）+ 18 包 `lib/typert.remote-client.d.ts` 已生成 + consumer TS2305 分布（runtime 47/ui-settings-models 9/connection 8/result-cache 3）。

## Session progress

- **2026-09-10（主 session）**：Follow-on 1 fixture（`63659a22d4`，287→217 combined with Follow-on 2）+ Follow-on 2 config（`5ee128214d`）+ connection fake-api（`2504169487`，217→187）。三 fix 全 clean/mechanical（type-only / test-fake，无 logic 改）。
- **2026-09-11（主 session — 本 shard）**：ui-settings-models 39 → 0（tsc client 187 → 148，`--force` 权威 + lefthook 绿）。commit `03e865a148` on resync `[Follow-on-3-B] ui-settings-models: strip ghost types + D3 migration`。三类 driver 全触及：ghost `IApiClient`/`CredentialView`/`ConfigurableProviderView`/`DiscoveredModelView` → `ClientRemote`/`CredentialInfo`/`LlmConfigurableProvider`/`LlmDiscoveredModel`（`@deepseek-ai/dsh-api-remotes/client`）；D3 positional args（`settings.mutate(ns,ops,rev)`/`credentials.describe(refs)`/`credentials.set(ref,val)`/`credentials.unset(ref)`/`llm.discoverModels(ns,req,signal?)`/`llm.providers({})` → `llm.listConfigurableProviders()`）；`RemoteResult<T>` 无 `.result` wrapper（`.ok/value/error` 直接）；`.value.{providers,credentials,models}` sub-key gone；event `'credentials/updated'` → `'credentials/reference-updated'`；test bench `new TestRemote(ctx).emit(event, args)` 替 `$dispatch`。**D1（`LlmConfigurableProvider` 无 `active` field）**：cross-ref `ctx.remote.llm.listProviders()` 折 `row.active` 上 `ProviderRow`（hard-fail on either half，mirror listConfigurableProviders 失败处理；文档理由 in store.ts:156-158）。`providerUsable`/`onboardingReadiness` 读 `row.active`。stale README 提 `ConfigurableProviderView`（EN+ZH）= 文档 drift，非阻塞 tsc，follow-up。

## Resolution

(open — B shard 2 of 4 done. Remaining B: result-cache 4 (D3, next shard) + Phase-2 blocked by Plan B ADR-0002 = client/runtime 131 delete + 4 presenter 13 migration.)
