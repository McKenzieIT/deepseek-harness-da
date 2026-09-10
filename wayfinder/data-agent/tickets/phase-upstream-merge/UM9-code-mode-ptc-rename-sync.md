# UM9 — code-mode → ptc 重命名同步

**Type**: chore
**Phase**: upstream-merge
**Status**: archived (2026-09-09 triage)
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

## Resolution

**[2026-09-09 triage] → Status: archived (resolved-by-upstream).** `3ca9c7d`（rename code-mode→ptc，except session-persistent vocab）+ `0cdcc9c`（omit workflow from PTC mode）均 ancestor of synced-base HEAD；`packages/core/tools/src/ptc.ts` exists；仅 3 residual `code-mode` hits in LIVE `.ts`，全是 upstream intentional exceptions（`ptc.ts:565` plugin ID `'tools-code-mode'`、`index.ts:324`+`lib/types/index.d.ts:214` doc comments）；fork preset path已是 `ptc`/`data-agent` 名；residual PTC snapshot-test non-regression verify folds into UM10。详 `.tmp/next-5-triage.md`。

---

### (original pre-triage)
（待落地后填：LIVE code-mode token grep 结果 + 同步的文件）
