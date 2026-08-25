# W6 UI Wiring Session — E8/E9/E10/E11

## 目标

完成 W6 的 client-side 数据接线，使 GoalDock、EvidenceSidebar、DashboardView 和 auto-flip 在 dsh web 中真正可见。完成后 commit 并执行 code review。

## 架构上下文（已确认）

### Slot 系统

| Slot | Scope | 当前占用者 | 用途 |
|------|-------|-----------|------|
| `sidebar.footer.action` | root | SemanticLayerShell（触发按钮）| 侧栏底部 action |
| `conversation.input.dock` | session | ui-goal GoalDock（已有）| 对话输入区域上方 dock 条 |
| `details` | session | DetailsPanel（tool 详情）| 右侧详情面板 |
| `conversation.session` | session | 标准对话体 | 整个会话主体（单占） |

### Projection 机制

- `useProjection('goal')` 在 session-scoped slot 中可用（runtime 自动提供）
- 返回 `GoalProjection | null`：`{ goal: GoalSnapshot, roundsStarted, createdAt, updatedAt }`
- 模式参考：`packages/client/ui-goal/src/client/index.ts`（注册 dock slot，inject 回调，GoalDock 读 projection）

### 关键文件

- `packages/client/ui-semantic-layer/src/client/index.ts` — 当前 host composition
- `packages/client/ui-semantic-layer/src/client/GoalDock.tsx` — W6c 组件（待接线）
- `packages/client/ui-semantic-layer/src/client/DashboardView.tsx` — W6d 组件（待接线）
- `packages/client/ui-semantic-layer/src/client/EvidenceSidebar.tsx` — 含 GoalDock 的完整侧边栏
- `packages/client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts` — auto-flip 纯函数
- `packages/client/ui-goal/src/client/index.ts` — GoalDock dock 注册模式参考
- `packages/client/ui-conversation/src/client/apply.ts:446` — details slot 注册模式参考
- `packages/client/ui-layout/src/client/AppFrame.tsx` — 三栏布局（sidebar + conversation + details）
- `packages/client/runtime/src/client/sessions/projection-store.ts` — useProjection 实现

## 实现任务

### E8: GoalDock 在 EvidenceSidebar 中展示（session-scoped 接线）

**方案：** 在 `ui-semantic-layer` 的 `apply()` 中注册一个 session-scoped slot 渲染 EvidenceSidebar（含 GoalDock）。

选择哪个 slot：
- **选项 A（推荐）：** 注册 `conversation.input.dock` 的第二个条目（id: 'semantic-layer-evidence'，order: 20，排在 goal dock 之后）。在 dock 中渲染一个精简版 GoalDock（只有 objective + sparkline）。
- **选项 B：** 接管 `details` slot —— 但 details 已被 DetailsPanel 占用（ui-conversation 注册），不能直接替换。
- **选项 C（最佳）：** 不接管任何现有 slot。在 `ui-semantic-layer` 中新增一个 `conversation.input.dock` 条目，仅当 `agentPreset === 'semantic-layer-management'` 时渲染 GoalDock + eval sparkline。

实现步骤：
1. 在 `index.ts` 的 `ctx.inject(['sessions', 'workspaces', 'connection'], ...)` 中，添加一个 `conversation.input.dock` 注册（模仿 ui-goal 的模式）
2. 注册条件：仅当当前 session 的 agentPreset === PRESET_ID 时渲染
3. 组件：直接使用 W6c 的 `GoalDock`，通过 `useProjection('goal')` 获取 goalData
4. evalPassRates：暂时从 connection API 的 `triggerEvalRun` 结果缓存中获取，或先硬编码 `[]`（标注 TODO）
5. 确保 GoalDock 接受 `useProjection` 并从中构造 `GoalDockGoalData`

**注意：** `GoalDock.tsx` 的 props 接口（`GoalDockProps`）接受 `goalData: GoalDockGoalData | null`，不是 `useProjection`。需要写一个 adapter 组件：

```tsx
function SemanticLayerGoalDock({ useProjection, t }: { useProjection: ..., t: ... }) {
  const projection = useProjection('goal')
  const goalData: GoalDockGoalData | null = projection ? {
    goal: projection.goal,
    roundsStarted: projection.roundsStarted,
  } : null
  return <GoalDock goalData={goalData} evalPassRates={[]} t={t} />
}
```

### E9/E10: DashboardView 展示 + Auto-flip

**方案：** DashboardView 不适合放在 sidebar.footer.action slot（那只是一个按钮）。正确位置：

- **选项 A（推荐）：** 当 effectiveMode === 'A' 时，打开管理 agent 会话后，在 details 面板中展示 EvidenceSidebar（含 DashboardView 的核心组件：EvalTrajectory hero + CoveragePanel + EvalDeltaView）。这不需要新路由，只需在 details 面板中注册一个语义层专用视图。
- **选项 B：** 用 `conversation.session` slot 替换整个会话体为 DashboardView —— 太激进，会隐藏对话。
- **选项 C（简洁）：** 将 DashboardView 的核心内容（EvalTrajectory + KPI）融入 EvidenceSidebar 顶部，而非独立路由。EvidenceSidebar 本身注册到 details slot。当 evalRunCount >= 3 时 sidebar 自动切换为 dashboard 模式（hero 展示）。

**推荐 C：** EvidenceSidebar 注册为 details slot 的占用者（仅在管理 agent 会话中）。auto-flip 控制 sidebar 内部布局：
- B 模式：CoveragePanel 在上 + compact eval info
- A 模式：EvalTrajectory hero + KPI 大卡片

实现步骤：
1. 在 `ui-semantic-layer` 的 apply 中，注册 `details` slot（session-scoped，仅管理 agent 会话）
2. 传入 `useProjection` + 创建一个 EvidenceQueryClient bridge（或 placeholder）
3. EvidenceSidebar 已接受 `goalData` 和 `evalPassRates` —— 从 projection 适配
4. Auto-flip：在 EvidenceSidebar 内部根据 evalRunCount 切换模式（props 传入 `layoutMode: 'auto'`）
5. `evalRunCount`：需要从 server 获取。最简方案：利用 TypertRemoteService（SchemaGateway 已是 Remote）添加一个 `getEvalRunCount()` Remote 方法到 EvidenceQueryService，client 通过 connection API 调用。或者在 details slot inject 时从 session 的 projection store 派生（如果 eval 数据在 projection 中有缓存）。

**如果 RPC bridge 太复杂**，fallback：
- 固定 `evalRunCount = 0`（B 模式），标注 `// TODO: wire client RPC for evidence-query`
- EvidenceSidebar 在 details slot 中至少渲染出来（GoalDock + Coverage + 手动 trigger 按钮可用）

### E11: EvalSparkline 数据

暂时用 `[]`（空数组 → sparkline 不渲染）。标注 TODO。真实数据需要 evidence-query RPC bridge。

## 约束

- 调用 skill：`dsh-plugin-development`（Cordis 插件注册模式参考）
- 不修改 `ui-goal`、`ui-conversation`、`ui-layout` 的代码
- 不替换已有的 `details` slot 注册（`ui-conversation` 的 DetailsPanel）—— 应共存或条件注册
- `useProjection` 只在 session-scoped slot 中可用
- 所有新代码须有测试
- `npx vitest run packages/client/ui-semantic-layer/tests/` 全绿

## 验收

- [ ] 管理 agent 会话中，GoalDock 可见（input dock 或 details 面板）
- [ ] 有活跃 goal 时显示 objective + phase + round
- [ ] details 面板展示 EvidenceSidebar（CoveragePanel + eval 相关组件）
- [ ] auto-flip placeholder 就位（layoutMode='auto' + evalRunCount=0 暂居 B 模式）
- [ ] 所有接线标注 TODO 的位置清晰（后续 evidence-query RPC bridge ticket 可据此推进）
- [ ] vitest 全绿
- [ ] commit + code review 无 blocking issues

## 完成后

1. `git add -A && git commit` with descriptive message
2. 用 subagent 执行 code review（检查 slot 注册模式、props 适配、条件渲染逻辑）
3. 确认全绿后给出 E2E 测试 list
