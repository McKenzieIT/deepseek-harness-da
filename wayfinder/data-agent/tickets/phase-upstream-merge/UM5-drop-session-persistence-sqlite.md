# UM5 — 丢 session-persistence-sqlite（对齐 handle-based jsonl）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM1, UM3
**Related**: upstream `4553c9d refactor(session)!: remove SQLite persistence backend`、`bec6805 refactor(session-persistence)!: handle-based seam with a lifecycle-owned write path`、`fcd109d feat(storage): version read compatibility and backup-and-skip salvage`、`feat(session-persistence-jsonl): cross-process write-ownership lease`

## 背景

upstream `4553c9d` 删 SQLite 后端 → handle-based jsonl + 跨进程写所有权租约 + 版本读兼容 + backup-and-skip salvage。`packages/session` ls-tree 确认 upstream 无 `session-persistence-sqlite`，fork 有（fork-only 包）。upstream 新增 `session-format-catalog`/`session-format-v0-to-v1`/`session-format-v1-to-v2`/`session-format`/`session-log-deepseek`/`session-turn-outline`（fork 无，干净引入）。

## Scope

1. 核 data-agent 是否硬依赖 SQLite 持久化（grep data-agent 代码 + 现有用法）。若无 → 接受 upstream 删除 `packages/session/session-persistence-sqlite`。
2. 若有硬依赖 → 迁移到 handle-based jsonl（对齐 upstream `session-persistence-jsonl` + lease），不在 fork 侧保留 SQLite（保上游升级路径）。
3. 接受 upstream 6 个新 session-format 包（干净引入）。
4. knip.json 清 `session-persistence-sqlite` 死指针（UM8 接力）。

## Merge outcome (2026-09-07)

**0 textual conflict**——`session-persistence-sqlite` 是 fork-only 包，upstream 未触（merge 没碰它）。确认：须**手动删**（`git rm -r packages/session/session-persistence-sqlite`，对齐 upstream handle-based jsonl 方向），非 merge 自动解。data-agent SQLite 硬依赖仍须 grep 核（无则直接删；有则迁 jsonl+handle）。

### Cascade update（pnpm-install unblock 发现）
`session-persistence-sqlite` 临时 restore（fork's，upstream 删了）；UM5 删 + 迁 `python/sdk-runtime` dep→jsonl。+ `python/sdk-runtime` 的 `agent-spine-demo`/`jsonrpc-demo` deps（UM5/7 sort）。⚠️ **fs-ext native build fail**（node 25 + fs-ext 2.1.1 V8 API 不兼容）→ `session-persistence-jsonl` 的 `flock` lease（`lease.ts:34`）runtime 缺 native → UM10 test 关切（须 node 22/26 或修 fs-ext；非 merge issue，local env）。

## Resolution (2026-09-08)

`session-persistence-sqlite` `git rm`'d (75 files; no external consumer). `python/sdk-runtime` stale `dsh-session-persistence-sqlite` dep removed — was blocking `pnpm install` (searched `packages/` not repo root initially). examples deps sorted (jq). fs-ext native build fail (node 25 + fs-ext 2.1.1 V8 API) → UM10 (local env, non-merge).
