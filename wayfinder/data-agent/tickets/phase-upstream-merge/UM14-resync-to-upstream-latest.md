# UM14 — re-sync 到 upstream 最新版（执行）

**Type**: task (multi-session) · **Status**: open · **Phase**: upstream-merge
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

(open — multi-session task；按子步 1-4 推进；每子步 commit 落 `upstream/merge-2026-09-07` 或 re-sync 专用分支)
