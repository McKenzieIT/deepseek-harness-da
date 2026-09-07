# T2 research — fork vs upstream 设计系统 & warn/warning 命名分歧

**Ticket**: [T2 — ui-theme 被 consume 的 --dsw-alias-* token 未定义](../tickets/T2-theme-token-gap.md)
**日期**: 2026-09-07
**方法**: 对 `upstream/master`（deepseek-ai/deepseek-harness）与 fork `master`（McKenzieIT/deepseek-harness-da）做 git 考古。primary source 内联标注。

## 问题

当前 fork（dsh-data-agent）怎么处理 design-system / theme token？上游 dsh 怎么做？warn/warning 命名同理。（决定 T2 的 Q1 取值 + Q2 命名。）

## Findings

### 1. 设计系统源 = 上游 `design-platform.css` + `--dsw-static-*` primitive 色阶

- 上游 `packages/client/ui-theme/README.md` 文档化理念："The package also ships the `--dsw-*` token stylesheets"；"Feature plugins consume the current snapshot through `ctx.theme` and read the `--dsw-*` tokens in CSS"；第三方 theme 经 `ctx.theme` override alias token。（source: `upstream/master:packages/client/ui-theme/README.md`）
- alias 层模式（上游定义）：`--dsw-alias-X: var(--dsw-static-<色系>-<档位>)`，分 light（`body {}`）+ dark（`body[data-ds-dark-theme] {}`）两块。（source: `upstream/master:packages/client/ui-theme/src/styles/design-platform.css:157-210, 250-296`）
- `--dsw-static-*` primitive 色阶：neutral-bluish 00→1000、neutral 00→1000、amber/blue/green/red/deepseek 各系。（source: 同文件）
- fork 与上游均无 `tokens.json` / figma 导出 / 外部 design-system spec。`BRAND_GUIDELINES.md`（两者）仅商标/命名。→ T2 ticket 所求「design-system 源」= 上游 design-platform.css 的模式（非独立 spec）。

### 2. fork 在 design-platform.css 上落后上游 1 commit

- `git log master..upstream/master -- packages/client/ui-theme/src/styles/design-platform.css` → `8ffdee4fe5 feat(client): unify clickable-link language with link alias and category glyphs`。
- 该 commit 新增 `--dsw-alias-link: var(--dsw-static-deepseek-500)`（light, :210）/ `var(--dsw-static-deepseek-400)`（dark, :303），并把 `--dsw-alias-markdown-inline-code` 改为 `--dsw-static-neutral-50`（light）/ `--dsw-static-neutral-800`（dark）。（source: `git diff master upstream/master -- design-platform.css`）
- fork 缺 `--dsw-alias-link`。上游 `link` 的 consumer：ui-deliverables、ui-primitives/WebBlock、ui-primitives/markdown/MarkdownText、ui-workflow-run。（source: `git grep 'dsw-alias-link' upstream/master -- '*.css'`）

### 3. fork 的「缺失 token」分 3 类

**Cat 1 —— 上游既有债（consumed + undefined 上游；fork 继承）**：上游自己承认 undefined——

- 上游注释（`upstream/master:packages/client/ui-settings-models/src/client/ModelsSection.module.css:433-438`）："`--dsw-alias-border-subtle`, `--dsw-alias-text-tertiary`, and `--dsw-alias-text-primary` are undefined here and would resolve to their light-mode literals."
- 上游 consumer（无任何 def）：`fill-tsp-secondary`（ui-agent-preset）、`fill-tertiary`/`fill-l2`（ui-attachment、ui-jobs、experimental/client-ui-agent-team）、`separator-primary`（ui-chat/StatsLine）。（source: `git grep` upstream）
- 上游 stance：留 undefined，靠 `var(token, <literal>)` in-CSS fallback。上游 consumer 都带 literal fallback（如 `var(--dsw-alias-fill-tertiary, rgba(0,0,0,0.08))`）。fork 的 consumer 多数不带 fallback → 解析为 inherited/initial（比上游更糟）。

**Cat 2 —— fork 自造的非 canonical 名（上游零存在；平行上游 canonical 族）**：

- `content-primary/secondary/tertiary/danger`：上游零 `content-*`（无 def 无 consumer）。上游 canonical 文字色族 = `label-*`（label-primary/secondary/tertiary/caption/dimmed, :201-209）。fork consumer：ui-semantic-layer（SchemaExplorer、DashboardView、SemanticLayerShell、presenters）、ui-present-table/TableCard。（source: `git grep 'dsw-alias-content-' upstream/master` = 空；fork grep）
- `content-link`：上游零。上游 canonical = `--dsw-alias-link`（§2 刚加）。fork consumer：ui-semantic-layer（SchemaExplorer×2、DashboardView）。
- `surface-primary/secondary/active/default/hover`：上游零 `surface-*`。上游 canonical bg 族 = `bg-base` + `bg-layer-1/2/3`（:157-160）。fork consumer：ui-semantic-layer（4 文件）、ui-present-table/TableCard。
- `border-primary/default/focus`：上游零（仅 `border-subtle` 作为「undefined-but-acknowledged」名出现，见 Cat 1）。上游 canonical border 族 = `border-l1/l2/l3/l4`（:172-176）。fork consumer：ui-semantic-layer、ui-present-table、（ui-settings-models 作注释上下文）。
- `state-warning-primary/surface`：上游零 `state-warning` def，仅 1 个 consumer（`ui-settings-plugin-inventory/PluginInventorySettingsTab.module.css`，上游 one-off）。上游 canonical = `state-warn-primary/secondary/tertiary/label`（:229-232, :321-324）；23 个上游 consumer 文件 vs 1 个 `state-warning`。fork consumer：ui-semantic-layer/presenters、ui-present-table/TableCard（`.kpiNote`、`.chartWarn`）。
- `state-info-primary/surface`：上游零（无 `state-info-*`）。无上游平行族。fork 自造。

**Cat 3 —— 上游领先 commit（§2）**：拉 `8ffdee4fe5` 吸收 `--dsw-alias-link` + markdown-inline-code tweak。

### 4. fork 的 consumer 全是 fork-added（非继承）

- `ui-present-table`（TableCard.module.css、ChartView.tsx）—— fork-added：`git cat-file -e upstream/master:<path>` = NOT exists upstream。fork commits：`cfecbcd9df feat(client): ship ui-present-table toolview plugin (T2)`、`b2860731d5 R4 7 chart types` 等。
- `ui-semantic-layer/presenters.module.css` —— fork-added：NOT upstream。fork commit `4d50b55517 feat(ui-semantic-layer): W5 UI v1`。
- → Cat 2 的 consumer 全在 fork-added 包内。改它们只动 fork 自有代码。

### 5. fork 自 diverge 后未改 design-platform.css 的 token def

- `git log <merge-base>..master -- design-platform.css` = 空（fork 没碰 token def）。fork↔上游 的 6 行 diff 是上游领先变更（§2），非 fork 编辑。
- merge-base：`141eb6fef8 Merge pull request #2783 from deepseek-ai/release/dsh-0.1.0-rc.8`（fork 于 ~rc.8 分叉）。

## 结论（喂给 T2 grilling）

- **Q1 取值**：「设计系统源」= 上游 `var(--dsw-static-*)` alias 模式。对 Cat 2 token，决策不是「define」而是 **align-to-upstream-canonical / alias / define-net-new**。对 Cat 1 token，**follow-upstream-undefined-stance vs define-locally**。
- **Q2 命名**：`state-warn` 是上游 canonical（23:1 + 8 def + 0 warning def）。fork 的 `state-warning` 是偏离 → align 到 `state-warn`（Cat 2 align 的最清晰实例）。
- **额外**：拉上游 `8ffdee4fe5` 拿 canonical `--dsw-alias-link`（解 `content-link`→`link`）。
