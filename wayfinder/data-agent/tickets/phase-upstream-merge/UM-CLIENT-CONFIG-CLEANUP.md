# UM-CLIENT-CONFIG-CLEANUP — client tsc surface errors: tsconfig rootDir topology + @types/node

**Type**: task · **Status**: resolved · **Phase**: upstream-merge
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

**Resolved 2026-09-10** — resync branch `upstream/resync-2026-09-08`, commit `5ee128214d`。tsc `tsconfig.client.json`（node 24）：284 → **217**（`--force` 权威复跑确认）；D+E errors = **0**（api/remotes + 4 data 包全 0 error，无新增）。lefthook pre-commit（whitespace + vendor-manifest-guard）绿。

**修法（A，上游忠实）**：给 `packages/api/remotes/tsconfig.client.json` 的 `references` 加 4 条 composite 目录式引用——`../../data/semantic-layer`、`../../data/evidence-query`、`../../data/audit`、`../../identity/identity`（插在 `../../typert/protocol` 前，镜像已有 `../../credentials/credentials` 风格）。refs 22→27。

**根因 + 为何 E 坍缩进 D**：`api/remotes/src/remote-events.ts:15` `import type {} from '@deepseek-ai/dsh-evidence-query'` + `src/client/index.ts:18` import `.../remote`；`tsconfig.base.json` 的 path map `@deepseek-ai/dsh-*` → `./packages/*/src`（SOURCE）。无 project ref 时 tsc 把 4 个 data 包源码直接拉进 api/remotes client 编译 → rootDir 不符（D: 44 TS6059/6307）+ node 类型不可见（E: 14 TS2591/2503，因 api/remotes extends `tsconfig.base.client.json` `types:["client-build-environment"]`=无 node）。加 4 ref 后，tsc -b 让每个 data 包在自己 tsconfig（extends `tsconfig.base.json` `types:["node"]`，`@types/node@22.20.0` 已装）下编译 → node 类型自解，api/remotes 只消费 emitted `.d.ts` → **E 坍缩进 D，无需单独 `@types/node` 编辑**（ticket 原设两改，忠实修法一改即清两类）。

**超额完成**：预期 284→226（清 58），实际 284→217（清 67）——修拓扑同时解了 data 源在 api/remotes 错误 context 下的 transitive 级联错误（9 个）。

**上游忠实论证**：(a) composite references 遵 repo 明示哲学（`tsconfig.base.json:27` "Project references, not declaration path aliases"）+ 镜像现有 22 条 reference 风格；(b) path maps 指 built `lib/` 被排除（违反哲学 + 与现有风格相悖）。`remote-events.ts:15` 的 evidence-query import 在 upstream synced base `8112743d69` 已存在（Typert Remote 事件转发面，非 fork 加）= `4f00a8b82a refactor(api): remove ApiProxy package` fallout 漏补的 client-side reference 拓扑。机械修复，无决策（subagent Explore 调研 + 主 session 重验 5 条关键断言：tsconfig 内容/哲学/upstream git show/@types/node 已装/data-audit extends base）。

**剩余**：UM10 typecheck-green gate 卡 217（全 adaptive 域：TS2305 67=缺 ClientRemote 属性等 + TS7006/2339/... → Follow-on 3 R-DA-TYPERT-REMOTE-REGISTRATION adaptive B+C+G ~81 + count-discrepancy delta）。本票 + UM-CONNECTION-FIXTURE-DEAD-APICLIENT 合清 fixture+config surface（287→217，-70），余 217 全 adaptive，留 Follow-on 3。
