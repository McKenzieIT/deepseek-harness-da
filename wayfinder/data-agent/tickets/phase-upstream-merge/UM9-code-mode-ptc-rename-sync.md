# UM9 — code-mode → ptc 重命名同步

**Type**: chore
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM1
**Related**: upstream `3ca9c7d rename code-mode to ptc (PTC mode), except session-persistent vocabulary`、`0cdcc9c feat(presets): omit workflow from PTC mode`

## 背景

upstream `3ca9c7d` 重命名 code-mode → ptc（PTC mode），**except session-persistent vocabulary**。fork grep：code-mode 引用几乎全在 `.agents/notes/archived/*`（历史归档，可接受）；fork 已在 `apps/cli/config/agent-presets/code/preset.yml`、`packages/client/ui-agent-preset/src/client/locales.ts`、wayfinder docs 用 ptc。

## Scope

1. grep LIVE `.ts`（非 archived notes）用 `code-mode`/`codemode` 作运行时 token——若有，sync 到 ptc（除 session-persistent vocab 外）。
2. archived notes 的 code-mode 引用可接受（历史记录，不动）。
3. 保 `apps/cli/config/agent-presets/code/preset.yml`（preset 目录名 `code` 非 code-mode token——核确认）。
4. 跑 ptc 相关 snapshot 测试核无 regression（upstream `test(snapshot): refresh Python PTC fixture` 等）。

## Merge outcome (2026-09-07)

**0 textual conflict**——`packages/core/tools/src/ptc.ts` **auto-merged**（upstream 的 code-mode→ptc 重命名干净并入）。LIVE code-mode token grep 仍须跑（archived notes 的 code-mode 可接受）。ptc snapshot 测试跑核无 regression。

## Resolution (2026-09-08)

`packages/core/tools/src/ptc.ts` auto-merged (upstream code-mode→ptc rename clean). LIVE `ptc-dispatch-log` token consistent across upstream + merged result — no rename, no sync needed. archived-notes `code-mode` references acceptable (historical, untouched).
