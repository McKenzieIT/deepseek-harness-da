# Session Prompt 模板(并行 session 必填)

> 每个 `wayfinder/*/prompts/*-session-prompt.md` 从本模板实例化。根因与完整方案见 [Per-session branch and worktree isolation for parallel work](../../.agents/notes/proposed/process/2026-09-04-parallel-session-branching-policy.md),分支模型见 [dsh-data-agent PR 工作流](../../docs/da-pr-workflow.md)。

## 1. 环境/分支契约(session 启动第一步,必填)

```sh
git worktree add ../dsh-<ticket-id> -b <type>/<ticket-id>-<slug> master
cd ../dsh-<ticket-id>
pnpm install                       # 装 deps + 跑 lefthook postinstall（生成 worktree-local hooks；fresh worktree 无 node_modules，必跑）
pnpm -r run build                  # build 全 workspace package → 生成 lib/（fresh worktree 否则缺 built lib/，致 aggregate tsc + bundle types-build 假性「master break」——见 wayfinder/repo-infra/tickets/T1-worktree-builds.md）
```

- worktree:`../dsh-<ticket-id>`
- 分支:`<type>/<ticket-id>-<slug>`(`type` ∈ `feat` | `fix` | `refactor` | `upstream`)
- 基线:`master @ <sha>`
- **禁止直推 master。** 所有提交落在本分支。

## 2. 直推 master 白名单(commit 前自检)

只有同时满足才可直推 master:

- [ ] diff 不触及 `packages/*/src`、`apps/`、`examples/`、`native/`、`python/`、`scripts/`
- [ ] 仅 `wayfinder/` 文档(map / ticket / research)或实验 probe 脚本 + audit-log 条目

否则必须走分支 + PR。

## 3. 任务正文

<!-- 从 wayfinder/<effort>/map.md 与相关 ticket 填入本 session 的目标、阶段、行动项、验收。 -->

## 4. 收尾(Lead integration boundary)

- [ ] `pnpm run typecheck` 绿
- [ ] 相关 surface 测试绿(行为改 `test:coverage` / snapshot;模型改 snapshot;文档改 `doc-sync`)
- [ ] `gh pr create`(依赖链用 `gh stack link`),通过 [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md)
- [ ] **下一并行批不得在本批 PR 未 merge / 未 abandon 前启动。**
