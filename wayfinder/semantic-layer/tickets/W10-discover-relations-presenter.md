# W10 — discover_relations presenter

**Type**: task
**Status**: Closed
**Blocked by**: W9（diff 渲染基于 presenter 基建——render intent + meta + detail panel 机制）

## Question

为 `discover_relations` tool 实现 before/after diff 渲染——enrichment 结果以 inline diff 卡片展示，新增关系高亮。

## Scope

### 对话中渲染

Before/after diff 卡：
- **Before 面**：enrichment 前的关系状态（已有 relations 列表）
- **After 面**：enrichment 后的关系状态
- **新增关系高亮**：新发现的 relations 用视觉差异标记（颜色/badge/+标记）
- 关系类型标注（joins / derived_from / related_to）

### Detail panel 渲染

点击 diff 卡 → detail panel 展示：
- 完整的 before/after 对比（所有字段）
- 每条新增关系的详情（source → target、relation type、confidence）
- enrichment 来源说明（确定性 PK 匹配 vs LLM 推断）

### 技术要求

- 遵循 W9 建立的 render intent + meta + presenter 基建
- `tool/result` 事件的 `meta` 包含 `before` 和 `after` 关系快照
- Presenter 组件实现 diff 算法（对比 before/after，标记新增）
- `--dsw-alias-*` token 规范；暗色模式正确

## 验收

- [ ] `discover_relations` 调用后对话中渲染 before/after diff 卡
- [ ] 新增关系有明确视觉高亮（区别于已有关系）
- [ ] 关系类型（joins/derived_from/related_to）可辨识
- [ ] 点击 diff 卡 → detail panel 展示完整 enrichment 详情
- [ ] 暗色模式正确
- [ ] `npx tsc --build` 干净

## 参考

- G5 Resolution、待设计 §3（discover_relations presenter 行）
- G3（AI-Native Enrichment 设计——两轮发现 + confidence gate）
- T1（discoverRelations Service + tool 已实现）
- W9（presenter 基建——本票基于其机制）
- `docs/cookbook/adding-a-tool.md`（render intent pattern）
