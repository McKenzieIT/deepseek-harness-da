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

## Findings（2026-09-04 T6 session grep）

- **M-1 tokens genuinely undefined in ui-theme src**（grep `packages/client/ui-theme/src/` empty）：`--dsw-alias-content-primary`/`secondary`/`tertiary`/`danger`/`link`、`--dsw-alias-surface-primary`/`secondary`/`active`/`default`/`hover`、`--dsw-alias-border-primary`/`default`/`subtle`、`--dsw-alias-state-warning-primary`/`-surface`。
- **`design-platform.css` DOES define many**（M-1 的「仅 state-error/success/business-primary」描述 stale）：`bg-*`/`border-l1-l4`/`brand-*`/`button-*`/`state-warn-*` 等都定义了。实际缺的是 **content-*/surface-*/border-primary/state-warning-primary 这一批**，不是全部。
- **命名不一致**：`state-warn-primary`/`-secondary`/`-tertiary`/`-label` 已定义（design-platform.css:229-232, 321-324），但 `state-warning-primary`（consumed，e.g. `TableCard.module.css` `.chartWarn`）**未定义**——"warning" vs "warn" 拼写分歧。消费方用 `state-warning-*`，定义方用 `state-warn-*`。
- **fix 方向**（决策点）：
  - (a) 补定义缺失 token（content-*/surface-*/border-primary/state-warning-primary）——值取 JS fallback（如 `content-secondary: #667085`）或设计系统源。**注意：定义后 CSS-var 消费方（`TableCard.module.css` `.chartWarn`/`.kpiNote` 等）会从 inherited/initial 切到定义值——视觉变化，需验。**
  - (b) 命名统一：消费方改用 `state-warn-*`（defined），或定义 `state-warning-*` 作 `state-warn-*` 的 alias。
  - (c) 全 repo grep 一遍 consumed-but-undefined 的 `--dsw-alias-*`（diff consumed vs defined），列全清单再补。

需设计输入（token 值 + 命名）+ 视觉验证，非 quick fix。
