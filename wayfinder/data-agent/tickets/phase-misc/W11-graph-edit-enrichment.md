# W11 — Context Layer 对话式管理与 Enrichment 闭环

**Type**: grilling → task
**Phase**: misc（管理 UI 闭环）
**Status**: open（需先 grilling 锁定交互形态）
**Blocked by**: W10（Context Layer 关系视图可视化，resolved 2026-08-27）

## Question

W10 建成只读图谱后，需在其上加对话式管理能力，形成"看→发现问题→对话修正→验证→看"闭环：
1. Discover Relations 的结果实时在图上展示
2. 通过 LLM 对话 + tool 修正 definition（非 UI 直接编辑）
3. Reachability preview（"如果连接这两个节点..."）— agent 对话触发
4. Eval evidence overlay（哪些节点参与了失败 case）

## 核心原则（W10 grilling 2026-08-27 确立）

**用户通过可视化发现问题，通过对话让 LLM 调用工具修正。** 图谱本身是观察工具，不是编辑工具。一切编辑/增删操作走 LLM tool，不做 UI 直编。

## 待 Grill 决策点

### D1. Discover Relations 触发方式

- ~~(a) Graph 上右键 "发现关系" → 调 tool~~ — 违反"对话修正"原则
- ~~(b) Toolbar "全量发现" 按钮~~ — 同上
- **(c) 仅 management agent 对话触发 → graph 被动反映变化** — 符合原则，用户在对话面板说"帮我发现 dws_pay 的关系"→ agent 调 `discover_relations` → 图上新边 fade-in 动画

W10 决策倾向：(c) 仅对话触发。待 grilling 最终确认。

### D2. Edit 入口

- ~~(a) 右键 node → "编辑定义"~~ — 违反原则
- ~~(b) 底部 toolbar "Edit" 按钮~~ — 同上
- **(c) 只通过 LLM 对话 + tool 编辑** — 用户在图上看到问题（如"这个 JOIN 条件不对"），在对话面板告知 agent，agent 调 `edit_definition` 修正。图谱侧面板显示详情供参考，但不提供编辑入口。

W10 决策倾向：(c) 对话修正。待 grilling 最终确认。

### D3. Reachability Preview 交互

- ~~(a) 选中两个 node → UI 预览~~ — 可由 LLM 完成
- ~~(b) 拖拽画线~~ — 违反原则
- **(c) agent 对话触发** — 用户问"如果连接 A 和 B 会怎样？"→ agent 调 `reachabilityDelta` → 在图上用虚线高亮预览

W10 决策倾向：(c) 对话触发 + 图上被动可视化反馈。待 grilling 最终确认。

### D4. Tier-1 confirm 是否升级

- (a) 保持 Tier-2 直写（v1 管理员 = trusted admin，无需审批）
- (b) 加 Tier-1 suggest→approve 回路（业务用户建议 → 管理员批准）
- (c) 仅 discover_relations 结果需 confirm，edit 保持直写

待 grilling 确认。

### D5. Eval Evidence Overlay

已在 W10 中决策：边框 + badge 常驻 + 可切换填色诊断模式。W11 补充：
- trigger_eval 后 → 图上相关节点闪烁动画 → settled 后更新 badge/边框颜色
- 可切换 overlay mode（off / coverage-only / pass-rate heatmap）

## 关联

- [W10 Context Layer Graph](W10-knowledge-graph-visualization.md) — 母组件（resolved）
- [tool-discover-relations](../../packages/data/tool-discover-relations/) — enrichment 调用
- [tool-edit-definition](../../packages/data/tool-edit-definition/) — 写入调用
- [evidence-query reachabilityDelta](../../packages/data/evidence-query/) — preview 数据
- [goal-eval-policy](../../packages/bundle/data-agent/) — autonomous loop 闭环
