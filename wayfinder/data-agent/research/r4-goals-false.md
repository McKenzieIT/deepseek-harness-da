# R4 · agent-spine-demo `goals:false` 抑制（research）

> 研究问题：`goals:false` 是否完全抑制 spine 的 goal mount？agent-spine-demo README 自陈 "most of the spine set is fixed in code"——goal 是写死在 code 里（config 无效）还是 config 可抑？给 Q8（当前=保留 goal/todo/plan 不禁用）依据：若 future 要禁 goal，`goals:false` 够不够，还是要 code 改。

## TL;DR

**`goals:false` 完全抑制 agent-spine-demo spine 的 goal mount——config 被尊重，goal 非写死。** spine 的 `apply()` 用 `if (config.goals !== undefined && config.goals !== false)` 守卫门控三件 goal 插件（`GoalService`/`ctx.goals` 域 + `toolGoal` model-facing `create_goal`/`get_goal`/`update_goal` 工具 + `goalSession` 同会话 round driver）；`goals:false`（或省略）三件全不挂——既无 `ctx.goals` 服务、也无 model-facing goal 工具、也无 round driver。测试钉死：`goals:false` → `ctx.get('goals')` undefined + `ctx.tools.get('get_goal')` undefined。

README 自陈 "most of the spine set is fixed in code" 的 "fixed" **仅指 core 服务**（loop/LLM/session/system-prompt/tools/agent 等 `apply()` 无条件挂的）；同句明示 "config can omit bundled **goals**, skills, bash, and task-control tools"——goal 是显式可 omit 项，非 fixed。换 loop / 剔另一 spine core 成员才需换 bundle（code 改）。

**shipped data-agent 关键 nuance**：shipped CLI 模式（`base` + `data-agent` patch）**不**经 agent-spine-demo 的 `apply()`，而是把 goal 作 4 条独立 patch 行（`goal`/`goal-round-driver`/`command-goal`/`tool-goal`）直挂到 base `cordis.patch.yml`——无 `goals:false` 配置位。但禁用等价机制 = patch 层对这 4 行加 `disabled: true`（**config-only、零 code 改**，同 data-agent 现已对 `tool-str-replace-editor`/`tool-ralph` 的做法）。若 future data-agent 改走 agent-spine-demo bundle 组合，`goals:false` 一 flag 即可。

→ **Q8 依据**：禁 goal **不需 code 改**，纯 config（agent-spine-demo 走 `goals:false`；shipped base+patch 走 patch 行 `disabled:true`）。Q8「保留不禁用」是选择，非机械约束。

## 1. 实证（code-read；primary source = harness 源）

### 1.1 spine 的 goal mount 守卫
`packages/examples/agent-spine-demo/src/index.ts:239-242`（`apply()` 内）：
```ts
if (config.goals !== undefined && config.goals !== false) {
  ctx.plugin(GoalService, config.goals.domain ?? {})
  ctx.plugin(toolGoal, config.goals.tool ?? {})
  ctx.plugin(goalSession)
}
```
- 守卫 = `goals` 非 `undefined` 且非 `false` 才挂。`goals:false` 或省略 → 三件 goal 插件（`GoalService`=`@deepseek-ai/dsh-goal`/`ctx.goals`、`toolGoal`=`@deepseek-ai/dsh-tool-goal` model-facing、`goalSession`=`@deepseek-ai/dsh-goal-round-driver`）全跳过。
- Config schema 佐证：`src/index.ts:173` `goals: z.union([z.const(false), GoalConfigSchema])`；`src/index.ts:128` `goals?: GoalConfig | false`（注释 "Opt-in ... set false or omit to leave it unmounted"）。
- `pickSpineConfig`（`src/index.ts:198`）透传 `goals`，不强制 opt-in。

### 1.2 README "fixed in code" 的真实边界
`packages/examples/agent-spine-demo/README.md:82`（Known Limitations）原文：
> Most of the spine set is fixed in code — `apply()` always mounts the **core services**; config can omit bundled **goals, skills, bash, and task-control tools**, but swapping the loop or dropping another spine member means composing a different bundle.
- "fixed" = core 服务（loop/LLM/session/system-prompt/tools/agent 等 `apply()` 无条件挂的）；**goal 显式列为 config 可 omit 项**。换 loop / 剔 core 成员才需换 bundle。
- 同节第二条 limitation 同向：invariant service/companions 是 fixed-member（`invariants.enabled:false` 抑 checks 不卸 service/companion 注册）——但 goal **不**在此列，goal 是 omittable。

### 1.3 测试钉死 goals:false 抑制
`packages/examples/agent-spine-demo/tests/agent-core.spec.ts`：
- L148-162 'brings up the full default spine'：`mount({ workspaceContext: false })`（**goals 省略**）→ `expect(ctx.get('goals')).toBeUndefined()`（L162）→ **默认省略 = goal 不挂**。
- L210-214 'accepts an explicit false goal composition without mounting it'：`mount({ workspaceContext: false, goals: false })`（L211）→ `expect(ctx.get('goals')).toBeUndefined()`（L212）+ `expect(ctx.tools.get('get_goal')).toBeUndefined()`（L213）→ **`goals:false` 完全抑制：无 service、无 model-facing 工具**。
- L189-204 'opts into the configured persisted-goal domain'：`goals: { domain: {...}, tool: {...} }` → `create_goal`/`get_goal`/`update_goal` 工具齐（L203-204）+ `tool:goal` prompt section 出 → 反向证 opt-in 才挂。
- L338-351 'uses owner defaults for a schema-bypassing empty goal opt-in'：`goals: {}` → `get_goal` defined（L351），`maxGoalRounds` 默认 256 → 空 opt-in 仍挂（owner 默认）。
- L749 `pickSpineConfig` 测试含 `goals: false as const` 透传。

### 1.4 goal mount 三件构成（无独立 mountGoal 函数）
`packages/goal/goal/README.md`：`dsh-goal` = `ctx.goals` event-sourced 同会话 goal 域（create/edit/pause/resume/complete/block/clear，`goal/change` 事件持久）。goal mount = 三 `ctx.plugin()`：
- `GoalService`（`@deepseek-ai/dsh-goal`）→ `ctx.goals` 服务；
- `toolGoal`（`@deepseek-ai/dsh-tool-goal`）→ model-facing `create_goal`/`get_goal`/`update_goal` 工具 + `tool:goal` prompt section；
- `goalSession`（`@deepseek-ai/dsh-goal-round-driver`）→ 同会话 goal-round driver（admit rounds）。
- grep `mountGoal` across `packages/`+`apps/` → 无此符号（goal mount 即三 `ctx.plugin`，非独立函数；config 守卫即唯一开关）。

### 1.5 shipped data-agent 的实际组合（非 agent-spine-demo）
`packages/bundle/base/cordis.patch.yml`（shipped CLI 共享 core，**不**用 agent-spine-demo 的 `apply()`）把 goal 作 4 条独立 patch 行直挂：
- L256-257 `- id: goal` / `name: '@deepseek-ai/dsh-goal'`
- L259-260 `- id: goal-round-driver` / `name: '@deepseek-ai/dsh-goal-round-driver'`
- L262 `- id: command-goal`（`/goal` slash 命令）
- L374 `- id: tool-goal`（`name: '@deepseek-ai/dsh-tool-goal'`，注释 "Persisted same-session goals reach the model and the slash menu here"）
→ base 无 `goals:false` 配置位（那是 agent-spine-demo bundle plugin 的 Config 字段）；goal 行恒挂。

`packages/bundle/data-agent/cordis.patch.yml`（data-agent patch 叠 base）：grep "goal" 仅命中 disable 机制注释（L11/L15），**未触任何 goal 行** → data-agent 承袭 base 的 4 条 goal 行 = **goal 当前已挂**（与 Q8「保留」一致）。data-agent 现仅 `disabled: true` 两行：`tool-str-replace-editor`（L34）、`tool-ralph`（L37）。

`apps/` grep `goals|mountGoal` → 无命中（无 app 设 `goals:false`）。`packages/bundle` grep `agent-spine-demo` → 无命中（shipped 模式不经 spine demo bundle）。

## 2. 对 Q8 的意义

Q8 当前决策 = **保留 goal/todo/plan 不禁用**，四阶段 Pipeline 作默认编排。本 research 给依据：

1. **机械上禁 goal 不需 code 改**——纯 config：
   - 若走 **agent-spine-demo** bundle 组合：`goals: false`（一 flag）即完全抑制 goal mount（service + model-facing 工具 + round driver + prompt section 全卸），实测钉死（L210-214）。
   - 若走 shipped **base + patch** 组合（data-agent 现状）：无 `goals:false` 位，但等价 = patch 层对 4 条 goal 行（`goal`/`goal-round-driver`/`command-goal`/`tool-goal`）加 `disabled: true`，config-only 零 code 改，同 data-agent 现对 `tool-str-replace-editor`/`tool-ralph` 的做法。
   - **todo/plan 同理另议**：`tool-todo`（base 行）、`plan-mode`（base 行）是独立行，禁用各加 `disabled:true`（agent-spine-demo 的 `Config` 无 todo/plan 的统一 flag——todo/plan 非 spine demo 的 opt-in 项，是 base 行）。
2. **"most of the spine set is fixed in code" 不指 goal**——README:82 明示 goal 是 config 可 omit 项；fixed 仅 core 服务（loop 等）。ticket 问句的引文不构成 goal 写死的证据。
3. **data-agent 现状 goal 已挂**（承袭 base 行，patch 未禁）→ Q8「保留」与 shipped 形态一致，无额外接线成本。
4. **G1 实验路径**：G1（Pipeline vs goal/todo/plan）2×2 变体已 resolved 设计；其 B/D 变体（Planning 因子关 = goal/todo 不挂）届时用 patch `disabled:true`（shipped）或 `goals:false` + todo/plan disable（若走 spine demo）落地，零 code 改。Q8「对比作 ticket」= G1，已开。

→ **Q8 结论稳固**：保留不禁用是选择；若 future 要禁（G1 B/D 变体或他因），config 足矣，无 code 改门槛。

## 来源（Sources）

- **primary**（harness 源 code-read）：
  - `packages/examples/agent-spine-demo/src/index.ts:128,173,198,239-242`（`goals?: GoalConfig|false` Config + schema union + `apply()` goal mount 守卫 + `pickSpineConfig` 透传）。
  - `packages/examples/agent-spine-demo/README.md:82`（Known Limitation：fixed=core 服务，goal 显式可 omit）。
  - `packages/examples/agent-spine-demo/tests/agent-core.spec.ts:148-162,189-204,210-214,338-351,749`（goals 省略/false 不挂、opt-in 才挂、空 opt-in 默认挂、pickSpineConfig 透传 false 的测试钉死）。
  - `packages/bundle/base/cordis.patch.yml:256-262,374`（shipped core 把 goal 作 4 独立 patch 行直挂，无 `goals:false` 位）。
  - `packages/bundle/data-agent/cordis.patch.yml:11,15,34,37`（data-agent patch 未触 goal 行，仅 disable `tool-str-replace-editor`/`tool-ralph` → goal 承袭 base 已挂）。
  - `packages/goal/goal/README.md`（dsh-goal = `ctx.goals` 域；goal mount 三件构成，无独立 `mountGoal`）。
  - `apps/` grep `goals|mountGoal` 无命中；`packages/bundle` grep `agent-spine-demo` 无命中（shipped 模式不经 spine demo bundle）。
- **reverse-bi**：不 relevant——rbi 无 harness spine/`goals:false` 概念；rbi 用 `DataAgentPipeline` 四阶段，goal/todo/plan 非其编排原语（见 map ③ / P7）。本 note 纯 harness 源。
