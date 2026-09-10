# Issue tracker: GitHub Fork

English | [中文](issue-tracker.zh.md)

Data Agent 的 issue 与 spec 记录在 `McKenzieIT/deepseek-harness-da` 的 GitHub Issues 中。使用 `gh` CLI 操作；不得把 Fork 内部工作项创建到 `deepseek-ai/deepseek-harness` upstream 仓库。

## Conventions

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，同时获取标签；需要结构化数据时使用 `--json` 与 `--jq`。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments`，按需增加 `--label` 与 `--state`。
- **评论 issue**：`gh issue comment <number> --body "..."`。
- **增删标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`。
- **关闭 issue**：`gh issue close <number> --comment "..."`。

在仓库内运行命令时，由 `origin` 自动解析到 Fork；涉及写操作时先确认目标为 `McKenzieIT/deepseek-harness-da`。

## Pull requests as a triage surface

**PRs as a request surface: no.** 如需把外部 PR 纳入分诊队列，可将此标志改为 `yes`。

当该标志为 `yes` 时，PR 使用同一套标签与状态，并通过 `gh pr` 等价命令操作。GitHub 的 issue 与 PR 共用编号空间；遇到裸 `#42` 时，先用 `gh pr view 42` 判断，再回退到 `gh issue view 42`。

## 技能指令映射

当技能要求“publish to the issue tracker”时，在 Fork 中创建 GitHub issue；当技能要求“fetch the relevant ticket”时，运行 `gh issue view <number> --comments`。

## Wayfinding operations

`/wayfinder` 使用一个带 `wayfinder:map` 标签的 issue 作为 map，并把子 issue 作为 ticket。优先使用 GitHub sub-issues 与原生 issue dependencies；不可用时，在 map 任务列表及 ticket 顶部的 `Part of #<map>`、`Blocked by: #<n>` 行中记录关系。领取 ticket 时运行 `gh issue edit <n> --add-assignee @me`；解决时先评论答案，再关闭 issue，并在 map 的 Decisions-so-far 中追加上下文指针。
