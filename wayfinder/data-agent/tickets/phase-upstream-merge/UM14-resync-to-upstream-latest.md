# UM14 — re-sync 到 upstream 最新版（执行）

**Type**: task (multi-session) · **Status**: resolved (Session A 2026-09-08) · **Phase**: upstream-merge
**Blocking**: 无（UM13 research 已完成，可直接启动）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase A）

## Question

执行把 fork 从 `d347e703`（2026-09-04，已 merge @ `6b7610d45a`）re-sync 到 upstream 最新 `c389f96bf3`（2026-09-08，+449 commit）的 re-merge：全解冲突 + 迁 2 个 seam break + 采纳新 seam。

## 子步

1. **re-merge + 50 个 real 冲突**（merge-base `d347e703`；详见 `.tmp/upstream-resync-conflicts.md`，已核验）：3 个 root tsconfig（additive 无碰撞——fork UM8 的 `dsh-*` glob 让位 specific alias）、cordis-catalog/api-catalog（41↑/28↑，data-agent 重度用 cordis）、`agent-loop/src/index.ts`（9↑，fork GA-GT1 改过）、`.github/workflows/ci.yml`（14↑，UM2 resolved）、subprocess/subagent/bash-sandbox spec（13↑）、`pnpm-workspace.yaml`（7↑）等。
2. **迁 seam 3 BREAK**：`packages/client/connection` — `ConnectionConfig→ConnectionRecoveryConfig` + `inject ['webServer','credentials']→['credentials']`（webServer 改 lazy/carrier-neutral）。
3. **迁 seam 4 BREAK**：`packages/client/modules` — `DshClientDeclaration→DshClientManifest`（从新 `@deepseek-ai/dsh-package-manifest`）+ `inject ['webServer','loader']→['loader']`。加 `dsh-package-manifest` dep。
4. **采纳新 seam**：`packages/api/workspace-files` + `workspaceFilesRemote`（dep + tsconfig alias + 挂进 api-remotes client assembly mount-loop）。对做取数/文件的 data-agent 是该采纳的增强。

> seam 3/4 的"webServer lazy/carrier-neutral"是 upstream 架构移位——是否需 adaptive（不只表面改名）由 UM-ADAPT 判定；本票先做 re-merge + 表面迁移让编译过，adaptive 重构在 R-DA/UM16 据 UM-ADAPT 做。

## Input

UM13 research（DONE）：`.tmp/upstream-resync-conflicts.md`（conflict landscape，57 候选/50 real/3 build-critical/0 data-agent）+ `.tmp/upstream-449-impact.md`（449 content + data-agent impact，5 条已核）。

## Deliver

synced 分支（build **仍不绿**——根 entry 是 upstream 共享 breakage，re-sync 修不了，由 UM16 在 synced base 上 fix）。

## Resolution

**Resolved 2026-09-08 (Session A)** — commit `8112743d69` on `upstream/resync-2026-09-08`（2-parent merge: base `558e6f4f66` + upstream `c389f96bf3`）。

Re-merge + 全解 36 冲突（21 UU+15 AU，merge-base `d347e703`）按 dry-run `um14-merge-dryrun-2026-09-08.md` 8 步：tsconfig.host.json additive-union；workspace/config 含 workspace-files 采纳；15 AU 重命名；source inputs（api/remotes client mount `workspaceFilesRemote`+留 fork 3 data-agent remotes；ui-layout 采纳 `rightbar` rename+留 `details.aux` slot for ui-semantic-layer；platform/seed union zod+dockkit）；gen-cordis-catalog union；ui-settings-models cluster；剩余 1-hunk。

**Persona seam 表面迁移**（tsc 发现，dry-run/449-impact 未标）：`PERSONA_SECTION→PERSONA_PREFIX_SECTION`、`Config.persona→personaPrefix`、`DEPLOYMENT_PERSONA→DEPLOYMENT_PERSONA_PREFIX`（phase-gate/agent-spine-demo/tool-subagent/scoped-tool-subagent/tool-scope-routing）。

**tsc green（host）**；**tsdown fail** root entry `lib/types/{index,invariant,startup}.js`=UM16。

**延至 Phase B（per UM-flow）**：catalog regen（CORDIS task）——`slot-catalog.ts`+`api-catalog.ts` 取 fork（`--ours`）；阻塞 by `packages/client/runtime` zombie `root`（R-DA decommission）+ `result-cache/remote.ts:74` typert unconstrained-unknown；tsc-safe（catalogs 被 providers.ts opaque import）。seam 3/4 adaptive（admin lazy-webServer）=R-DA Session C。

`pnpm install` green（lockfile 重生成 1532 entries）；fs-ext 跳过（--ignore-scripts，node v25 V8 ABI 不兼容，runtime-only）。
