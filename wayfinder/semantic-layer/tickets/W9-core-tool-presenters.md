# W9 — 核心 tool presenters

**Type**: task
**Status**: Closed
**Blocked by**: W7（presenter 需要管理 session 上下文才能端到端验证）

## Question

为 `search_schema`、`get_definition`、`get_coverage` 三个核心 tool 实现结构化渲染——render intent + meta + presenter 组件——使 tool 调用结果在对话中结构化展示，点击后 detail panel 展示完整 meta。

## Scope

### 三个 tool 的 presenter 设计

| Tool | 对话中渲染 | Detail panel 渲染 | 复用来源 |
|------|-----------|------------------|----------|
| `search_schema` | 资产卡片列表（name + kind badge + domain + description 摘要） | 完整列表 + 筛选 | 新建（参考 AssetList 样式） |
| `get_definition` | 结构化字段表 + 关系 badge + domain tags | 完整字段展开 + JsonTree | 复用 `AssetDetail`（改为 JsonTree） |
| `get_coverage` | KPI 卡片行（total / confirmed / draft / by-domain breakdown） | 完整统计 + 趋势 | 复用 `CoveragePanel` |

### 技术要求

每个 tool 的 `tool/result` 事件需要：
1. **结构化 `meta`**：tool 返回时附带结构化数据（非纯文本）
2. **Render intent**：声明该 result 使用哪个 presenter
3. **Presenter 组件**：React 组件，接收 meta 渲染对话内卡片 + detail panel 完整视图

参考 `docs/cookbook/adding-a-tool.md` 的 render intent + presenter 设计 pattern。

### Detail panel 行为

被动模式（G5 §5）：用户点击对话中的 tool call → detail panel 展示该 tool 的完整 meta。无 proactive 行为。

### 复用组件改造

- `AssetDetail.tsx` → 改造为 `get_definition` presenter（字段表 → JsonTree，添加 render intent 接口）
- `CoveragePanel.tsx` → 改造为 `get_coverage` presenter（添加 render intent 接口）

## 验收

- [ ] `search_schema` 调用后对话中渲染资产卡片列表（非纯文本）
- [ ] `get_definition` 调用后对话中渲染结构化字段表 + 关系
- [ ] `get_coverage` 调用后对话中渲染 KPI 卡片
- [ ] 点击任一 tool call → detail panel 展示完整 meta 渲染
- [ ] `--dsw-alias-*` token 规范；暗色模式正确
- [ ] `npx tsc --build` 干净

## 参考

- G5 Resolution §5（Detail panel）、待设计 §3（Tool presenters 表格）
- `docs/cookbook/adding-a-tool.md`（render intent + presenter 设计）
- `packages/client/ui-semantic-layer/src/client/AssetDetail.tsx`（复用）
- `packages/client/ui-semantic-layer/src/client/CoveragePanel.tsx`（复用）
- R6（TypertRemoteService pattern；tool presenter render intent）
