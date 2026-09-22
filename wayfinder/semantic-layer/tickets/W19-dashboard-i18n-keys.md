---
type: task
status: resolved
blocked_by: []
---

# W19: DashboardView i18n keys（dashboard.title / dashboard.goToWorkspace）缺失

**Branch**: `fix/w19-dashboard-i18n-keys` <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

## 背景（W16 浏览器测试发现，2026-09-05）

W16 PR #14 浏览器实测发现：DashboardView（A 模式，auto-flip 触发后）渲染了，但标题显示 "dashboard.title"（raw i18n key，未翻译）。W6d 作者在 `DashboardView.tsx` 加了 `t('dashboard.title')` + `t('dashboard.goToWorkspace')` 但没在 locale dict 加这俩 key。

## Task

在 `packages/client/ui-semantic-layer/src/client/locales.ts` 加两个 key（en + zh）：
- `dashboard.title`: "Evidence Dashboard" / "证据看板"
- `dashboard.goToWorkspace`: "Back to workspace" / "返回工作区"

（若 locales.ts 有对应的 `.i18n.yaml`，同步更新以过 lefthook translation pairing 校验。）

## 验收

- `dsh web` → DashboardView 显示翻译后的标题（不是 raw key "dashboard.title"）。
- i18n pairing 校验绿（lefthook pre-commit `translation pairing`）。

## Answer（2026-09-18）

`SemanticLayerKey` 现已声明 `dashboard.title` 和 `dashboard.goToWorkspace`，中英文词典分别提供 `Evidence Dashboard` / `证据看板` 与 `Back to workspace` / `返回工作区`。`DashboardView.spec.tsx` 使用真实词典渲染 A 模式标题和返回按钮，并断言输出不含 raw key；`DashboardView` 本身未改动。

自动化验证：聚焦组件测试共 2 个文件、19 个测试通过；Client UI i18n 检查确认 758 个源文件使用 locale-owned copy；translation pairing 检查确认 1104 对文档一致；`git diff --check` 通过。随后在 W18 的真实 `dsh web` 验收中确认 A 模式显示中文 `证据看板`，独立 Playwright browser context 显示英文 `Evidence Dashboard`，均未出现 raw key；同一真实 server/model flow 的 GIF 位于 `../../../.playwright-mcp/w18-evidence-dashboard/run-4/w18-evidence-dashboard.gif`。
