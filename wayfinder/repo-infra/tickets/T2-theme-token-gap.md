# T2 — ui-theme 被 consume 的 --dsw-alias-* token 未定义

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: T7 post-ship review 的 M-1（pre-existing，repo-wide）、2026-09-04 T6 session 确认（grep `ui-theme/src/` 无 `--dsw-alias-content-secondary` / `border-primary` / `content-primary` 定义）

## Question

`packages/client/ui-theme/src/styles/design-platform.css` 只定义了 `--dsw-alias-state-error` / `state-success` / `business-primary`。但 DSH 多处 **consume** `--dsw-alias-content-*` / `surface-*` / `border-primary` / `state-warning-primary`——v1 `TableCard.module.css`（`.kpiNote`/`.card`/`.th`/`.actionBtn`）+ `ui-semantic-layer` + T7 `.chartWarn` + ChartView 的 `readCssColor('--dsw-alias-content-secondary'/'--dsw-alias-border-primary')` 等——这些 token **从未 define** 于 `ui-theme/src/styles/`。

runtime：unset CSS var 解析为 inherited/initial（回退样式，**非崩**）；ChartView 的 `readCssColor` 走 JS fallback（`#667085` 文本 / `rgba(102,112,133,0.25)` grid 等，== 生产当前行为）。所以非崩，但 token 合规是空文（AGENTS.md「无 literal color」满足，但 token 本身没值——`.chartWarn` 的 `var(--dsw-alias-state-warning-primary)` 实际是 unset）。

**怎么修：**
- 在 `design-platform.css`（或合适的 ui-theme 样式文件）补定义：`--dsw-alias-content-primary`/`secondary`、`--dsw-alias-surface-*`、`--dsw-alias-border-primary`、`--dsw-alias-state-warning-primary` 等（grep 全 repo 被 consume 但未 define 的 `--dsw-alias-*`，列全清单）。
- 值：从设计系统取（若有 design token 源）；否则用当前 JS fallback 值（`#667085` 等）作为 token 值（至少 token 有定义，未来可调）。
- 验：`getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-content-secondary')` 不再空；`.chartWarn` 等显正确色。

## Scope

grep 全 repo 被 consume 但未 define 的 `--dsw-alias-*` token，补定义到 `ui-theme/src/styles/`，验不再空。出 T7/T6 pathspec（theme-infra，repo-wide；非本 PR #7 范围）。
