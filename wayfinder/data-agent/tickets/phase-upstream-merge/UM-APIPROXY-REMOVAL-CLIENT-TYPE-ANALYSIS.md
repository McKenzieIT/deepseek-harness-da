# UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS — apiproxy 移除 fallout：surface repoint 还是 adaptive 重构？

**Type**: research · **Status**: resolved (mixed verdict, 2026-09-09) · **Phase**: upstream-merge
**Blocked by**: UM14（synced base `8112743d69` 引入 `4f00a8b82a refactor(api): remove ApiProxy package`）
**Blocks**: UM10（typecheck-green gate——325 个 client/data type error 卡它）
**Related**: UM4（apiproxy-rehome-results-rpc-remote——范围窄到 results-RPC 2 个孤儿文件，本票不重叠）、R-DA-CLIENT-RUNTIME-DECOMMISSION（zombie `client/runtime`，不同域——本票是 `host/apiproxy` removal fallout）、UM16（root-entry fix 解 mask 后露出本层）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase B-clear / Phase C）

## Question

UM16 解 root-entry mask 后，`build:lib:client` 露出 **325 个 pre-existing type error**——全是 `4f00a8b82a refactor(api): remove ApiProxy package`（删 `packages/host/apiproxy`）的 fallout：client/data 包里 ~325 处裸引用 `ApiProxy`/`AbstractApiClient`/`RpcMethodMap`/`RequestPayload`/`RpcResponse`/`ResponseValue`（types 曾 ambient 自 apiproxy，包删了引用没清）。top 站点：`packages/client/connection/src/client/fixture.ts` 41、`connection/tests/fake-api.client.ts` 30、`data/semantic-layer/src/index.ts` 24、`client/runtime/src/client/index.ts` 15、`data/evidence-query/src/index.ts` 12、`data/audit` 8、`ui-settings-models/tests` 7，余 ~160 散在 15+ 文件。main repo 同样有这些引用 → pre-existing，非本 session 引入。

**本票要判定**（满足"适配性改造（非小修补）"主线，套 UM-ADAPT 5 条判据）：

1. 这 325 处是**单纯错误 import**（types 搬到了别处，repoint 即可——surface），还是
2. **需要适配性重构**（apiproxy 移除意味着 client 要采纳新 RPC 架构——e.g. `@Remote` typert-based RPC via `api-remotes` / `client-connection` 的 `ConnectionHandle.rpc`，而非旧 apiproxy-based RPC——adaptive）？

若是 adaptive，要识别 upstream why（apiproxy 提供什么、被什么新机制替代）、data-agent 当前架构是否冲突、干净 seam 消费、不用 fork workaround、可验证。

## adaptive vs surface 判据（UM-ADAPT 5 条）

1. 识别 upstream **why**（apiproxy 是什么——RPC client？类型契约？被什么替代——`@Remote`? `api-remotes`? `ConnectionHandle.rpc`?）。
2. 判 data-agent 当前**是否与新逻辑冲突**（不只编译过——325 error 是编译错，但修法可能暴露架构分歧）。
3. 改造后**干净 seam 消费**（public 契约，不用 ambient 类型 hack 让旧引用编译过）。
4. **不用 fork workaround 对抗新逻辑**（e.g. 重新声明 `AbstractApiClient` 让旧 RPC 引用编译过，但绕过新 `@Remote` 架构）。
5. **可验证**（typecheck green + 行为符合新逻辑）。

## Deliver

判定 surface vs adaptive + per-error-class 表（哪类引用是 surface repoint、哪类是 adaptive refactor、target 各是啥）+ 喂给哪个票（surface → 本票 close + 开 task 票做 repoint；adaptive → 开 R-DA-* 或并入现有 R-DA-* Phase-2）。concrete file:line + 实际修法方向。

## Resolution

**[2026-09-09] Mixed verdict — ~68 surface + ~122 adaptive（主 session 重验关键断言通过）。**

research subagent + 主 session bash 重验（synced base `upstream/resync-2026-09-08` @ `2ec25f74f1`）：

**~68 SURFACE（config）**：
- **D（44）**：tsconfig rootDir/project-ref topology（`api/remotes/tsconfig.client.json` rootDir=`api/remotes/src` 但拉了 `data/semantic-layer`/`evidence-query`/`audit`/`identity` 的 src）→ 加 composite `references` 或改 path maps 到 built `lib/`。
- **E（14）**：`@types/node` 缺（`node:fs`/`node:sqlite`/`NodeJS` 等）→ tsconfig `types`/`lib` 加 `@types/node`。
- **F（10）**：`client/runtime/tsconfig.json:20` 死 apiproxy ref → **UM16 Commit 1 已删**（落 UM16）。

**~122 ADAPTIVE（architecture，过 UM-ADAPT 5 判据）**：
- **A（41）**：`connection/src/client/fixture.ts:3967-4101` 死 `FixtureApiClient extends AbstractApiClient` + `callUnary`/`openMux`/`openHost`/`tapStream` override（fixture 已有新 `ClientConnectionRpc` :3971/:3755）→ 删死子类、留 `ClientConnectionRpc`。
- **B（~55）**：`ClientRemote` 缺属性——packages 调 `remote.X.Y()` 但 `ClientRemote` 无 X（~20 ui-* 包 + cordis-client-runner）→ 每 domain 须声明 `src/remote.ts`（`@Remote`+interface）经 declaration-merge 扩 `ClientRemote`。
- **C（22）**：缺 `/remote` 模块（`api/remotes/src/client/index.ts:4-20` 拉 17 个 `/remote` subpath 但无 source；e.g. `evidence-query/src/remote.ts` 不存在）→ 同 B 根因。
- **G（4）**：`ClientRemote` assignability（`api/workspace-files` 的 `WorkspaceFilesRemote`）→ 同 B/C 根因，domain `/remote` 落地后解。

**关键重验（主 session bash）**：
1. `ApiProxy`/`AbstractApiClient`/`RpcMethodMap`/`RequestPayload`/`ResponseValue` 在 synced-base src **无声明**（仅 `RpcResponse<T>` re-homed 到 `connection/src/rpc.ts:55`，zombie 也不 re-export）→ **REPLACED 非 moved，无 repoint target** ✓（故 adaptive 非小修补）。
2. `packages/data/result-cache/src/remote.ts:73` 有 `@Remote('get')` marker ✓（Typert Remote 模板）。
3. 全 repo 仅 **3** 个包有 `src/remote.ts`（result-cache + 2）；`data/*` 29 个包里仅 result-cache 有 → Typert Remote 采用在早期，`remote.X.Y()` 调用方须各自声明 `src/remote.ts` 扩 `ClientRemote`。

**UM-ADAPT 5 判据（adaptive 子集）PASS**：① upstream why（apiproxy HTTP/JSON-RPC fetch-carrier → Typert Remote `@Remote`+`ClientRemote`+`TypertGateway`；旧 fetch-carrier hierarchy 删、`RpcMethodMap` REPLACED；message primitives re-homed 到 connection）② 冲突（fork client 包 mid-migration：fixture.ts 既有死 `AbstractApiClient` 又有新 `ClientConnectionRpc`；ui 包调 `remote.X.Y()` 但 `ClientRemote` 缺属性）③ 干净 seam（不 re-declare 删掉的 types——那是判据 4 违反；改采 `@Remote`+`ClientConnectionRpc`）④ 不 fork workaround ⑤ 可验证（`tsc -b tsconfig.client.json` exit 0 + `remote.X.Y()` 全 domain resolve + 无 `AbstractApiClient`/`ApiProxy`/`RpcMethodMap` 残留）。

**Count discrepancy（次要，非决策阻塞）**：UM16 `build:official` 报 325；raw resync `tsc -b tsconfig.client.json` = 206。delta ~119 是 UM16 Commit 1 删 runtime 死 apiproxy ref 后 ambient 可见性消失、暴露更多 bare-ref（多为 Class A pattern in zombie/runtime domain）。分类不受影响。主 session 可在 dsh-um16 worktree 重跑 `tsc -b tsconfig.client.json` 确认 325 breakdown。

**Feeds 3 后续票**：
- **Surface（D+E，~58；F 已 UM16）**：config cleanup task 票（或 fold 进 UM10 typecheck-green gate）。
- **Adaptive A（fixture.ts，41）**：connection-fixture cleanup task 票（fixture 已有新 pattern——完成迁移非深重构；非 R-DA-CLIENT-RUNTIME，是 `client/connection`）。
- **Adaptive B+C+G（~81，核心 Typert Remote 采用）**：新 R-DA-* 票（Typert Remote registration sprint——18 domain 包须声明 `src/remote.ts` `@Remote` markers 扩 `ClientRemote`，模板 `result-cache/src/remote.ts`；fork data-agent 包 evidence-query/schema-gateway 须声明 remote 加入 `ClientRemote`）。

---

### Pre-confirmation note (original)

(open；research subagent 调查中——见 `.tmp/next-8-apiproxy-fallout.md`；主 session 重验后回填判定)
