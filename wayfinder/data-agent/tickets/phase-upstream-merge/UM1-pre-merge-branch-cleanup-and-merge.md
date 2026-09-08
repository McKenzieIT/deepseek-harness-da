# UM1 — 预清分支 + merge worktree + git merge upstream/master

**Type**: task
**Phase**: upstream-merge
**Status**: in-progress (merge staged 102 conflicts; pnpm install pending; resolution = UM2–UM9)
**Assignee**: unclaimed
**Blocked by**: 无（入口）
**Blocks**: UM2, UM3, UM9（冲突解决需先有 staged merge）
**Related**: session-prompt [upstream-merge-2026-09-07-session-prompt](../../prompts/upstream-merge-2026-09-07-session-prompt.md)；预分析 `.tmp/audit/d5-upstream-impact.md`

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

## Merge outcome (2026-09-07)

**Setup DONE，conflicts staged 未 commit**：worktree `../dsh-upstream-merge` on `upstream/merge-2026-09-07` from `origin/master` `65bf3cddc9`（含 PR #103 r1-rescue + #87 计划）；`upstream/master` `d347e70`（未推进，UM 票引证当前）；`git merge upstream/master` → **102 conflicts**（83 UU + 18 UD + 1 AU），mid-merge（`git merge --abort` 可取消）。

**初筛分桶**（按 UM）：UM2 CI 2 · UM3 session id-less **0 textual（auto-merged→semantic review）** · UM4 apiproxy+remotes+runtime 22 · UM5 sqlite 0（fork-only 未触，手动删）· UM6 docs 44 · UM7 packages .ts 14 · UM8 config+scripts 21 · UM9 ptc 0（auto-merged）。跨 UM 重叠：`api/remotes/package.json`(UM4∩UM8)、`bundle/web-app/package.json`(UM7∩UM8)、`client/connection/fixture.ts`(UM4∩UM7)。

**前置审计**：✅ PR #87 计划在 master（`506a922c`→`65bf3cddc9`）/ a-series 收尾（translation-pairing #102 land，worktree 全清）/ 预清分支（残留仅 `dsh-G1` grilling 非阻塞；R1/repo-infra-matt-pocock/cb1b/r1-rescue 均清）。❌ **`pnpm install && pnpm run build:official` 未跑**（resolution 前置：translation-pairing driver + typecheck 需 lib/）。

**Note**：本批 UM 票 + map 更新已 `git add` stage 在 merge worktree；**merge commit（post-resolution）须含这些 doc 更新**（explicit-path stage 含 `wayfinder/data-agent/{tickets/phase-upstream-merge/,map.md}`），resolution session 勿 `git checkout --` 这些文件。

## Resolution
（merge commit 落地后填：merge sha + final 冲突解决数 + UM2–UM9 收尾状态）
