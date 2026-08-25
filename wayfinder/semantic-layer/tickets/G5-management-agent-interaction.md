# G5 — 管理 agent 交互范式设计

**Type**: grilling
**Status**: Closed
**Blocked by**: W1（SchemaGateway Remote 投影）

## Question

语义层管理 agent 的交互面如何落地——agent preset 配置、sidebar trigger 行为、tool presenters 设计、detail panel 渲染？

## 背景

W5b grilling 发现"modal panel vs inline panel"是错误的问题框架。语义层管理界面的终态不是 CRUD 浏览器或 Settings dialog，而是**管理 agent 的对话面**——用户通过对话驱动管理，agent 执行 + 呈现证据，UI 让这个交互变得 intelligent。v1 和终态的 UI 容器无区别（差异只在 agent 行为层），应直接按终态设计。

## 待设计（本票 scope）

### 1. 管理 agent preset

配置项：
- **Tools**（v1）：search_schema, get_definition, list_domains, discover_relations, edit_definition, get_coverage, trigger_eval (W3), goal
- **Persona/Prompt**：管理 agent 角色定义（目标=提升语义层质量；工作方式=eval evidence 驱动；与数据 agent 的区别）
- **Goal 配置**：defaultMaxGoalRounds、round prompt 模板

### 2. Sidebar footer trigger

行为：点击 → 查找 `agentPreset === 'semantic-layer-management'` 的 session → 有则 `sessions.open(id)` 恢复，无则创建新 session → goal 状态自然跟随。

视觉：仍为 `SidebarFooterActionOwnerProps { wide }` 契约下的 trigger（rail=36×36 圆 / wide=42px 行 icon+label），用 `IconDataOutline16`。

### 3. Tool presenters（核心 UI 投资）

每个管理 tool 的 `tool/result` 事件需要结构化 `meta` + 对应的 render intent / presenter 组件：

| Tool | Presenter 渲染 | 复用来源 |
|------|----------------|----------|
| `search_schema` | 资产卡片列表（name + kind badge + domain + description 摘要） | 新建（可参考 AssetList 样式） |
| `get_definition` | 结构化字段表 + 关系 badge + domain tags | 复用 `AssetDetail`（改为 JsonTree） |
| `get_coverage` | KPI 卡片行（total / confirmed / draft / by-domain breakdown） | 复用 `CoveragePanel` |
| `discover_relations` | Before/after diff 卡 + 新增关系高亮 | 新建 |
| `edit_definition` | Diff 视图（字段变更前后） | 新建 |
| `trigger_eval` | Eval 进度 → 完成后 Delta 卡 | 复用 `DeltaView` / `EvalTrajectory` |

### 4. Detail panel 行为

v1 保持**被动模式**（现有 pattern）：用户点击对话中的 tool call → detail panel 展示该 tool 的完整 meta 渲染。无 proactive context 新基建。

③ 后可升级为 proactive（detail panel 自动跟踪 goal 当前焦点资产）。

### 5. 现有代码处置

- `SemanticLayerShell.tsx` → 重写为 resume/create session trigger
- `SemanticLayerView.tsx` / `EvidenceSidebar.tsx` / `GoalDock.tsx` → 废弃
- `AssetDetail.tsx` / `CoveragePanel.tsx` → 复用为 presenter
- `EvalTrajectory.tsx` / `DeltaView.tsx` / `GapPanel.tsx` / `OnDemandEvalTrigger.tsx` → 保留为 W5-full presenter
- `useSchemaGateway.ts` → 复用
- `DomainNav.tsx` / `AssetList.tsx` / `SearchBar.tsx` → 暂搁（未来 spotlight overlay 可复用）


## Resolution

W5b grilling session 深度审视后确认：语义层管理界面 = 管理 agent 对话面，以下 6 项设计决策全部锁定。

### 1. 范式

管理 agent 对话面（非 modal/三栏浏览器/Settings dialog）。用户通过对话驱动管理，agent 执行 + 呈现证据，UI 让交互变得 intelligent。

### 2. v1/终态 UI 容器

无区别——直接按终态设计。差异只在 agent 行为层（v1 人驱 vs ③ 自驱），UI 架构不分阶段。

### 3. Trigger

Sidebar footer action → resume/create management session：
- 查找 `agentPreset === 'semantic-layer-management'` 的 session
- 有则 `sessions.open(id)` 恢复；无则创建新 session
- 利用 `SessionHeader.agentPreset` + `GoalService` session binding
- 视觉契约：`SidebarFooterActionOwnerProps { wide }`（rail=36×36 圆 / wide=42px 行 icon+label），用 `IconDataOutline16`

### 4. Tool set

v1 管理 agent 挂载以下 tools：
- `search_schema` — 资产搜索
- `get_definition` — 资产详情
- `list_domains` — 域列表
- `discover_relations` — 关系发现/enrichment
- `edit_definition` — 定义编辑
- `get_coverage` — 覆盖率统计
- `trigger_eval` — eval 触发（W3）
- `goal` — goal 管理

### 5. Detail panel

v1 = 被动模式（现有 pattern）：用户点击对话中的 tool call → detail panel 展示该 tool 的完整 meta 渲染（render intent + presenter 组件）。无 proactive context 新基建。③ 后可升级为 proactive（detail panel 自动跟踪 goal 当前焦点资产）。

### 6. 现有代码处置

| 组件 | 处置 |
|------|------|
| `SemanticLayerShell.tsx` | 重写为 resume/create session trigger |
| `SemanticLayerView.tsx` / `EvidenceSidebar.tsx` / `GoalDock.tsx` | 废弃 |
| `AssetDetail.tsx` / `CoveragePanel.tsx` | 复用为 tool presenter 组件 |
| `EvalTrajectory.tsx` / `DeltaView.tsx` / `GapPanel.tsx` | 保留为 W5-full presenter |
| `useSchemaGateway.ts` | 复用 |
| `DomainNav.tsx` / `AssetList.tsx` / `SearchBar.tsx` | 暂搁（未来 spotlight overlay 可复用） |

### 毕业实现票

本决策毕业为以下实现票（blocking 边见各票）：
- **W7** — 管理 agent preset（cordis.yml 配置）
- **W8** — Sidebar trigger 重写（←W7）
- **W9** — 核心 tool presenters：search_schema / get_definition / get_coverage（←W7）
- **W10** — discover_relations presenter：before/after diff（←W9）
## 验收

- [ ] 管理 agent preset 可在 `cordis.yml` 挂载；启动后 tool list 正确
- [ ] Sidebar footer trigger 点击创建/恢复管理 session
- [ ] 管理 session 中 agent 可调用 search_schema / get_definition / get_coverage 并在对话中结构化渲染
- [ ] Detail panel 点击 tool call 展示完整 presenter
- [ ] discover_relations 调用后渲染 before/after diff
- [ ] `--dsw-alias-*` token 规范；暗色模式正确（对 presenter 组件）
- [ ] `npx tsc --build` 干净

## 参考

- W5b Resolution（推翻原因 + 新方向论据）
- G4（Web UI = 管理 agent 面；B 布局 + 4 演进约束）
- R6（TypertRemoteService pattern；tool presenter render intent）
- dsh-plugin-development skill（MODES.md §3 Repository package + §6 Agent preset）
- `packages/goal/goal/`（GoalService + session binding）
- `packages/goal/goal-round-driver/`（自动 round continuation）
- `docs/cookbook/adding-a-tool.md`（render intent + presenter 设计）
