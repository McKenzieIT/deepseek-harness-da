---
type: task
status: open
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
