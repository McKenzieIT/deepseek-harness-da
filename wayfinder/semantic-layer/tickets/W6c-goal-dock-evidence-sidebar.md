# W6c — GoalDock in EvidenceSidebar

**Type**: task
**Status**: Closed
**Blocked by**: —（并行根）

## Question

在 EvidenceSidebar 中渲染 goal 状态 + eval sparkline。

## 规格

### 组件：GoalDock（EvidenceSidebar 内联版）

EvidenceSidebar 顶部新增 GoalDock 区域，复用 ui-goal 的 GoalBar pattern：

#### 显示内容
- **Objective**：截断显示（max 2 行），hover 展开全文
- **Phase badge**：active / paused / blocked / complete（色彩区分）
- **Round counter**：`Round 5/256` 格式
- **Eval sparkline**：最近 5 次 eval 的 pass_rate 迷你折线（仅当有 eval 数据时）
- **Block reason**：当 phase=blocked 时，显示 blockedReason.message

#### 数据源
- Goal state：`useProjection('goal')` — 与会话 dock GoalBar 相同数据源
- Eval sparkline：`ctx.evidenceQuery.evalResultQuery()` 按 runId 聚合 pass_rate 序列
- 通过 `useEvidenceQuery` hook（W5-full 已实现）

#### 交互
- 不提供 mutation verbs（pause/resume/clear 仍在会话 dock 的 GoalBar 操作）
- 纯只读展示 + eval 融合
- 点击 objective → 跳转到会话中 goal 创建位置（deep link，满足 W5 演进约束 #4）

#### 与现有 GoalBar 的关系
- **共存**：conversation.input.dock 中的 GoalBar 不变（order 10，提供 mutation verbs）
- GoalDock 是 EvidenceSidebar 的内联展示（只读 + eval 融合）
- 两者读同一 projection，无重复状态

### 放置位置
- EvidenceSidebar 最顶部（在 CoveragePanel 之上）
- 当无活跃 goal 时不渲染（与 GoalBar 行为一致）

## 验收

- [ ] EvidenceSidebar 顶部展示 GoalDock（有活跃 goal 时）
- [ ] 显示 objective + phase + round + sparkline
- [ ] 无活跃 goal 时 GoalDock 不渲染
- [ ] Eval sparkline 反映最近 eval runs
- [ ] 与会话 dock GoalBar 共存无冲突
- [ ] 测试覆盖组件渲染逻辑
