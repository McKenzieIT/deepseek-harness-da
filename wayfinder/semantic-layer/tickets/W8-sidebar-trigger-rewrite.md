# W8 — Sidebar trigger 重写

**Type**: task
**Status**: Closed
**Blocked by**: W7（trigger 需要 preset id 来查找/创建 management session）

## Question

将 `SemanticLayerShell.tsx` 从当前实现重写为 resume/create management session 的 trigger，使点击 sidebar footer action 能创建或恢复管理 agent 会话。

## Scope

### 行为

点击 sidebar footer action 时：
1. 查找 `agentPreset === 'semantic-layer-management'` 的已有 session
2. 有则 `sessions.open(id)` 恢复该 session
3. 无则创建新 session（preset = `semantic-layer-management`）→ goal 状态自然跟随

### 视觉

- 遵循 `SidebarFooterActionOwnerProps { wide }` 契约
- rail 模式：36×36 圆形按钮
- wide 模式：42px 行，icon + label
- Icon：`IconDataOutline16`

### 代码变更

- `SemanticLayerShell.tsx` → 重写（原三栏容器逻辑移除，替换为 session lookup + open/create）
- 利用 `SessionHeader.agentPreset` 属性查找 session
- 利用 `GoalService` session binding 确保 goal 状态关联

### 废弃确认

以下组件在本票中正式标记为废弃（不再被任何代码路径引用）：
- `SemanticLayerView.tsx`
- `EvidenceSidebar.tsx`
- `GoalDock.tsx`

## 验收

- [ ] 点击 sidebar footer action → 若无管理 session 则创建新 session（preset 正确）
- [ ] 点击 sidebar footer action → 若有管理 session 则恢复该 session
- [ ] 创建的 session 携带正确的 `agentPreset` 标记
- [ ] goal 状态随 session 恢复
- [ ] rail/wide 两种视觉模式正确渲染
- [ ] `SemanticLayerView` / `EvidenceSidebar` / `GoalDock` 无引用（可安全删除）
- [ ] `npx tsc --build` 干净

## 参考

- G5 Resolution §3（Trigger）、§6（现有代码处置）
- `packages/client/ui-semantic-layer/src/client/SemanticLayerShell.tsx`（重写目标）
- `packages/goal/goal/src/index.ts`（GoalService + session binding）
- W5b Resolution 代码处置表
