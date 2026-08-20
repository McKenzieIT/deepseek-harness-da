# R4 — agent-spine-demo goals:false 抑制

**Type**: research
**Phase**: misc（低优先）
**Assignee**: wayfinder-subagent 2026-08-20
**Status**: Resolved (2026-08-20)

**Question**: `goals:false` 是否完全抑制 spine 的 goal mount（"most of the spine set is fixed in code"）？

**For**: Q8 若需禁 goal/（当前 Q8=保留，低优先）。

## Finding (resolved 2026-08-20)

**resolved: true。`goals:false` 完全抑制 agent-spine-demo spine 的 goal mount——config 被尊重，goal 非写死。**

依据（file:line）：
- `packages/examples/agent-spine-demo/src/index.ts:239-242`：`apply()` 用 `if (config.goals !== undefined && config.goals !== false)` 守卫门控三件 goal 插件（`GoalService`/`ctx.goals` + `toolGoal` model-facing `create_goal`/`get_goal`/`update_goal` + `goalSession` round driver）；`goals:false` 或省略 → 三件全不挂。Config schema `…:128` `goals?: GoalConfig|false`、`…:173` `z.union([z.const(false), GoalConfigSchema])`。
- `…/tests/agent-core.spec.ts:210-214`：`goals:false` → `ctx.get('goals')` undefined + `ctx.tools.get('get_goal')` undefined（钉死）；L148-162 省略亦不挂；L189-204/338-351 opt-in 才挂（空 `{}` 用 owner 默认 256）。
- `…/README.md:82`："most of the spine set is fixed in code" 的 fixed 仅指 core 服务（loop/LLM/session 等），同句明示 "config can omit bundled goals, skills, bash, and task-control tools"——goal 显式可 omit，非写死。

**shipped data-agent nuance**：`base` + `data-agent` patch 不经 agent-spine-demo `apply()`，而把 goal 作 4 条独立 patch 行（`packages/bundle/base/cordis.patch.yml:256-262,374`：`goal`/`goal-round-driver`/`command-goal`/`tool-goal`）直挂，无 `goals:false` 位。禁用等价 = patch 层对这 4 行加 `disabled:true`（config-only、零 code 改，同 data-agent 现对 `tool-str-replace-editor`/`tool-ralph` 的做法，见 `data-agent/cordis.patch.yml:34,37`）。`data-agent` patch 未触任何 goal 行 → goal 当前已挂（与 Q8 保留一致）。`apps/` grep `goals|mountGoal`、`packages/bundle` grep `agent-spine-demo` 均无命中。

→ **禁 goal 不需 code 改**。Q8「保留不禁用」是选择，非机械约束；future 禁（G1 B/D 变体等）config 足矣（agent-spine-demo 走 `goals:false`，shipped 走 patch 行 `disabled:true`）。todo/plan 同 patch 机制（`tool-todo`/`plan-mode` 独立 base 行）。

## Assets

- `wayfinder/data-agent/research/r4-goals-false.md`（cited note，含 TL;DR + 实证 file:line + 对 Q8 意义 + 来源）

## Unblocks

- 对 Q8 的意义：给 Q8（保留 goal/todo/plan 不禁用）机械依据——禁 goal 纯 config（agent-spine-demo `goals:false` 或 shipped patch 行 `disabled:true`），无 code 改门槛；Q8「保留」是选择非约束。G1（Pipeline vs goal/todo/plan 实验）已开 ticket 接对比（B/D 变体 Planning 因子关 = goal/todo 不挂，落地零 code 改）。
- 无新 ticket 毕业（null）：G1 已在 map 覆盖对比实验；todo/plan 禁用同 patch 机制不需单独 ticket。
