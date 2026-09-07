# T2 — ui-theme 被 consume 的 --dsw-alias-* token 未定义

**Type**: task
**Phase**: post-discovery
**Branch**: fix/T2-theme-token-gap
**Status**: in-progress (claimed 2026-09-07 — grilling; impl worktree deferred to post-decision)
**Assignee**: claimed 2026-09-07 (grilling session)
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

## Findings（2026-09-07 upstream-divergence research）

详见 [research/T2-upstream-design-system-divergence.md](../research/T2-upstream-design-system-divergence.md)（primary sources: 上游 commit `8ffdee4fe5`、`ModelsSection.module.css:433-438` 注释、`design-platform.css:157-210/250-296`）。

**fork vs upstream 关键结论：**

- 设计系统源 = 上游 `design-platform.css` 的 `--dsw-alias-*: var(--dsw-static-*)` 模式（light+dark 块），上游 ui-theme README 文档化。无 tokens.json/figma。
- fork 落后上游 1 commit（`8ffdee4fe5` 新增 `--dsw-alias-link` + markdown-inline-code tweak），fork 缺 `--dsw-alias-link`。
- fork 的「缺失 token」分 3 类：
  - **Cat 1 上游既有债**（consumed+undefined 上游，fork 继承）：`border-subtle`/`text-primary`/`text-tertiary`（上游 ModelsSection 注释自认 undefined）、`fill-tsp-secondary`/`fill-tertiary`/`fill-l2`/`separator-primary`（上游有 consumer 无 def）。上游 stance = 留 undefined + `var(token, literal)` fallback。fork consumer 多无 fallback（更糟）。
  - **Cat 2 fork 自造非 canonical 名**（上游零存在，平行上游 canonical 族）：`content-*`（≈上游 `label-*`）、`content-link`（≈上游 `link`）、`surface-*`（≈上游 `bg-base`/`bg-layer-*`）、`border-primary/default/focus`（≈上游 `border-l1..l4`）、`state-warning-*`（≈上游 `state-warn-*`）、`state-info-*`（无上游对应）。consumer 全在 fork-added 包（ui-semantic-layer、ui-present-table）。
  - **Cat 3**：拉上游 `8ffdee4fe5` 吸收 `--dsw-alias-link`。
- **Q2 命名**：`state-warn` 是上游 canonical（23:1 consumer + 8 def + 0 warning def）。fork 的 `state-warning` 是偏离 → align 到 `state-warn`。
- **Q1 values**：对 Cat 2，决策不是「define」而是 align-to-upstream-canonical / alias / define-net-new。对 Cat 1，follow-upstream-undefined-stance vs define-locally。
