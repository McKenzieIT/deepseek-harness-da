# Session Prompt — upstream merge (deepseek-ai/deepseek-harness → fork)

> 从 `wayfinder/_templates/session-prompt.md` 实例化。upstream（`deepseek-ai/deepseek-harness`）自 fork 点（`141eb6f`）已推进 **2270 commits / 8525 files**。fork 从未 merge 过 upstream（merge-base 仍是 `141eb6f`）。本 session 做 upstream merge + 冲突解决 + **确保 GA-FORK-CI 不 regress**（6/7 绿）。

## 1. 环境/分支契约

```sh
git worktree add ../dsh-upstream-merge -b upstream/merge-2026-09-07 master
cd ../dsh-upstream-merge
pnpm install && pnpm -r run build
git fetch upstream
```

- worktree: `../dsh-upstream-merge`
- 分支: `upstream/merge-2026-09-07`（type=upstream）
- 基线: `master @ <sha>`（启动前 `git fetch origin && git rev-parse origin/master`）
- **禁止直推 master。** 所有提交落在本分支。

## 2. 预分析（已完成，2026-09-07）

### upstream 规模
- **2270 commits / 8525 files**（2539 新增 / 1266 删除 / 4385 修改 / 334 重命名）。upstream 大幅演进（新 tag: dsh-v0.1.2-alpha.5 / rc.1 / v0.1.3-alpha.1）。

### 冲突候选（upstream + fork 都改的，排除 wayfinder/.agents/eval）：138 个
按目录：
- docs/subsystems (21)、packages/host (13)、packages/client (12)、packages/core (9)、packages/subagent (8)、packages/api/bundle/credentials (各 5)、.github/workflows (4)、extensions/shell (各 3)、code-runtime/boot (各 2)、typert (1)、AGENTS.md (1)。

### 关键重叠（高风险）
- **CI**（`.github/workflows/ci.yml` + `issue-policy.yml` + `issue-lifecycle.yml`）：fork 的 #48 删了 6 个死 master-push job + sandbox macos 腿、#52 禁用了 issue-policy/lifecycle（`if: github.repository_owner == 'deepseek-ai'`）。**upstream 仍保留这些 → merge 会带回 upstream 版本，重新打破 GA-FORK-CI**。merge 后必须重新落地 #48/#52。⚠️ upstream 2270 commits 可能已重构 CI——先看 upstream 新 CI 结构，再决定如何重新落地 fork 的"缺资源 job 跳过"逻辑（可能 upstream 已用 `vars.*` 解决了部分）。
- **`docs/subsystems/*`**：fork 加了 `data-agent.{md,zh.md,i18n.yaml}`；upstream 改了其他 subsystem 文档 → 保留 fork 的 data-agent 文档 + 接受 upstream 的其他改动。
- **`packages/host/apiproxy` + `packages/core/*` + `packages/client/*` 等 68 .ts**：fork 的修改（id-less 簇 [session:336 + assembler:71,81 + ui-conv:240 + ui-traj:223]、apiproxy presetSwitches、scopeId 休眠管线、ctx.effect 包裹等）vs upstream。**逐个评估**：upstream 2270 commits 可能已修了根因（如 id-less callId——upstream 可能已要求 callId 非空，则 fork 的容忍改动可丢弃，审计 A5 自动解决）。优先用 additive 方式（fork 的改动若能挪到 data-agent 自有包更好）。
- **`AGENTS.md` / `package.json` / `tsconfig.*` / `knip.json` / `lefthook.yml`**：fork 的配置分歧 vs upstream → 逐个评估（d5 的 UNNECESSARY-DIVERGENCE 12 churn 文件可顺势回退）。

### 本地分支盘点（12 个，merge 前清理）
- **6 已 merge 未清理**（可删）：`chore/repo-infra-matt-pocock-setup`、`docs/wayfinder-repo-infra-bookkeeping`、`fix/T2-theme-token-gap`、`fix/T4-tool-catalog-zh-sync`、`fix/repo-infra-T4-scope-fix`、`research/R1-exec-grader-papers`（4 个在活跃 worktree 里——T2/T4/R1/repo-infra——并行 session 的，**先确认其 session 结束再删 worktree**）。
- **3 在跑（并行 session，merge 前确认不冲突）**：`fix/T7-eval-runner-service-build`（T7 GA-FORK-CI built-pkg-invariants，与 fork #68 重叠）、`fix/cb1b-pwsh-pty-evaluation`（CB-5，未 PR，ahead 2）、`fix/ga-audit1-followup-upm-2-9-10-card-helpers`（upm cards 重生成）。
- **3 弃（无 worktree，陈旧，可删）**：`docs/cleanup-map-update`（2026-09-06）、`fix/legacy-empty-callid`（2026-08-26）、`fix/legacy-empty-callid-pr`（2026-09-06，empty-callId 容忍——与审计 A5 id-less 簇相关；若 A5 在 merge 中解决，这俩可删）。

## 3. 任务正文

### Goal: merge upstream/master + 解决冲突 + GA-FORK-CI 不 regress

1. **预清理分支**：删 3 弃的 + 2 已 merge 不在 worktree 的（`docs/cleanup-map-update`、`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`、`docs/wayfinder-repo-infra-bookkeeping`、`fix/repo-infra-T4-scope-fix`）。4 个在活跃 worktree 的已-merge 分支，先确认并行 session 结束再删 worktree + 分支。
2. **merge**：`git merge upstream/master`（在 `upstream/merge-2026-09-07` 分支）。预期 138 个冲突。
3. **分类解决冲突**（按 d5 的 additive-over-mutation 原则）：
   - **CI**：merge 后立即重新落地 #48（删 serial-* 等 6 死 job + sandbox macos 腿）+ #52（issue-policy/lifecycle `if: github.repository_owner`）。先看 upstream 新 CI 结构。
   - **id-less 簇**（A5）：看 upstream 是否已要求 callId 非空 → 若是，fork 的容忍改动丢弃（A5 自动解决）；若否，保留 fork 改动（后续 A5 铸 callId + 回退簇）。
   - **docs/subsystems/***：保留 fork 的 data-agent 文档 + 接受 upstream 其他。
   - **packages/host/apiproxy + core/* + client/* 等 68 .ts**：逐个评估（upstream 是否已修根因 / fork 改动是否仍需）。优先 additive。
   - **AGENTS.md / package.json / tsconfig.* / knip.json / lefthook.yml**：逐个评估，UNNECESSARY-DIVERGENCE 顺势回退。
4. **verify**：`pnpm run typecheck` + `pnpm run lint` + `pnpm run check:ci:static` + `check:ci:consumers`（确认 GA-FORK-CI 6/7 仍绿——translation-pairing 本就红，不 regress 即可）+ 关键 surface 测试（data-agent: `packages/data/*` + `packages/client/ui-*`）。
5. **PR + merge**：`gh pr create`（base master, head `upstream/merge-2026-09-07`）。大 PR（2270 commits），review 重点在冲突解决 + GA-FORK-CI 不 regress。

### 风险
- **CI regress**：upstream 带回 serial-* + issue-mgmt → merge 后 GA-FORK-CI 重新变红。**必须 merge 后立即重新落地 #48/#52**。
- **id-less 簇**（A5）：upstream 可能已改 session/assembler 的 callId 处理 → 重新评估 fork 的容忍改动。
- **大 diff**：2270 commits / 8525 files → review 难。分阶段：先 merge 到分支，跑 verify，确认绿后再 PR。

## 4. 收尾（Lead integration boundary）

- [ ] `pnpm run typecheck` + `lint` 绿
- [ ] `check:ci:static` + `check:ci:consumers` 不 regress（GA-FORK-CI 6/7 仍绿）
- [ ] `gh pr create`，通过 dsh-pre-push-checks
- [ ] merge 后清理已 merge 的本地分支 + 决定 3 弃的（legacy-empty-callid×2 与 A5 相关）

## 5. 上下文索引

- fork 的 upstream 债：审计 d5（`.tmp/audit/d5-upstream-impact.md`）—— 68 .ts 分桶（45 legit-extension / 8 coupled / 12 churn / 3 logic-change [id-less 簇]）。
- fork 的 CI 改动：PR #48（删 6 死 job + sandbox macos）+ #52（issue-mgmt 禁用）。
- GA-FORK-CI 现状：[map § GA-FORK-CI](../map.md#ga-fork-ci-node-24-meta-gates-2026-09-07)（6/7 绿 + 6 解除跳过）。
- 审计 26 action：`.tmp/audit/ACTION-LIST.json`（A5 id-less 簇 / A6 apiproxy 与本 merge 相关）。
- 经验：CLAUDE.md "并行 session 分支纪律" + "提交与引证纪律"（stage 显式路径、绝不 `git add -A`、file:line 落笔前重导）+ "Workflow / 大规模审计经验"（file-based handoff 防 truncation）。
