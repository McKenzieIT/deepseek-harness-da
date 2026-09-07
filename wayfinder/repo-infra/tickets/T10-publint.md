# T10 — publint gate 红（./src/* 无文件 + ./client CJS/ESM 扩展）

**Type**: task（含决策点）
**Phase**: post-discovery
**Status**: open
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
