# UM1 — 预清分支 + merge worktree + git merge upstream/master

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（入口）
**Blocks**: UM2, UM3, UM9（冲突解决需先有 staged merge）
**Related**: session-prompt [upstream-merge-2026-09-07-session-prompt](../../prompts/upstream-merge-2026-09-07-session-prompt.md)；预分析 [`.tmp/audit/d5-upstream-impact.md`](../../../../.tmp/audit/d5-upstream-impact.md)

## 背景

upstream `deepseek-ai/deepseek-harness` 自 merge-base `141eb6f`（PR #2783, dsh-0.1.0-rc.8）演进 **2270 commits / 8525 files**（2537 A / 3991 D / 4390 M / 336 R），HEAD `d347e70`（dsh-v0.1.3-alpha.1, PR #3554）。fork 741 commits-only。预分析（d5）确认 ~138 个冲突候选。

`git worktree list` 当前另有 `dsh-map-update2`(docs/ga-audit1-followup-map-crs3-parallel-batches) + `dsh-translation-pairing`(fix/ga-fork-ci-translation-pairing) 在跑——契约 step1 分支清单外，须一并协调（不删其 worktree 直到 session 结束）。

## Scope

1. **预清分支**（契约 step1）：
   - 删 3 弃（无 worktree、陈旧）：`docs/cleanup-map-update`、`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`（后两者 tied to A5，UM3 解决后可删）。
   - 删 2 已-merge 不在 worktree 的：`docs/wayfinder-repo-infra-bookkeeping`、`fix/repo-infra-T4-scope-fix`。
   - 4+ 个在活跃 worktree 的已-merge 分支（T2/T4/R1/repo-infra 系列 + `dsh-map-update2`/`dsh-translation-pairing`），**先确认并行 session 结束再删 worktree + 分支**。
2. **建 merge worktree**（契约 step2）：`git worktree add ../dsh-upstream-merge -b upstream/merge-2026-09-07 master`（从最新 master——含本批 UM 票 PR 落地后的 master）；`cd ../dsh-upstream-merge && pnpm install && pnpm run build:official`（fresh worktree 必跑——见 [repo-infra/T1](../../../repo-infra/tickets/T1-worktree-builds.md) + [T13](../../../repo-infra/tickets/T13-eval-runner-service-build-failure.md)）。
3. **fetch + merge**：`git fetch upstream`；`git merge upstream/master`（在 `upstream/merge-2026-09-07`）。预期 ~138 conflicts，staged 不提交，交 UM2–UM9 分类解决。
4. **禁止直推 master**——所有提交落 `upstream/merge-2026-09-07`。

## Resolution
（待 merge session 落地后填：merge worktree sha、staged 冲突数、初筛分桶）
