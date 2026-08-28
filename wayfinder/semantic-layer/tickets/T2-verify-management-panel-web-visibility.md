# T2 — 确认管理面板在 Web UI 中实际可见

**Type**: task (HITL)
**Phase**: post-W14
**Status**: closed
**Assignee**: claude
**Blocked by**: 无
**Blocks**: [R8](R8-evidence-query-push-subscription.md)（push 订阅调研的前置——面板不可见则 push 无意义）

## Question

W14 修复（commit 3dc8295da4）声称 sidebar 按钮已恢复可见，代码调研确认组件已注册到正确 slot。但实际在 `pnpm dsh web` 运行时，管理面板未显示。

需要确认并修复：

1. **Sidebar 触发按钮**（SemanticLayerShell）：
   - `pnpm dsh web` 启动后，sidebar 底部是否可见语义层管理按钮？
   - 若不可见：检查 console 错误、Cordis inject 报错、plugin mount 失败

2. **管理 session 进入**：
   - 点击按钮后是否创建/恢复 `semantic-layer-management` preset 的 session？
   - Session 内 agentPreset 是否正确设置？

3. **Evidence 面板组件**：
   - 进入管理 session 后，右侧 details 栏是否显示 EvidenceSidebar？
   - GoalDock 是否出现在 input dock？
   - 若不可见：检查 `wiring.tsx` 的 preset gate 逻辑 + `details.aux` slot 渲染

4. **修复**：
   - 定位 root cause（W14 后新增的 regression？配置问题？bundle mount 顺序？）
   - 修复并验证全链路

## 验收

- [x] `pnpm dsh web` 启动 → sidebar 底部按钮可见
- [x] 点击按钮 → 进入管理 agent session
- [x] 管理 session 中 → GoalDock 在 input dock 可见
- [x] 管理 session 中 → EvidenceSidebar 在 details.aux 可见
- [x] Console 无 inject/mount 报错

## Resolution

**验证通过（2026-08-28）。** W14 修复后管理面板在 `pnpm dsh web` 运行时**全部可见**，无需额外修复。

### 验证方法

Headless Playwright 自动化（连接运行中实例 127.0.0.1:3080，PID 41912，启动于 W14 commit 3dc8295da4 之后）：

1. **Boot manifest 确认**：`window.__DSH_BOOT__` entries 含 `@deepseek-ai/dsh-client-ui-semantic-layer`
2. **Bundle 可达**：`/plugins/@deepseek-ai/dsh-client-ui-semantic-layer/client.js` → HTTP 200
3. **Sidebar 按钮渲染**：`[data-slot="sidebar.footer.action"]` 内含 "Semantic Layer" 按钮
4. **Session 进入**：点击后 GoalDock 出现于 `conversation.input.dock`（显示活跃 goal objective）
5. **Evidence 面板**：`details.aux` slot 渲染 `sl-evidence-sidebar--active`（含 GoalDock + coverage）
6. **零错误**：整个流程无 console error 或 pageerror

### 前置条件

- Web profile 需包含 `@deepseek-ai/dsh-data-agent` bundle（`~/.dsh/profiles/web/package.json` → `dsh.profile.bundles` 列表）
- `setup-da-profile.sh` 或手动 `dsh plugin --profile web add @deepseek-ai/dsh-data-agent` 完成此配置
- 不依赖外部 LLM/ODPS 连接（UI 层独立渲染）
