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

## Resolution

(open)
