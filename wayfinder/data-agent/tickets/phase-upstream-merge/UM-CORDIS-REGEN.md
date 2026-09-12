# UM-CORDIS-REGEN — regen cordis catalog + api on synced base（typert surface fix + regen）

**Type**: task · **Phase**: upstream-merge · **Status**: resolved（子任务 1+2 done 2026-09-09；**子任务 3 经 2026-09-11 四重验证已满足**，见文末复核）· **Assignee**: unclaimed
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

**[2026-09-09] RESOLVED-PARTIAL** — 子任务 1+2 落地：commits `cc6d9e714e`（typert surface fix）+ `193b018827`（`gen-cordis-api` regen），worktree `../dsh-cordis`，branch `task/um-cordis-regen-2026-09-09`。**子任务 3 deferred**——blocked by `RootOwnerProps` homing。

**[2026-09-10 补记（UM10 线 A）]** prompt 曾判「Phase-2 未触发新 regen 需求」——**这个判断是错的**。Phase-2 删包后 `gen-client-catalog` 产物 `slot-catalog.ts:1220` 残留死引用 `packages/client/runtime/src/client/slots.ts`，导致 `verify-client-catalog` + `verify-package-paths` 双红。UM10 已 regen 修复（`ecaa56c848`）。另 `gen-module-graph` / `gen-tool-catalog` 也 stale（但那是 449-commit re-sync 造成，非 Phase-2）。

**残留**：`check:ci:static` 仍有 4 门 catalog 类红（`cordis catalog` / `Cordis inspect catalog` / `config catalog` / `doc graphs`），归 [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 逐门处置；其中 `config catalog` 的 `ctx.results.get` 缺 `@param` 已核为 pre-existing JSDoc 遗漏（非 Phase-2 引入）。

### [2026-09-11 复核] 子任务 3 **已经满足**——本票可关，无需再跑

子任务 3（跑 `gen-client-catalog`、把重生成的 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 落库、`--check` 无 drift）当初 deferred 的原因是 `gen-client-catalog` 在僵尸包 `client/runtime/src/client/slots.ts:41` 上撞重复 `'root'` slot 且 `RootOwnerProps` 未导出。这两个前提都已消失。在 resync `5fe9b32e44` 四重验证：

1. `packages/client/runtime` **已不存在**（R-DA Phase-1 resolved 2026-09-09，5 个 `[R-DA-P1]` commit；Phase-2 删掉僵尸）。
2. `RootOwnerProps` 已导出于 `packages/client/ui-renderer/src/client/registry.ts:48`，并在 `index.ts:15` re-export → 「RootOwnerProps homing」阻塞解除。
3. `slot-catalog.ts` 已带 `RootOwnerProps`（`:1468`），且**零** `client/runtime` 引用（09-10 备注里 `:1220` 那处死引用已不在）。
4. `verify-client-catalog` → `slot-catalog.ts is up to date`，exit 0，工作树干净。

实际是 UM10 的 `ecaa56c848` + R-DA Phase-2 顺带把它做掉了。

**同时更正票里的「残留」行**：原写「`check:ci:static` 仍有 4 门 catalog 类红」→ 现在只剩 **1** 门。四门逐个实跑：`verify-cordis-catalog` 绿（99 up to date）、`verify-cordis-inspect-catalog` 绿、`verify-doc-graphs` 绿（6 up to date）、`verify-cordis-api` 绿。唯一仍红的是 **`verify-config-catalog`**（`docs/config-catalog.md` stale，实测 regen 只差 1 行；但它有 `.zh.md` + `.i18n.yaml` 配对，须连带 zh 侧并 `--write` 重记）——那是 A 类 pre-existing，不归本票。

其余已死的行：`Blocked by（client half）: R-DA Phase-1` → 2026-09-09 resolved；`Blocks: UM10 · 60× TS2339` → UM10 resolved，且 `5fe9b32e44` 上 `tsc -b` 两面 EXIT 0。

**剩余 = 纯记账**：`dsh-cordis` worktree / `task/um-cordis-regen-2026-09-09` 分支可删（实测该分支 **已并入 `origin/master`**，ancestry 检查通过，属安全删除集）。归 [UM11](UM11-pr-merge-post-cleanup.md) Scope 4-6。
