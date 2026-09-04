# Agent Note: 并行 session 的分支与 worktree 隔离

Status: proposed

[English](2026-09-04-parallel-session-branching-policy.md) | 中文

## Problem

[dsh-data-agent PR 工作流](../../../../docs/da-pr-workflow.md)要求任何新包、新 seam、新功能或 bug fix 都走 `feat/<ticket-id>-<slug>` 或 `fix/<ticket-id>-<slug>` 分支加 PR,只允许纯 Wayfinder 文档和实验 probe 脚本直推 `main`。[栈上 PR 评审的响应](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md)进一步要求每个 PR 分支用独立 worktree:"parallel fixes never share a checkout."

自 2026-09-03 起,并行 session 工作两条都没遵循。`git worktree list` 显示只有一个 `master` checkout;`git for-each-ref` 显示 2026-08-26 之后没有任何 `feat/*` 或 `fix/*` 分支;`git log --since=2026-09-01` 把几十个触及 `packages/*/src` 的 `feat()` / `fix()` 提交直接落在 `master` 上。`master` 工作区同时挂着五条交错的工作流(ui-present-table、十二个未入库的 simplification 提案、新 eval 用例、新 Wayfinder ticket、一个 probe 脚本),reflog 记录了对该共享 tip 的 `commit (amend)` 与 `reset`,`master` 领先 `origin/master` 一个提交,还有一个遗留 stash。

三个缺口共同导致。第一,`wayfinder/*/prompts/` 下启动并行工作的 session 派发 prompt 以 "commit" 结尾,从不点名分支或 worktree,成文的分支模型根本到不了要执行它的 session。第二,harness 不会补这个缺口:[Durable Agent Teams](../../implemented/feature/2026-08-05-agent-teams.md)声明"Worktree isolation is not a harness runtime behavior",并拒绝了自动创建隔离 worktree,把分支与 worktree 的设置留给 prompt 或 deployment。第三,没有门禁拒绝落在 `master` 上的 `feat` 或 `fix` 提交,规则只是倡导。prompt 里的"并行"含义也变了:并行分支变成了同一分支上的并行 subagent,靠文件不重叠避碰,而不是靠隔离。

## Proposal

让 session prompt 成为执行点,因为 harness 把隔离责任交给了它。每个 next-session prompt 把分支契约作为第一块实例化;每个并行 ticket 拿自己的 worktree 和分支;直推 `main` 的白名单收窄并自检;Lead session 作为集成边界,上一批落地后才开下一批。

### Session-prompt 分支契约

每个 `wayfinder/*/prompts/*-session-prompt.md` 以这块开头,按 session 的 ticket 实例化:

```sh
git worktree add ../dsh-<ticket-id> -b <type>/<ticket-id>-<slug> master
cd ../dsh-<ticket-id>
node scripts/install-lefthook.mjs   # regenerate worktree-local hooks
```

- worktree:`../dsh-<ticket-id>`
- 分支:`<type>/<ticket-id>-<slug>`,`type` ∈ `feat` / `fix` / `refactor` / `upstream`
- 基线:`master` 在指定 commit
- 不得向 `master` 提交。所有工作留在本分支。
- 收尾:`gh pr create`(依赖链用 `gh stack link`),通过 [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) 后才合并。

规范模板见 [`wayfinder/_templates/session-prompt.md`](../../../../wayfinder/_templates/session-prompt.md)。[dsh-data-agent PR 工作流](../../../../docs/da-pr-workflow.md)把该模板指定为每个 session prompt 必须实例化的契约。

### 每个并行 ticket 一个 worktree 一个分支

拥有一个 ticket 的并行 session 或 subagent 在自己的 worktree、自己的 `feat/` 或 `fix/` 分支上工作。[栈上 PR 评审的响应](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md)已经要求这一点,[Landing an official GitHub PR stack](../../../skills/dsh-merging-stacked-prs/SKILL.md)要求栈用专用 worktree。依赖链走原生 `gh stack`,不手搓逐 PR 合并。session 内的并行 subagent 要么各自用 Agent 工具的 worktree 隔离加子分支,要么序列化提交;文件不重叠不能替代隔离。

### 直推 main 白名单

只有当某提交的 diff 不触及 `packages/*/src`,且仅由 Wayfinder map、ticket、research 文档,或实验 probe 脚本加其 audit-log 条目组成时,才可不分支直推 `master`。其余——包括对 `packages/`、`apps/`、`examples/`、`native/`、`python/`、`scripts/` 的 `feat`、`fix`、`refactor`——一律走分支加 PR。session prompt 把它作为 commit 前的自检清单,让作者在 push 前检查 diff 面,而不是提交类型。

### Lead 作为集成边界

聚合并行工作的 Lead session 在 push 前检查最终 diff 并跑相关检查,符合 [Agent Teams 共享 checkout 边界](../../implemented/feature/2026-08-05-agent-teams.md):"The final diff and tests remain the Lead's integration boundary." 上一批的 PR 合并或显式放弃之前,不开下一并行批,工作不会在一条 tip 上交错堆积。

## Alternatives considered

### 为什么不在 harness 里自动建 worktree?

[Agent Teams 笔记](../../implemented/feature/2026-08-05-agent-teams.md)已经拒绝过:worktree 创建、分支命名、merge 策略、ignored file、构建产物、cleanup 都是 deployment 选择,自动隔离会改变既有 subagent 和 sandbox 暴露的 same-world 契约。为修一个 prompt 层的疏漏去重开一个已落地的架构边界,不如在 prompt 层修。

### 为什么不靠文件不重叠做并行 subagent?

`next-session-parallel-4-tickets.md` prompt 已经警告"注意避免写冲突",并在两个 subagent 碰同一文件时退化为序列化。那是运气,不是隔离:Agent Teams 笔记录明 Bash、formatter、generator、外部写入都绕过文件系统 stale-version 拒绝。两个 session 自以为文件不重叠,仍共享一个 index 和一条 tip,一个 `amend` 或 `reset` 就改写了对方的提交。

### 为什么不用一个全局锁把所有 session 串行化?

锁能消写竞争,但丢掉 Wayfinder map 本要利用的并行性,也不改善可评审性:`master` 上一长串提交仍无法按 ticket 回退或评审。分支天然给每-ticket 评审与回退;锁两者都不给。

### 为什么不只靠门禁,不要 prompt 契约?

拒绝 `feat`/`fix` 落 `master` 的 pre-push 门禁列在 [Acceptance criteria](#acceptance-criteria) 里,是必要的,但事后再拒会逼返工。prompt 契约把分支作为第一步,门禁确认意图而非重定向已完成的工作。两者都要;门禁是兜底,不是主力。

### 为什么不维持现状、每批清理 master?

事后清理无法在关注点已交错到一条 tip 上时恢复独立评审边界;reflog 的 `amend` 与 `reset` 已经显示共享历史被改写。每-ticket 分支让清理是结构性的,不是取证式的。

## Acceptance criteria

- `git worktree list` 为每个在飞并行 ticket 显示一个 worktree;`master` 主 checkout 在批次之间是干净的。
- `git for-each-ref refs/heads` 为每个在飞 ticket 显示一个 `feat/` 或 `fix/` 分支;`git log master` 里不再出现触及 `packages/*/src` 的 `feat()` 或 `fix()` 提交。
- 每个新增的 `wayfinder/*/prompts/*-session-prompt.md` 以分支契约块开头并链接模板。
- `pnpm run verify-agent-note-format` 对本策略下新增的任何 note 不报违规。
- pre-push 门禁拒绝落在 `master` 上、diff 触及 `packages/*/src` 的 `feat` 或 `fix` 提交,对应根 [AGENTS.md](../../../../AGENTS.md) 把机械可检不变量作为顶层 gate 执行的规则。
- Lead 在 push 前跑 `pnpm run typecheck` 与相关 surface 测试;上一批有 open PR 时不开下一并行批。

## Risks

- 每 ticket 一个 worktree 增加每次 session 的 setup 成本与磁盘占用;仓库已支持 worktree-local Lefthook 钩子与 Git 2.26+ worktree 配置,成本是 setup 命令,不是新基建。
- 由 ticket id 派生的分支名可能因两个 session 取同 slug 而撞;契约的 `<type>/<ticket-id>-<slug>` 形式用 ticket id 做消歧。
- 直推 `main` 白名单依赖检查 diff 面,session 可能误读;pre-push 门禁是兜底,抓住被当成文档的 `packages/*/src` 触及。
- session 内 subagent 经 Agent 工具的 worktree 需要各自子分支或序列化提交;否则并行 subagent 仍共享 session 分支,在小尺度上重演同一问题。
- 现有十二个 `2026-09-03` simplification 草稿今天过不了 `verify-agent-note-format`;本 note 不修它们,在各自补上真实的 `## Alternatives considered` 或被 reject 之前,门禁保持红。
