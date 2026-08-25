# W5b — ui-semantic-layer UI 规范对齐

**Type**: task
**Status**: Closed (Superseded)
**Blocked by**: W1（SchemaGateway，UI 经 Remote 取数）、W5-lite（UI 接线已完成；本票在其声明"用户可用"前必须落地）

## Question

`ui-semantic-layer` v1 的 UI 应**镜像 `ui-settings-general/SettingsRoot`**（sidebar-foot trigger + 居中 modal panel），用 `--dsw-alias-*` 主题 token + `ui-primitives` Icon 渲染——视觉上与 Settings shell 不可区分——还是更轻的 inline panel？

## Resolution — SUPERSEDED

**本票前提被推翻，决策为"都不是——错误的范式"。由 [G5 — 管理 agent 交互范式设计](G5-management-agent-interaction.md) 取代。**

### 推翻原因

Grilling 深度审视了语义层管理界面的终态需求后，发现"modal panel vs inline panel"是错误的问题框架：

1. **语义层管理 = 一个 agent**（G4 核心决议）。管理界面不是 CRUD 浏览器/Settings dialog，而是**管理 agent 的对话面**。
2. **三种交互模式**（资产浏览/图谱探索/证据仪表板）需要的空间和交互范式根本不同——三栏 modal（无论 800px 还是 1200px）都无法同时适配。
3. **v1 和终态的 UI 容器没有区别**——差异只在 agent 行为层（v1 人驱 vs ③ 自驱），UI 架构应直接按终态设计。
4. **dsh 已有完整基建支持新范式**：session + agentPreset + goal + tool presenters + detail panel，无需新发明。
5. **业界所有语义层/数据目录管理工具**（dbt Explorer、Atlan、DataHub）都用全页面 workspace 级体验，不用 dialog——而 dsh 的对话式 agent 范式比全页面更进一步。

### 新方向（G5 负责）

- **触发**：sidebar footer action → resume/create 管理 agent session（非打开 modal）
- **主界面**：dsh 对话 center column（管理 agent 对话）
- **可视化**：tool presenters 在对话中结构化渲染（证据卡、资产卡、子图、diff 审批）
- **上下文**：detail panel（右栏）被动展示当前 tool call 的详情
- **持续性**：goal 持久化在 session 中，支持 resume

### 对现有代码的影响

| 组件 | 处置 |
|------|------|
| `SemanticLayerShell.tsx` | 重写为 resume/create session trigger |
| `SemanticLayerView.tsx` | 废弃（三栏容器不再需要） |
| `DomainNav` / `AssetList` / `SearchBar` | 暂搁（tool presenter 取代；未来可复用为 spotlight） |
| `AssetDetail` / `CoveragePanel` | 复用为 tool presenter 组件 |
| `EvidenceSidebar` / `GoalDock` | 废弃（证据分散渲染为各 tool presenter；GoalBar 已有） |
| `EvalTrajectory` / `DeltaView` / `GapPanel` | 保留为 W5-full tool presenter |
| `useSchemaGateway` hook | 复用 |

### 本票原始 scope 的 bug 去向

- CSS module 未 import / 硬编码 hex / 死 className → 不再修复（代码将被重写/废弃）
- 搜索未接线 → search 变为 agent tool，presenter 渲染结果
- a11y 问题 → 在新 tool presenter 组件中从头做对
- `Promise.all` → `Promise.allSettled` → hook 复用时顺手修

---

## 以下为原始内容（存档）

<details>
<summary>原始 Question、根因、Scope、验收（已不适用）</summary>

**决策方向（待 grilling 确认）**：镜像 SettingsRoot。依据：资产管理面板与 Settings 同为 sidebar-foot 触发的居中管理面，`docs/cookbook/adding-a-settings-card.md` 是最接近的 UI contribution 范本；偏离它无收益。

**本票定位**：W5-lite 接线已全部正确（slot 注册 `sidebar.footer.action`、Typert Remote namespace `schemaGateway`、locale 字典、`useSchemaGateway` hooks 均对且匹配参考），**不阻塞接线 PR**。但 UI 当前以**零样式**渲染、搜索失效、不符 dsh 视觉规范 → **阻塞 W5-lite 声明为"用户可用"**。本票是**跟进打磨票**，必须在 W5-lite 声明可用前落地。

### 根因（接线对，表现层错）

- 两个 `.module.css` 从未被任何组件 import → 插件零样式渲染
- 虚构 token 命名空间 + 133 个硬编码 hex / 0 个 `--dsw-*` 主题 token
- shell 类名 `sl-shell-*` 在 CSS 中未定义 → trigger + modal 完全无几何
- 搜索未接线

### 原始 Scope

Styling/theming、Primitives 用法、Layout/slot 契约、A11y、可用性 bug、类型/约定 — 全部围绕"修好三栏 modal"展开，已不适用。

### 原始验收标准

全部围绕 modal panel + 三栏布局，已不适用。

</details>
