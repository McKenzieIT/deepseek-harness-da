# W5 — ui-semantic-layer v1 UI（B 布局）

**Type**: task
**Status**: Closed
**Blocked by**: W5-lite 仅 W1；W5-full 额外依赖 W4

## Delivery Milestones

### W5-lite（仅依赖 W1）— ✅ 已交付

W8（trigger）+ W9（presenters）= 管理 agent 用户可用。G5 重塑了 W5-lite 的含义：不是 CRUD 浏览器，而是管理 agent 对话面（trigger + preset + tool presenters 全链路）。

### W5-full（额外依赖 W4）— ✅ 已交付

证据能力渐进亮起，在管理 agent 对话面中：

**trigger_eval tool**（`@deepseek-ai/dsh-tool-trigger-eval`）：
- 管理 agent 可调用 trigger_eval 触发 eval run
- Progressive：有 evalRunner service → full run；仅有 past results → report mode；无配置 → actionable error
- presentCall/presentResult/presentationMeta 完整（conversation 中结构化卡片）
- 健康检查 + before/after delta 自动计算

**Evidence Panel 组件库**（ui-semantic-layer client exports）：
- `EvidenceSidebar` — 主面板（feature-flag gated：enabled=false 降级占位，enabled=true 完整视图）
- `CoveragePanel` — KPI 卡（table/event/metric 计数 + confirmed/draft breakdown）
- `EvalTrajectory` — eval 结果时间线（status dots + list + pass rate）
- `EvalDeltaView` — 两次 eval run 对比（improved/regressed/unchanged + flip list）
- `GapPanel` — join-reachable 但无 eval 覆盖的资产
- `OnDemandEvalTrigger` — UI 侧 eval 触发按钮
- `useEvidenceQuery` hook — 消费 `EvidenceQueryClient`，自动 fetch coverage on mount

**TriggerEvalRow presenter**：
- 注册在 `tool.call.toolview` key=`trigger_eval`
- 对话中渲染：pass rate KPI + before/after delta summary + case flip highlights

**Preset 接线**：
- `agent.cordis.yml` 中 trigger_eval 已从注释变为活跃挂载
- Persona prompt 更新反映 trigger_eval 可用

**Evidence 架构约束满足**：
- 4 演进约束 ✅（证据面 = 可提升模块、路由可切换、共享 evidence-query 后端、资产工作区可深链）
- 读 ctx.evidenceQuery 而非直接读文件 ✅
- Cordis UI 插件模式（slot 注册）✅
- 所有新代码有测试 ✅（19 tests：6 tool + 13 client component）

## Resolution

W5-full 在 W5-lite 基础上完成证据能力渐进亮起：

1. **新包 `@deepseek-ai/dsh-tool-trigger-eval`**：Cordis tool plugin，声明 `EvalRunnerService` seam（ctx.evalRunner），progressive fallback（full_run → report_last → not_configured），完整 render intent
2. **Evidence Panel 源码重建**：types.ts + useEvidenceQuery hook + 6 个 React 组件（CoveragePanel / EvalTrajectory / EvalDeltaView / GapPanel / OnDemandEvalTrigger / EvidenceSidebar），从 client entry 导出供 host composition 放置
3. **TriggerEvalRow presenter**：注册在 presenters/index.ts，对话中 trigger_eval 调用渲染为结构化卡
4. **Preset 活化**：agent.cordis.yml trigger_eval 解除注释 + persona 更新
5. **EvidenceQueryClient 扩展**：新增 `beforeAfterDelta(runIdA, runIdB)` 方法支持 eval run 对比
6. **测试覆盖**：tool formatTriggerEval + service contract + 13 component render tests

**未完成（③-gated / 后续）**：
- GoalDock（③ 自驱循环，W6 ticket）
- EvalRunnerService 真实实现（需 AgentResponder wiring = 跨 agent 通信）
- Evidence sidebar 在 layout 中的精确 slot 位置（需 host composition 更新）
- CSS modules for evidence components（当前仅 BEM class names）

## Question

（原始 question 见下方，已由 G5 重塑：管理界面 = agent 对话面，非 CRUD 浏览器）

新增 `ui-semantic-layer` 包，v1 = **B 布局**（资产为首 + 证据侧栏；G4 Q2 决议）。

## 验收

### W5-lite ✅
- [x] 管理 agent trigger 可用（sidebar footer action → create/resume session）
- [x] 管理 agent preset 挂载 tools（search_schema/get_definition/list_domains/get_coverage/discover_relations）
- [x] 核心 tool presenters 在对话中结构化渲染

### W5-full ✅
- [x] trigger_eval tool 注册且可调用（报告 pass rate + delta）
- [x] TriggerEvalRow 在对话中渲染 eval 结果卡
- [x] EvidenceSidebar 组件库完整导出（coverage + trajectory + delta + gap）
- [x] useEvidenceQuery hook 消费 EvidenceQueryClient（含 beforeAfterDelta）
- [x] 19 tests 全绿
- [x] `npx tsc --noEmit` 无新增错误
