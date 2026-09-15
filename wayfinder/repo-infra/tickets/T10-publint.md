# T10 — publint gate 红（./src/* 无文件 + ./client CJS/ESM 扩展）

**Type**: task（含决策点）
**Phase**: post-discovery
**Status**: resolved (2026-09-15)
**Assignee**: unclaimed
**Related**: PR #44 CI `node 24 / snapshots and artifacts`（job 101598597835，run 34074751506，2026-09-07 02:00）。pre-existing（latent，非 W20）。**verify on current master cf813c18c0 before fixing。**

## Question

`publint` gate 红（`pnpm run publint` = `tsx scripts/publint-all.ts`，linting 292 packages）两类违规：

- **`pkg.exports["./src/*"] is ./src/* but does not match any files`**——许多 package（`acp`、`api/gateway`、`api/remotes`、`attachment/*`、`boot/app-boot` 等）export `./src/*`（dev convenience，让 consumer import source）但 published package 无 src 文件（src 不在 `files`）。
- **`pkg.exports["./client"].default is ./lib/client.js and is written in CJS, but is interpreted as ESM. Consider using the .cjs extension`**——`api/gateway`、`api/remotes`（client bundle 是 CJS，package `type: "module"` → publint 建议改 `.cjs`）。

非 W20 引入（W20 不动 package.json exports；CB-4 PR #30 的 client bundle CJS 是既有设计）。latent on master。

**决策点**：
- `./src/*`：(a) 从 published `exports` 移除（dev-only 改条件 export OR 删）OR (b) publint config 排除 `./src/*` OR (c) 加 src 到 `files`（不推荐，暴露 src）。需决策。
- `./client` CJS：(a) 改 `./lib/client.cjs` 扩展（+ 同步 `exports`/`files`/tsdown `entryFileNames`）OR (b) publint 豁免。

## Scope

决策 `./src/*` + `./client` CJS 的 publint 处理，实施，验 `pnpm run publint` 绿。CI log: job 101598597835（grep `== FAILED publint` -A15）。先 verify on current master。

## Resolution

`origin/master` `ac3e162d961b8a48c10aad5b750679184f87a0e9` 完整 build 后的实际失败不是 `./src/*`：该诊断属于 publint warning，runner 不以它失败；`./client` 的浏览器 bundle 格式也已有精确豁免。真实失败有三处：`result-cache` 的 `./types` 指向未发布源码；`tool-edit-definition` 与 `tool-revert-edit` 的入口引用两个未列入精确 `files` 清单的 hash chunk。

`result-cache` 的 `./types` 改为已构建的 `lib/types/types.{d.ts,js}` 并发布 JavaScript；两个工具通过 package-local tsdown 配置关闭 code splitting，其 semantic-layer 类型与动态 import 改走包根，semantic-layer 根入口补导出 `invalidateCaches`。完整 rebuild 后 `pnpm run publint` exit 0；`./src/*` warning 保留，继续反映源码平面导出不属于发布载荷。决策详见 [source-plane exports and publint](../../../.agents/notes/implemented/process/2026-09-15-source-plane-exports-and-publint.md)。
