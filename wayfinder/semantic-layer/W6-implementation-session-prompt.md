# W6 实现 Session Prompt

> 本文件是下一 session 的完整 prompt。直接粘贴即可开工。

---

## 认领 W6 实现（W6a-W6e）

上一 session 已完成 W6 设计决策（见 `wayfinder/semantic-layer/tickets/W6-autonomous-goal-loop-and-btoa-evolution.md`）。本 session 执行全部实现。

## Phase 0：敲定实现级剩余细节

开始编码前，先解决三个实现前置问题（读相关代码确认，不需 grilling）：

1. **edit_definition 包**：不存在。确认实现方案：
   - 读 G4 Q5 决议（直接写 + Tier-2 audit + agent 写入标 `unreviewed`）
   - 读现有 `tool-get-definition` / `tool-discover-relations` 的 pattern 作参考
   - 确定：edit_definition = 新 Cordis tool plugin，接受 assetId + partial definition patch → 写 YAML + append audit entry
   - 产出：简短规格确认（写入 W6e ticket 的"edit_definition 规格"节）

2. **EvalRunnerService seam 真实 wiring**：
   - 读 `packages/data/tool-trigger-eval/src/` 了解 W5-full 的 seam 声明
   - 确认 W6a 的 policy plugin 如何触发 eval：是调 `ctx.evalRunner.runBatch()` 还是复用 trigger_eval tool 的执行路径？
   - 产出：确认 wiring 方案（直接调 service vs 复用 tool execution）

3. **auto-flip 阈值校准**：
   - 确认 eval store 中如何计算 "runs with delta data" = `getRunIds().length >= 2`（至少 2 个 run 才有 delta）→ threshold = 3 runs（2 deltas）
   - 产出：确认算法

## Phase 1：并行执行 W6a + W6b + W6c

三个 ticket 无依赖关系，**并行实现**（用 Agent tool 同时派 3 个 subagent，每个在 worktree 中工作）。

### W6a — goal-eval-policy plugin

规格：`wayfinder/semantic-layer/tickets/W6a-goal-eval-policy-plugin.md`

要点：
- 新包 `packages/goal/goal-eval-policy/`
- Cordis plugin，inject: ['goals', 'evidenceQuery', 'evalRunner']
- 监听 goal round admission → 计数 → 每 K rounds 触发 eval → watch delta → count no-improvement → block at N
- Config: `goalEvalIntervalRounds: 3`, `noProgressThreshold: 3`
- 测试：核心状态机（round counting / eval trigger / no-improvement tracking / block）
- 调用 skill: `dsh-plugin-development`

### W6b — goal-eval-context plugin

规格：`wayfinder/semantic-layer/tickets/W6b-goal-eval-context-plugin.md`

要点：
- 新包 `packages/goal/goal-eval-context/`
- Cordis context/prompt plugin，inject: ['goals', 'evidenceQuery']
- 注册 prompt section：当 goal active + eval 结果存在 → 输出 `<eval_evidence>` block
- 内容：pass_rate + delta summary + consecutive_no_improvement + direction hint
- 测试：注入逻辑（有 goal/无 goal、有 eval/无 eval、有 delta/无 delta）
- 调用 skill: `dsh-plugin-development`

### W6c — GoalDock in EvidenceSidebar

规格：`wayfinder/semantic-layer/tickets/W6c-goal-dock-evidence-sidebar.md`

要点：
- 在 `packages/client/ui-semantic-layer/src/client/` 中新增 GoalDock 组件
- 读 `useProjection('goal')` + `useEvidenceQuery` hook
- 显示：objective + phase badge + round counter + eval sparkline
- 放置：EvidenceSidebar 顶部（CoveragePanel 之上）
- 测试：组件 render tests（有 goal/无 goal、有 eval/无 eval）

## Phase 2：并行执行 W6d + W6e

Phase 1 完成后（W6c 和 W6b 分别解阻 W6d 和 W6e），**并行实现** W6d 和 W6e。

### W6d — B→A layout evolution

规格：`wayfinder/semantic-layer/tickets/W6d-btoa-layout-evolution.md`

要点：
- 新增 `/dashboard` 路由（复用 Evidence Panel 组件提升为 hero 布局）
- Config `layoutMode: 'B' | 'A' | 'auto'`（默认 'auto'）
- Auto-flip 逻辑：eval runs >= 3 → A landing
- `/workspace` 不变（B 结构完整保留）
- 测试：auto-flip 条件判断 + 路由切换逻辑

### W6e — Management agent persona ③ 演进

规格：`wayfinder/semantic-layer/tickets/W6e-management-agent-persona-evolution.md`

要点：
- 更新 `apps/cli/config/agent-presets/semantic-layer-management/agent.cordis.yml`
- Persona text 增加：eval evidence 解读指引 + 自驱行为规范
- 新建 `packages/data/tool-edit-definition/`（Phase 0 确认的规格）
- 在 preset 中激活 edit_definition
- 测试：persona 注册 + edit_definition tool 逻辑

## Code Review Pattern

每个 ticket 编码完成后，**立即**用 subagent 做 code review：

```
Agent({
  subagent_type: "code-reviewer",  // or general-purpose if code-reviewer unavailable
  prompt: `Review the implementation of W6x in [path].
    Check:
    1. Cordis plugin pattern compliance (inject/apply/dispose)
    2. Type safety (no any, proper generics)
    3. Test coverage of edge cases
    4. No coupling violations (per ticket spec boundaries)
    5. Aligns with decisions in W6 resolution (Layered/K=3/N=3/etc.)
    Report: issues found + severity (block/warn/nit).`
})
```

若 review 发现 blocking issues → 修复后再进入下一 Phase。

## 约束提醒

- 调用 skill：`dsh-plugin-development`（所有 Cordis 插件）
- 所有新代码须有测试
- `npx tsc --noEmit` 无新增错误
- 不修改现有 goal-round-driver 代码（W6b 是独立 context plugin）
- 不推翻 B 布局结构（W6d 是新增路由非改旧路由）
