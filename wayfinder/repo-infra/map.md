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

（暂无——首 session 开 T1 + T2，2026-09-04）

## Not yet specified

（暂无）

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research，属 interpretation-client-rendering map 的 out-of-scope）
- CB-4 zod 回归（api-remotes client bundle 启动失败——并发 session 在 `semantic-layer` map 的 CB-4 票里追；根因是 dep 声明缺失/zod module-table，独立于本 map 的 build-产物 + token-定义关注点）
