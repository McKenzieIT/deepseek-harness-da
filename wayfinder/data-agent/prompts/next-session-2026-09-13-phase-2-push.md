# Next-session prompt — UM-flow Phase C：UM10 full-gate 验证 + UM11 PR + UM12 GA-FORK-CI re-sweep（Phase-2 已 resolved，进入 push 阶段）

> 承接：`next-session-2026-09-12-phase-2-client-runtime-decommission.md`（Phase-2 已 **resolved**：resync commit `eb9e4cf05c` + master commit `96464c6157`，tsc 144→0 + vitest 全绿 + boot OK）。本 prompt **自洽**，next session 据此独立执行 UM-flow Phase C（验证+PR+durable 方法）。
> **本 session 主轴 = push + 全 gate 验证**：Phase-2 已把 client tsc 清到 0 + vitest 全绿 + boot OK + lefthook 3 gate 绿，但 UM10 full `check:ci:*` gate sweep + UM11 push/PR + UM12 GA-FORK-CI re-sweep 未做。

## 决策历史（本 prompt 前提，勿再重决）

- **UM14 re-sync** resolved（synced base `8112743d69`，含 upstream `c389f96bf3` 所有 seam 移位）。
- **UM-ARCH regen-from-synced** resolved（`038d8b51ce`，`docs/architecture-graph.md` 权威 dsh 图）。
- **UM16 root-entry fix** resolved-partial（`build:lib:host` GREEN on node 24；`build:official` 325 apiproxy-removal errors——需重评，Phase-2 清了 client tsc 0，build:official 可能部分/全解）。
- **UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS** resolved（mixed verdict；spawned UM-CLIENT-CONFIG-CLEANUP ✅ + UM-CONNECTION-FIXTURE-DEAD-APICLIENT ✅ + R-DA-TYPERT-REMOTE-REGISTRATION ⏳）。
- **R-DA-UI-PRESENTER-COMPOSITION** resolved（Plan B + **addendum**：snapshot-access ③' via `ChatSnapshot.legacy` compat slice）。
- **R-DA-CLIENT-RUNTIME-DECOMMISSION** resolved（Phase-1 2026-09-09 + **Phase-2 2026-09-12**；zombie 删除 + 4 presenter Plan-B 迁移）。
- **R-DA-UI-SETTINGS-MODELS-VITEST-DEBT** resolved（本 session，122→0）。
- **admin seam-3/4 lazy-webServer** landed（`9ba8638eac`，push deferred Phase-C）。

## 累进进度（tsc client `--force` 权威 + UM-flow phase）

| session | 事件 | 起→止 | commit（resync） |
|---|---|---|---|
| 2026-09-09/10 | Follow-on 1+2 + UM-CLIENT-CONFIG + UM-CONNECTION-FIXTURE | 287→217 | `63659a22d4`+`5ee128214d`+`2504169487` |
| 2026-09-11 | ui-settings-models shard 2 + result-cache shard 3-b | 217→148→144 | `03e865a148`+`d0f152ba32` |
| **2026-09-12** | **Phase-2 decommission + 4 presenter Plan-B + vitest 债清** | **144→0** | **`eb9e4cf05c`**（+ master `96464c6157` wayfinder record） |
| next | **UM-flow Phase C：UM10 full-gate + UM11 PR + UM12 GA-FORK-CI** | — | — |

**resync tip**：`eb9e4cf05c`（branch `upstream/resync-2026-09-08`，**unpushed**）
**master tip**：`96464c6157`（branch `master`，ahead origin 28，**unpushed**）

## 本 session 目标：UM-flow Phase C（验证+PR）

### 线 A（主轴）：UM10 full-gate 验证

Phase-2 已 verified（勿重跑除非疑）：`tsc -b tsconfig.client.json --force` = 0（144→0）+ `tsc -b tsconfig.host.json --force` = 0（boot wiring）+ vitest 全 6 包绿（table 147 + decomp 31 + followups 27 + semantic-layer 110 + result-cache 30 + settings-models 222）+ lefthook 3 gate 绿 + boot（host tsc 0 + `cordis.patch.yml` upstream seam mount）。

**UM10 剩余**（Phase-2 未跑的 full gates）：
1. `pnpm run check:all`（或 `check:ci`）—— 全 gate sweep（含 doc-typecheck / verify-md-wrap / verify-md-links / verify-cordis-config / verify-client-packages / constraints / publint / verify-tsconfig-paths / gen-cordis-catalog --check 等）。
2. `pnpm run build:official`（UM16 的 325 apiproxy-removal errors——**重评**：Phase-2 清了 client tsc 0 + Follow-on-3-B 清了 apiproxy adaptive A/B/C，build:official 可能部分/全解；若仍红，查 residual 是否 R-DA-TYPERT-REMOTE-REGISTRATION 域）。
3. `pnpm run test:web` / `test:bench` / `test:e2e` / `test:snapshot`（如 UM10 scope 含——这些可能慢，按需）。
4. `pnpm run lint`（full oxlint，非 staged——Phase-2 只跑 staged lint 0 errors；full lint 可能报 2 pre-existing `no-unnecessary-type-assertion`（components:203 + provider-form:155，typeAware，非 staged gate，非阻塞）+ 其他；记 residual）。
目标：full gate 绿（或记 residual 为 pre-existing non-blocking）。

### 线 B：UM11 PR + merge + post-cleanup

1. push resync `upstream/resync-2026-09-08`（tip `eb9e4cf05c`，含 Follow-on-3-B 全 commits：`2504169487`/`03e865a148`/`d0f152ba32`/`eb9e4cf05c`）。
2. push master `master`（tip `96464c6157`，ahead origin 28，含 wayfinder record）。
3. 开 PR（或直接 push，per fork 流程）+ merge。
4. UM11 post-cleanup（merge 后清 residual）。

### 线 C：UM12 GA-FORK-CI re-sweep

post-merge 重基线 GA-FORK-CI：
1. `tickets/phase-misc/GA-FORK-CI-translation-pairing-debt.md`（fork CI 翻译 pairing 债）。
2. 重基线 + 修 residual/new red gate。
3. 补 UM10 只验非回归的 gap。

### 线 D（并行，AFK）：UM15 durable sync 方法 + UM-ADAPT 收尾

- **UM15**（durable upstream-sync method）：UM-ARCH + UM-ADAPT 后，形式化 N-behind 告警 + sync 频率 + 94-conflict-resolution + impact analyzer（upstream 更新 → diff dsh 图 → 架构移位 → ticket 候选）。
- **UM-ADAPT per-shift 收尾**：seam-4（Plan B done）+ workspace-files（→ R-DA-SQLITE-STORAGE-ALIGNMENT）+ invariant-cleanup（feeds UM16）。

## 执行流程（铁律）

1. **Read** 本 prompt + `tickets/phase-upstream-merge/UM-flow-2026-09-08.md`（overview）+ `UM10`/`UM11`/`UM12` 票 + `R-DA-CLIENT-RUNTIME-DECOMMISSION` Resolution。
2. **线 A**：`pnpm run check:all` + `build:official` + full `lint` + `test:web`/`test:snapshot`（按需）。记 residual（pre-existing non-blocking vs new）。
3. **线 B**：push resync + master（或开 PR）。UM11 post-cleanup。
4. **线 C**：UM12 GA-FORK-CI re-sweep（重基线 + 修 residual）。
5. **线 D**（并行）：UM15 + UM-ADAPT 收尾。
6. **记**：每线完更新对应 UM ticket Resolution + map Decisions-so-far。

## 关键上下文（已验证，勿重导）

- **resync** `/Users/mckenzie/workspace/dsh-resync`（`upstream/resync-2026-09-08`，tip `eb9e4cf05c`，unpushed，working tree 干净：84 untracked pre-existing tsdown under `packages/data/{audit,evidence-query,semantic-layer}/src/`）。
- **master** `/Users/mckenzie/workspace/deepseek-harness-da`（tip `96464c6157`，ahead origin 28，unpushed，working tree 完全干净）。
- **5 sibling worktrees**（`dsh-p2-present-table`/`-decomp`/`-suggest-followups`/`-uism-layer`/`-uism-vitest`）已合并入 resync commit，可 `git -C /Users/mckenzie/workspace/dsh-resync worktree remove <path>` 清理。
- **node v24 强制**：`PATH="/usr/local/bin:$PATH"`（`/usr/local/bin/node` = v24.15.0；**v25 crashes tsdown/rolldown + fs-ext——UM16 critical finding，勿用 v25**）。
- **主 session + subagent 强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠——用 `mcp__local__bash` 的 `rg`/`grep -rEn`。
- **Phase-2 关键决策（ADR-0002 addendum，勿重导）**：snapshot-access = ③' via `ChatSnapshot.legacy` compat slice（`snapshot.views.get('chat')?.legacy.{nodes,turnTimings}` + `.timeline` + augmentation loading 两步）；`agentPresets` 非 blocker（`TypertRemoteNamespaceMap` 在 full `-b` transitively loads，bounded-`-p` 残留是假阳性）。
- **boot 验证方式**：web-app 无 `build`/`dev` script（`dsh.bundle.patch` 非 script）；用 `tsc -b tsconfig.host.json`（host 编译，含 web-app host wiring）作 build-equivalent。web-app 的 lib/ 由 root `build:lib:host`/`build` 产出。

## Deferred（本 session 不做，后续）

- **UM4 apiproxy rehome** + **UM6 docs/subsystems**：leave-open（blocked-on-R-DA，Phase-2 done → **可能 unblocked；重评**）。
- **R-DA-TYPERT-REMOTE-REGISTRATION**（18 包 Typert namespace registration）：open；本 shard 不需（agentPresets transitively loads in -b）；但 UM10 full host typecheck / build:official 可能 surface 其他 namespace 的 TS2339——重评是否需先清。
- **R-DA-SQLITE-STORAGE-ALIGNMENT**（UM-ADAPT spawned）：storage-sqlite + data/audit route through `storage-domain` hub?
- **UM-CORDIS-REGEN**（open）：result-cache typert 已在 shard 3-b 清（D2/D3）；catalog regen 第二轮（如需——Phase-2 未触发新 regen 需求）。
- **defer 到 upstream-merge（6 项）**：A5（id-less 簇）+ A6（apiproxy presetSwitches）+ A15（ci.yml vars 隔离）+ A16（credentials-local override revert）+ A22（~12 churn 回退）+ A25（headless setup race）。
- **blocked（1）**：A23（worktree/branch 收尾）——阻塞于并行 session 9 个非我 worktree；等并行 session 停后评估 rescue/abandon + 清理。
- **untracked tsdown**（84 files，pre-existing under `packages/data/{audit,evidence-query,semantic-layer}/src/`）：gitignore follow-up。
- **ui-settings-models README drift**（EN+ZH line 37 提 `ConfigurableProviderView`）：doc-sync follow-up，1 分钟可顺手改。
- **2 pre-existing `no-unnecessary-type-assertion` oxlint errors**（`components.client.spec.tsx:203 ctx as never` + `provider-form:155`）：pre-existing（非 Phase-2 引入），非 staged gate（`typeAware: false`），非阻塞；可 follow-up（但移除 `as never` 是语义改动，需谨慎）。

## 起手 checklist

1. Read 本 prompt + `tickets/phase-upstream-merge/UM-flow-2026-09-08.md`（overview）+ `UM10`/`UM11`/`UM12` 票 + `R-DA-CLIENT-RUNTIME-DECOMMISSION` Resolution。
2. 确认 resync tip `eb9e4cf05c` + master tip `96464c6157` + 两树 working tree 干净（resync：84 untracked pre-existing tsdown；master：完全干净）。
3. **线 A**：`pnpm run check:all` + `build:official` + full `lint` + `test:web`/`test:snapshot`（按需）。记 residual。
4. **线 B**：push resync + master（或开 PR）。UM11 post-cleanup。
5. **线 C**：UM12 GA-FORK-CI re-sweep。
6. **线 D**（并行）：UM15 + UM-ADAPT 收尾。
7. 目标：UM-flow Phase C 完成（full gate 绿 + PR landed + GA-FORK-CI 绿 + durable 方法雏形）。
