# UM11 — PR + merge + 后清理分支

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM10 + UM12（Phase C：验证 + GA-FORK-CI 后 PR）
**Related**: session-prompt 收尾（Lead integration boundary）；CLAUDE.md "并行 session 分支纪律" + "提交与引证纪律"

## Findings (2026-09-08 reframe)

见 [UM-flow-2026-09-08](UM-flow-2026-09-08.md)（Phase C）。原 UM11 框的是"PR d347e703 merge"，但调查发现 merge 落后 upstream 449 commit + build:official 根 entry 是 upstream 共享 breakage（re-sync 修不了）。**本票 PR 的是 synced-to-latest（UM14）+ data-agent 改造（R-DA，UM-ADAPT 判定）+ build-green（UM16）+ cordis regen 之后的分支**，非只 d347e703 merge。下方 Scope 是旧框（d347e703 merge，2270 commits），**以本 Findings + flow doc 为准**——re-sync 后 Scope 会更新为 re-sync 范围（`d347e703`→`c389f96bf3`，+449）+ seam 3/4 break 迁移 + workspace-files 采纳 + adaptive 改造 + build-green 证据。

## Scope

1. `gh pr create`（base master, head `upstream/merge-2026-09-07`）。大 PR（2270 commits）——review focus 在**冲突解决 + GA-FORK-CI 非回归**，非逐 commit。
2. 过 [dsh-pre-push-checks](../../../../.agents/skills/dsh-pre-push-checks/SKILL.md)。
3. PR body 含：merge 范围（base `141eb6f`→`d347e70`）、冲突分类解决摘要（UM2–UM9）、GA-FORK-CI 非回归证据（UM10）、violating 票据 addendum 指针。
4. merge 后**清已-merge 本地分支**。
5. **删 3 弃分支**：`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`（tied to A5，UM3 解决→删）、`docs/cleanup-map-update`。
6. worktree `../dsh-upstream-merge` 处置（keep/remove 视后续）。

## Resolution
（待落地后填：PR #N、merge sha、清理的分支清单）
