# W11 — Context Layer 对话式管理与 Enrichment 闭环

**Type**: grilling → task
**Phase**: misc（管理 UI 闭环）
**Status**: resolved 2026-08-27（grilling 完成，12 项决策锁定）
**Blocked by**: W10（Context Layer 关系视图可视化，resolved 2026-08-27）

## Question

W10 建成只读图谱后，需在其上加对话式管理能力，形成"看→发现问题→对话修正→验证→看"闭环：
1. Discover Relations 的结果实时在图上展示
2. 通过 LLM 对话 + tool 修正 definition（非 UI 直接编辑）
3. Reachability preview（"如果连接这两个节点..."）— agent 对话触发
4. Eval evidence overlay（哪些节点参与了失败 case）

## Resolution

### 核心原则

**用户通过可视化发现问题，通过对话让 LLM 调用工具修正。** 图谱本身是观察工具，不是编辑工具。一切编辑/增删操作走 LLM tool，不做 UI 直编。

### D1. Discover Relations 触发 → 仅对话触发 + 叙述后渲染

- **(c) 确认**：仅 management agent 对话触发。用户在对话面板说"帮我发现 dws_pay 的关系"→ agent 调 `discover_relations` → agent 先叙述结果（"发现了 3 条新关系：..."）→ 叙述完成后图上新边 fade-in。
- **Narration Gate 机制**（B2 审查补充）：图谱组件不直接订阅 semantic layer 变化，而是订阅 management session 的 tool result + message complete 事件流。tool resolve 时拿到 `presentationMeta.added` 标记为 pending；assistant message stream 结束时释放 pending → fade-in 动画。

### D2. Edit 入口 → 仅对话 + 侧面板上下文捷径

- **(c) 确认**：只通过 LLM 对话 + `edit_definition` tool 编辑。
- **上下文捷径**：侧面板（点击节点弹出的详情面板）为只读展示 + 一个 💬 按钮，点击后自动在对话输入框插入该资产的引用（如 `@dws_pay_order`），降低记忆负担。编辑行为仍走 agent tool。

### D3. Reachability Preview → 对话触发 + 会话级持久

- **(c) 确认**：用户问"如果连接 A 和 B 会怎样？"→ agent 调 `reachabilityDelta` → 在图上用虚线高亮预览 + agent 叙述新增可达性。
- **生命周期**：会话级持久——虚线高亮保持到 session 结束或被新预览覆盖。

### D4. Tier-1 confirm → v1 保持 Tier-2 直写

- **(a) 确认**：v1 使用者 = trusted admin，无需审批。`unreviewed` 标记 + eval loop 是安全网——错误的编辑会在 eval 中暴露。多角色 suggest→approve（b）是不同 persona 引入，非 v1 范围。

### D5. Eval 退化反馈 → 视觉变化 + 脉冲 + 自动聚焦

- 边框 + badge 常驻 + 可切换填色诊断模式（W10 基线不变）。
- `trigger_eval` 后 → 图上相关节点闪烁"评估中"动画 → settled 后更新 badge/边框颜色。
- **退化主动提醒**：pass rate 下降的节点有红色脉冲动画 + 自动 pan/zoom 聚焦（确保远处退化不被忽略）。
- Overlay mode 可切换：off / coverage-only / pass-rate heatmap。

### D6. 对话面板 session 身份 → 独立管理 session + 跨 session 上下文引用

- **(c) 确认**：进入全屏图谱管理界面时开启专属 management agent session，只挂载管理相关 tools（`discover_relations`、`edit_definition`、`trigger_eval`、`reachabilityDelta`）。
- **跨 session 上下文**：管理 session 可只读引用主 data-query session 的对话摘要（如"之前你在取数时遇到了 X 问题"），提供连贯体验但职责分离。

### D7. 闭环自主续航 → 自主巡检模式（可开关）+ 约束

- **(c) 确认**：提供"自主巡检"开关。
- **开启时**：agent 自动循环——基于 `assetHealth`/`gapAnalysis` 找最弱节点 → 诊断 → 建议修正 → 等用户明确确认 → 执行 → eval → 下一个。
- **关闭时**：被动等待，用户自己在图上看到问题再发起。
- **安全约束（B1 审查补充）**：
  - 每轮巡检最多 3 次 edit，超过后暂停等下一轮确认
  - confirm prompt 超时 60s 无回应 → 默认拒绝、暂停巡检
  - 巡检可限定 scope（"只巡检 payment domain"）
  - 每个 edit 都过用户明确确认，不做静默执行

### C1. Session 权限/冲突 → 共享身份 + MVCC 快照

- 两个 session 共享同一个 user identity token。
- 管理 session 的写入立即落盘，但主 session 的 query 引擎在一次 query 执行期间锁定 definition snapshot（MVCC），执行中不受影响，下次 query 用新版本。

### C2. Patrol 下 reachability preview → 轮次结束后批量渲染

- Patrol 执行期间 reachability preview 进 buffer，不立即渲染。
- 巡检轮次结束后批量渲染所有该轮探索的虚线预览，用户一次性看全貌。

### C3. Eval 触发策略 → Patrol 按轮自动，手动模式显式触发

- **Patrol 模式**：每轮 edit 结束后自动触发一次 eval（eval 该轮修改涉及的 asset subset），用 `beforeAfterDelta` 对比展示改善/退化。
- **手动模式**：由用户或 agent 在对话中显式触发（"帮我跑一下 eval"）。

### S1. Undo/Rollback → `revert_edit` 工具

- 新增 `revert_edit` tool，基于 audit trail before-snapshot 的版本号回滚。
- API：`revert_edit(asset_name, to_version: N)` → 将 asset 回滚到 audit trail 中第 N 版的 before-snapshot。
- 需要 audit trail 存储完整 before-state（当前 `edit_definition` 已记录 patch，需补充 before-snapshot 持久化）。

### S3. Patrol + 手动对话并发 → btw 机制

- 用户在 patrol 运行中插入的消息被当作 "btw"（by the way）旁路请求。
- Agent 处理完 btw 后自动回到 patrol 流程继续，不需要显式问"要继续巡检吗？"。
- Patrol 上下文保持不丢。
- 只有显式"停止巡检"/"关闭 patrol"才终止循环。

## 实现要求（grilling → task 过渡）

1. **Narration Gate**（新基础设施）：management session 事件流 → pending buffer → message complete 释放 → 动画。
2. **`revert_edit` 工具**：audit trail before-snapshot 持久化 + 新 tool 包。
3. **Patrol Mode**：巡检循环 + 约束 + btw 机制。
4. **独立 Management Session**：session 创建/销毁 + tool 门禁 + 跨 session 上下文摘要引用。
5. **图谱动画层**：fade-in（新边）/ 虚线高亮（preview）/ 脉冲+聚焦（退化）/ 闪烁（eval running）。
6. **MVCC query snapshot**：query 执行期间 definition 锁定。

## 关联

- [W10 Context Layer Graph](W10-knowledge-graph-visualization.md) — 母组件（resolved）
- [tool-discover-relations](../../packages/data/tool-discover-relations/) — enrichment 调用
- [tool-edit-definition](../../packages/data/tool-edit-definition/) — 写入调用
- [evidence-query reachabilityDelta](../../packages/data/evidence-query/) — preview 数据
- [goal-eval-policy](../../packages/bundle/data-agent/) — autonomous loop 闭环
