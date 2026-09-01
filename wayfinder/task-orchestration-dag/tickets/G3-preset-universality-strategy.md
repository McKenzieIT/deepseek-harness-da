# G3 — preset universality strategy

**Type**: grilling
**Status**: resolved
**Blocked by**: [G1 DAG data model decision](G1-dag-data-model-decision.md) ✅
**Blocks**: —

## Context from G1

G1 decided: the DAG is a **terminal state plugin** that disables `tool-todo` and registers `dag_task_*` tools via a bundle patch. The plugin defines its own session events (`dag/task-create`, `dag/task-update`, etc., all `ignorable: true`) and renders via `ConversationNodeDefinition`.

This simplifies the universality question: it's now about **which presets should compose the DAG plugin** and how the plugin behaves when specific upstream services (subagents, workflows) are absent.

## Question

How does the DAG plugin become available across presets?

**Sub-questions:**

1. **Composition strategy**: Should the DAG plugin be composed at the **bundle level** or at the **preset level**?
2. **Graceful degradation**: When a preset has no subagents or workflows, should the DAG plugin still register?
3. **Data-agent integration**: Should the DAG plugin consume `dsh-phase-gate` events to show phase progression?
4. **New preset or patch existing?**: Should we create new presets or patch existing ones?

## Resolution

### Q1: 方案 A — 新建独立 Bundle

创建 `packages/bundle/dag/`，其 `cordis.patch.yml`：
- `disabled: true` 禁用 host 级 `tool-todo`
- `insert` 插入 `tool-dag-task` 行

Profile 在 bundle 列表中添加 `dag` bundle 即可启用。

**理由**：
1. 零上游修改 — 纯增量代码，不碰 base bundle、不碰任何 preset 的 `agent.cordis.yml`
2. 遵循 data-agent bundle 先例 — `packages/bundle/data-agent/` 即独立 bundle
3. tool-todo 的状态模式证明可行 — DAG 插件不需要 isolate realm，可作为 host 级 loose row，per-session 状态通过 session events（`exec.agent.session.append()`）管理
4. Profile opt-in 是正确粒度 — 不是所有 profile 都需要 DAG；bundle 让选择权留在 profile 层
5. 未来可升入 base — 稳定后可合入 base bundle，但现在作独立 bundle 风险最低

**技术细节**：现有 preset（standard/code/cordis）在 `agent.cordis.yml` 中重挂了 `tool-todo`。bundle 级 disable 无法触及 preset 级重挂。解法：DAG 插件调用 `ctx.tools.restrict()` 将 `todo_write` 从模型可见工具集中过滤。即使 preset 重挂了 tool-todo，模型也无法调用它。

### Q2: 无条件注册，自然降级

DAG 工具在所有 preset 中均可用。**任务编排是通用 Agent 能力，不存在不需要任务编排的场景。**

降级不是禁用，而是节点类型随可用服务自然缩减：
- standard/code/cordis：完整 DAG（任务 + 子代理 + 工作流节点）
- data-agent：任务节点（PG1 resolved 后增加 phase 节点）
- minimal/semantic-layer-mgmt：纯任务节点

各 preset 已有机制自然控制：
- Phase-gate 的 `ctx.tools.guard()` 白名单阻止未注册的工具（data-agent A/C）
- 无规划上下文的系统提示词使模型不会主动调用 DAG 工具（minimal）
- 两者均非 DAG 插件的职责

### Q3: Phase-gate 集成归入 data-agent map

**3a — UNIVERSAL 白名单**：`todo` → `dag_task_create`/`dag_task_update`/`dag_task_get`/`dag_task_list`。归入 data-agent map [PG1 Phase-gate session events 改造](../../../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)。

**3b — Phase 节点渲染**：Phase-gate 当前零 session events（Python rbi 移植遗留，非刻意架构选择）。无 session events → 无法作为 DAG 数据源。已在 data-agent map 开票：
- 调研：[research/phase-gate-session-events.md](../../../data-agent/research/phase-gate-session-events.md)
- Grilling：[PG1 Phase-gate session events 改造](../../../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)

**本 map 中任何 phase 节点渲染工作依赖 PG1 resolved。**

### Q4: 既不新建 preset 也不 patch 现有 preset

Bundle 层已解决分发问题。Profile 添加 bundle 是唯一配置步骤：

| Profile | Bundle 列表 |
|---------|------------|
| web | base → web-app → **dag** |
| headless | base → headless → **dag** |
| data-agent | base → data-agent → **dag** |

不需要创建 `dag-standard` 等新 preset，也不需要修改现有 preset。
