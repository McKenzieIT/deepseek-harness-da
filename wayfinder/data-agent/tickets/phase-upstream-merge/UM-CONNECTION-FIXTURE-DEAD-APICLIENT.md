# UM-CONNECTION-FIXTURE-DEAD-APICLIENT — remove dead AbstractApiClient subclass in connection fixture

**Type**: task · **Status**: resolved · **Phase**: upstream-merge
**Blocked by**: UM14（synced base `8112743d69`）、UM16
**Blocks**: UM10（typecheck-green gate）
**Related**: UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS（research 票，本票是其 Adaptive A 分支）、R-DA-CLIENT-RUNTIME-DECOMMISSION（zombie `client/runtime`——**不同域**，本票是 `client/connection`，不重叠）
**Flow**: 见 `UM-flow-2026-09-08.md`

## Question

删 `packages/client/connection/src/client/fixture.ts:3967-4101` 的死 `FixtureApiClient extends AbstractApiClient` + `callUnary<K extends keyof RpcMethodMap>`/`openMux`/`openHost`/`tapStream` override（~41 个 TS2304/2552/4112/2339/2353/2366/7006 error）。

fixture **已有新 pattern**：`:3971` `readonly rpc: ClientConnectionRpc`、`:3755` `const rpc: ClientConnectionRpc`。`AbstractApiClient`/`ApiProxy`/`RpcMethodMap`/`RequestPayload`/`ResponseValue` 在 synced-base **无声明（REPLACED 非 moved，无 repoint target）**——故不能 repoint，只能删死子类、留 `ClientConnectionRpc`。

完成迁移（fixture 已半迁），非深重构。

## Resolution

**Resolved 2026-09-10** — resync branch `upstream/resync-2026-09-08`, commit `63659a22d4`（on top of `ac6c8c6c2b`）。tsc `tsconfig.client.json`（node 24）：287 → **284**（`--force` 权威复跑确认）；`fixture.ts` **0 error**。lefthook pre-commit（oxlint + whitespace + vendor-manifest-guard）全绿。

两步完成 fixture 的 apiproxy→Typert 适配收尾（41/41 fixture error 全清）：

1. **死子类删除**（`ac6c8c6c2b`，前序 session，38/41）：删 `fixture.ts:3963-4105` 死 `FixtureApiClient extends AbstractApiClient` + overrides。`AbstractApiClient`/`ApiProxy`/`RpcMethodMap`/`RequestPayload`/`ResponseValue` 在 synced base 无声明（REPLACED 非 moved，无 repoint target）→ 只删不 repoint。

2. **results/downloads 残留 arms 迁移**（`63659a22d4`，本 commit，3/41 + downloads）：`workspaceApi: FixtureWorkspaceApi` 对象里两个旧 `IApiclient`-style 残留 arm：
   - `results: { get: request => err(request, {code:'result-not-found',...}) }`（原 :3735，TS2353/7006/2304）→ **迁进 `ClientConnectionRpc.call` switch** 新增 `case 'result/get'`，返 `sessionErr({code:'result-not-found', message, details:{resultId}})`，**镜像 host 侧 `ResultsRemoteGateway.get` 契约**（缺失 id → result-not-found；fixture 无 store → 每个 id 都缺失 → 恒 result-not-found）。复用现成 `sessionErr`（:2140，`ConnectionRpcFailure.code:string` 承载 'result-not-found'），无新 helper。`resultId` 从 switch payload 的 `request`（=`args.request`）取，与 `workspace/create` 等 case 同源。
   - `downloads: { sessionLog: () => ... }`（原 :3745，删 `results` 后新发 TS2353——此前被 `results` 的 error-laden 字面量遮蔽未报）→ **删**。注释自陈 "Satisfies the ApiProxy contract type only... never reached through the fixture's dispatch"；session.export 走浏览器原生 download manager（非 RPC），fixture 已是 `ClientConnectionRpc`（非 `IApiclient`）无契约要满足 → 死代码，删无替代。

**为何 A（上游忠实的最佳重构）**：upstream `4f00a8b82a refactor(api): remove ApiProxy package` 把 apiproxy（HTTP/JSON-RPC fetch-carrier）替换为 Typert Remote 体系（`@Remote` + `ClientRemote` + `TypertGateway`）。fork 经 UM14 resync 继承，fixture 半迁。production 包的 Typert 注册 = Follow-on 3（R-DA-TYPERT-REMOTE-REGISTRATION，18 包；fixture 不在其中、无 `src/remote.ts`）→ **fixture 豁免**，其 hand-written `ClientConnectionRpc.call` switch 是永久形态，`case 'result/get'` 非 throwaway。A 把残留 arm 迁进新模型 + 镜像 host 契约 = 适配性改造（核心需求 #2），非 `@ts-ignore` 小补丁（C 排除）；B（只删 results 不加 case）会让 demo 路径未来路由接通时落 `default:` 硬错（排除）。

**Latent 残留**：无（results/downloads 两 arm 全清，`workspaceApi` 现与 `FixtureWorkspaceApi` 接口严格一致）。

**下游**：UM10 typecheck-green gate 仍卡 284（Follow-on 2 UM-CLIENT-CONFIG-CLEANUP surface D+E ~58 + Follow-on 3 R-DA-TYPERT-REMOTE-REGISTRATION adaptive B+C+G ~81）。本票 unblocks UM10 的 fixture 部分（`fixture.ts` 0 error）。
