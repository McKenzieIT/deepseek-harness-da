# UM-CORDIS-REGEN — regen cordis catalog + api on synced base（typert surface fix + regen）

**Type**: task · **Phase**: upstream-merge · **Status**: open · **Assignee**: unclaimed
**Blocked by (api half)**: UM14（synced base 8112743d69——`api-catalog.ts` regen 需对 synced latest 跑）
**Blocked by (client half)**: [R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1](../phase-misc/R-DA-CLIENT-RUNTIME-DECOMMISSION.md#phase-1--afk-safe-unblockcan-放入下一-session-并行批)（删掉 zombie 里 `'root'` 冗余声明后 `gen-client-catalog` 才能跑）
**Blocks**: UM10（typecheck 全绿依赖 regen'd catalog）· 60× TS2339 `ClientRemote namespace-missing` 的一部分（catalog 出后 `TypertRemoteNamespaceMap` 填充）
**Related**: UM-flow-2026-09-08 Session A finding · Session A UM14 resolution note · R-DA-CLIENT-RUNTIME-DECOMMISSION（unblocks 本票 client 半）· UM16（build:official 绿的姊妹前提）

## Question

在 UM14 synced base（`8112743d69`）上，完成 cordis 生成物的 regen——分三个独立子任务，两个 AFK-safe，一个 gated：

## 三个子任务

### 子任务 1 — result-cache typert surface fix（AFK-safe，独立可跑）

**位置**：`packages/data/result-cache/src/remote.ts:74` 附近的 `@Remote('get')` 声明。
**问题**：449 impact 引入的更严 typert analyzer 抓到 "Remote boundary contains unconstrained unknown data"——`@Remote('get')` 的 JSON type 未约束（`resultId`/`ResultEntry` boundary 为 unknown-typed）。阻塞 `gen-cordis-api` regen。
**修法**：surface fix——约束该 `@Remote('get')` 的 JSON type（把 `unknown` 收窄为具体 shape，或用 `zod`/`schemastery` schema）。**不动语义**（只是把已有的 result 结构类型化）。
**Deliver**：typert analyzer 不再报 unconstrained-unknown；`gen-cordis-api` 在 result-cache 位置不再挂。

### 子任务 2 — gen-cordis-api regen（对 synced latest，需子任务 1 done）

**依赖**：子任务 1 完成（result-cache typert 通过）+ UM14 synced base。
**修法**：跑 `pnpm run gen-cordis-api`（或对应 script），产出的 `api-catalog.ts` 落回 repo。verify 对 synced latest 的 @Remote namespace 表面完整。
**Deliver**：`api-catalog.ts` regen'd on synced base；`--check` 无漂移；`ClientRemote` namespace 里 upstream 各 @Remote 包填充回来（session-controller/workspace-controller/settings-controller/api-gateway/workspace-files/等）。
**note**：这一步预期解掉一大部分 60× TS2339 `ClientRemote namespace-missing`——因为 namespace 靠 `declare module '@deepseek-ai/dsh-typert-protocol'` 填充，而这些声明藏在各 @Remote 包 bundle 后的 `typert.remote-client.d.ts` facade 里；`gen-cordis-api` regen 应能把 catalog 侧的 namespace 表面重建。**但 facade 本身**（`typert.remote-client.d.ts` 全仓 0 个存在）依赖 tsdown bundle——那是 UM16 的门。所以本子任务解掉一部分 namespace missing，剩余部分要等 UM16 build 绿后才彻底消。

### 子任务 3 — gen-client-catalog regen（gated by R-DA Phase-1）

**依赖**：R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1 完成（zombie 的 `'root'` 冗余声明删掉 + apiproxy tsconfig ref 删掉）。
**修法**：跑 `pnpm run gen-client-catalog`（或对应 script），产出的 `slot-catalog.ts` 落回 repo。
**Deliver**：`slot-catalog.ts` regen'd on synced base；`--check` 无漂移；client slot map 反映 synced latest 的 slot 空间。
**note**：本子任务受制于 R-DA Phase-1 完成——`gen-client-catalog` 目前挂在两处：①`root` slot 重复（R-DA Phase-1 §2 解）②不确定还有别的 client-runtime 相关重复。Phase-1 完成后跑一遍验证。

## Deliver（票整体）

三份 regen'd catalog + `--check` 都无漂移。60× TS2339 `ClientRemote namespace-missing` 里 catalog 层面的部分应解（剩余的按 UM16 build 绿之后再收）。

## Sequencing hint

- 子任务 1 = AFK 立刻可做（独立于 UM14 / R-DA Phase-1）。
- 子任务 2 = AFK，做完子任务 1 后可做（依赖 UM14 ✓）。
- 子任务 3 = 等 R-DA Phase-1 完成后跑（同 session 内串行即可）。

## Resolution

(open；三个子任务应分别 verify + 落 commit)
