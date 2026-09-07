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

## Resolution
（待落地后填：SQLite 硬依赖核查结果 + 持久化迁移落点）
