# @deepseek-ai/dsh-client-ui-semantic-layer

[English](README.md) | 中文

语义层管理 UI 插件（浏览器侧）。注册：

- `SemanticLayerShell` 注册到 `sidebar.footer.action`：打开或恢复管理 agent（智能体）会话的触发器
- `search_schema`、`get_definition`、`get_coverage`、`discover_relations`、`trigger_eval` 的 tool 展示转换器：对话中的结构化卡片渲染
- `GoalDock` 注册到 `conversation.input.dock`：目标 + 阶段 + 轮次 + eval sparkline（仅管理会话）
- `EvidenceSidebar` 注册到 `details.aux`：覆盖率、eval 轨迹、delta、gap 分析（仅管理会话）
- `SchemaExplorer` 注册到 `details.aux`：带领域导航的资产浏览器（仅管理会话）

## 架构

该插件没有宿主侧行为（`src/index.ts` 是一个空的 apply）。所有逻辑都在浏览器侧（`src/client/`）：

- **SemanticLayerShell**：侧边栏按钮与 B→A 布局路由器。在 "B" 模式（默认，evalRunCount < 3）下渲染触发按钮；在 "A" 模式（≥3 次 eval 运行后自动翻转）下渲染 DashboardView。
- **wiring.tsx**：会话级 slot 适配器，以 `agentPreset === 'semantic-layer-management'` 为门控条件。非管理会话不渲染任何内容。
- **presenters/**：每个管理 tool 的 keyed `tool.call.toolview` 渲染器。
- **hooks/**：`useEvidenceQuery`、`useEvidenceMetrics`、`useSchemaGateway`、`useLayoutMode`。

## 消费的服务

| 服务 | 来源 | 用途 |
|---------|--------|-------|
| `sessions` | dsh-client-runtime | 会话列表，打开/创建 |
| `workspaces` | dsh-client-runtime | `startSession()` |
| `connection` | dsh-client-connection | API 调用（`agentPresets.select`） |
| `remote.schemaGateway` | dsh-schema-gateway（Typert） | schema 浏览器数据 |
| `remote.evidenceQuery` | dsh-evidence-query（Typert） | eval 结果、覆盖率、delta |
| `layout` | dsh-client-ui-layout | `openDetails()`（可选） |
| `slots` | dsh-client-ui-slots | slot 注册 |
| `locale` | dsh-client-locale | i18n 词典 |

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效应

该包不扩展或失效 agent loop（智能体循环）的可复用请求前缀。

## 已知限制与延后工作

- **Evidence 推送订阅**：当前 v1 在挂载时抓取 + 手动刷新；通过 Typert 事件转发（`$on`）的实时推送已延后。
- **Shell 自动翻转需要活动连接**：B→A 自动翻转的 `evalRunCount` 来自 evidence-query RPC 桥；没有活动的宿主连接时，shell 停留在 B 模式（触发按钮）。
- **CSS Modules 不完整**：Evidence 面板组件（EvidenceSidebar、CoveragePanel、EvalTrajectory、EvalDeltaView、GapPanel）使用 BEM 类名，而非 CSS Modules。迁移已延后。
- **SchemaExplorer 图导航**：`onNavigateToGraph` 依赖可选的 `contextLayer` 服务；缺少该服务时，"在图中查看"操作不可用。
