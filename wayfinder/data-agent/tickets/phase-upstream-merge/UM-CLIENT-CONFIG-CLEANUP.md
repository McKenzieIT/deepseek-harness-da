# UM-CLIENT-CONFIG-CLEANUP — client tsc surface errors: tsconfig rootDir topology + @types/node

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Blocked by**: UM14（synced base `8112743d69`）、UM16（root-entry fix 解 mask 后露出）
**Blocks**: UM10（typecheck-green gate）
**Related**: UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS（research 票，本票是其 Surface D+E 分支）、UM8（config-divergence）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase C verify）

## Question

修 `tsc -b tsconfig.client.json` 的 **~58 个 surface config error**（来自 UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS 的 Class D+E；Class F 已由 UM16 Commit 1 删）：

- **D（44）tsconfig rootDir/project-ref topology**：`api/remotes/tsconfig.client.json` rootDir=`api/remotes/src` 但 project-ref 拉了 `data/semantic-layer/src/index.ts`、`data/evidence-query/src/index.ts`、`data/audit/src/*.ts`、`identity/identity/src/index.ts`（rootDir 不匹配 → TS6059/6307）。修法：把 data/identity 加成 composite `references`（各自 rootDir），或改 path maps 指向 built `lib/`。
- **E（14）@types/node 缺**：`data/audit/src/index.ts:38` `node:crypto`、`data/evidence-query/src/index.ts:31-32` `node:fs`/`node:path`、`audit/src/store.ts:139` `NodeJS`、`semantic-layer` `node:sqlite`（TS2591/2503）。修法：tsconfig `types`/`lib` 加 `@types/node`。

纯 config 改动，无架构变更。落 `tsc -b tsconfig.client.json` 退 D+E 这 ~58 错。

## Resolution

(open)
