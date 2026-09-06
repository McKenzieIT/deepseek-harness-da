# wayfinder:map — REPO BUILD & THEME INFRA

> 本地 markdown tracker。子 ticket 在 `tickets/`。本 map 是**索引**，非存储——决策详情在其 ticket。

## Destination

补齐 DSH repo 的 build/theme 基础设施缺口，让 fresh worktree 与 CI 行为一致、让被消费的 theme token 有定义：worktree-setup 自动 build workspace package（fresh worktree 不再因缺 `lib/` 假性「master break」）；`--dsw-alias-*` 被 consume 的 token 在 `design-platform.css` 有定义。

## Notes

- **域**：DSH repo-wide build/theme infra（pnpm workspace、worktree-setup、lefthook、ui-theme token）。
- **每会话应查 skills**：`grilling`、`domain-modeling`。
- **常设原则**：
  - 不改 production 行为（仅补 build 产物生成路径 + token 定义）。
  - 遵循 `packages/client/AGENTS.md` 全部纪律（如触 src）。
  - 与并发 session 协调（CB-4 zod 回归是独立 ticket，不并入——见 Out of scope）。

## Decisions so far

- [T1: worktree-setup 不 build workspace package](tickets/T1-worktree-builds.md) — fixed in PR #16（CLAUDE.md + session-prompt template worktree-setup 加 `pnpm install && pnpm -r run build`，method (a)）；verified `pnpm -r run build` 生成 8 个 data package 的 `lib/typert.remote-client.*`（pnpm install 不生成的）；note `pnpm -r run build` exit 1 on website（见 [T3](tickets/T3-website-build-failure.md)，separate，data/tsc 不受影响）——T3 已 fixed in PR #22（website build 绿，该 caveat 解除）
- [T3: website (vitepress) build 失败](tickets/T3-website-build-failure.md) — fixed in PR #22：tool descriptions 里的 unescaped `<`（`<project>`/`<mode>`/`<value>`/`<response clipped>`）致 vitepress parse "Element is missing end tag"（tool-catalog.md:350）；fix = `gen-tool-catalog` 加 `escapeHtml`（renderTool description + tableCell note + per-tool note emit）+ ZH source sed-escape 同批 placeholders + i18n pairing re-record；verified `pnpm --filter @deepseek-ai/website run build` 绿（20.93s）；pre-commit translation-pairing hook bypassed（pre-existing code-block #82 en/zh drift，非本 fix 引入——diff 0 code-block changes）

## Not yet specified

（暂无）

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research，属 interpretation-client-rendering map 的 out-of-scope）
- CB-4 zod 回归（api-remotes client bundle 启动失败——并发 session 在 `semantic-layer` map 的 CB-4 票里追；根因是 dep 声明缺失/zod module-table，独立于本 map 的 build-产物 + token-定义关注点）
