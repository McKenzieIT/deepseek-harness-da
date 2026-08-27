# D5b — phase-scoped tool visibility (proactive guard)

**Type**: enhancement（agent-loop / tools 框架级改动）
**Phase**: misc
**Status**: Closed
**Resolved**: 2026-08-27 — already implemented (Approach A: filter in `onAssemble`)
**Graduated from**: present-delivery-tools ship session（2026-08-26）——模型在 UNDERSTANDING 阶段误调用 INTERPRETATION 工具 `present_decomposition`，被 reactive guard 拦截但浪费 1 个 LLM step。

**Question**: 将当前 reactive-only 的 phase-gate tool guard（事后拦截）升级为 proactive guard（事前隐藏）——只向 LLM 发送当前 phase 白名单内的工具定义，使模型无法"看到"非当前阶段的工具。

## 背景

当前架构：
- `ctx.tools.guard` hook（`phase-gate.ts:171`）在 tool execute 前检查白名单，reject 非法调用
- `agent-loop/src/agent.ts:341` 将 `assembly.tools`（全部注册工具）发送给 LLM
- 模型始终看到所有工具的 name/description/parameters（~15 个 tool definitions）
- 模型在非对应阶段尝试调用工具 → guard 拦截 → 模型收到 error → 继续 → 浪费 1 LLM step + tokens

## 期望行为

模型在每个阶段只看到该阶段白名单内的工具定义：
- UNDERSTANDING：search_data_sources, load_table_definition, load_event_definition, load_table_dimensions, save_accumulated_definition, + UNIVERSAL_TOOLS
- GENERATION：critique_sql_tool, evaluate_sql_quality, load_*, update_table_config, + UNIVERSAL_TOOLS
- EXECUTION：query_data, + UNIVERSAL_TOOLS
- INTERPRETATION：present_decomposition, present_table, compute, record_template_usage, suggest_followups, + UNIVERSAL_TOOLS

## 设计约束

1. **Phase 切换时机**：phase advance 发生在 `onTurnStopping`（step 结束后）或 `onPreStep`（下一步开始前）。tool list 在 `buildRequest` 时确定。如果 advance 发生在 step 中间（不应该，但需验证），tool list 可能 stale。
2. **COMPLETE/DECLINED 状态**：当 `current_phase` 为非 PhaseType 值时，tool list 应 fallback 到空（turn 即将结束，不需要工具）或 UNIVERSAL_TOOLS only。
3. **`system-prompt/assemble` 已有按 phase 切换 section 的先例**（B14 clamping）——tool filtering 可镜像此 pattern。
4. **非 data-agent preset 不受影响**：filtering 应只在 phase-gate 注册的 agent 上生效。无 phase-gate 的 agent 保持全量 tool list。
5. **`restrict()` API**（`packages/core/tools/src/index.ts:1091`）已存在静态限制能力——需评估是否可复用为 per-step 动态限制。
6. **Streaming 约束**：tool definitions 在 LLM request header 中发送，step 中途不可改。保证 filter 只在 `buildRequest` 时（step 开始）确定即可。

## 实现方向（待 research 确认）

**方案 A — `system-prompt/assemble` waterfall 中 filter tools**：
- 在现有 `onAssemble` hook 中，根据 `current_phase` 过滤 `assembly.tools`
- 优点：集中在 phase-gate 内，不改框架
- 风险：需确认 `PromptAssembly.tools` 是否可在 waterfall 中 mutate

**方案 B — 动态 `restrict()` 调用**：
- 在 `onPreStep` 中调用 `ctx.tools.restrict(PHASE_TOOLS[phase])` 设置当前 step 可见工具
- 优点：复用已有 API
- 风险：`restrict()` 可能是 static/one-shot 设计，需确认是否支持 per-step 动态

**方案 C — agent-loop 层增加 filter hook**：
- 在 `buildRequest` 中增加 `tools/filter` waterfall hook
- 优点：通用能力，其他 plugin 也可用
- 风险：框架改动面大

## Blocked by

无。

## 关联

- D5（phase-gate tool guard 原始设计）——本票是 D5 的 proactive 升级
- present-delivery-tools（2026-08-26）——触发本票的实际问题
- PHASE_TOOLS whitelist（`packages/data/phase-gate/src/types.ts`）——filter 的数据源
- `assembly.tools`（`packages/core/agent-loop/src/agent.ts:341`）——filter 的注入点

## Resolution

**Approach A was chosen and is already live** — tool filtering in the existing `onAssemble` hook (`phase-gate.ts:617-627`). The implementation:

1. Reads `current_phase` from the per-agent session state
2. Resolves the whitelist: `PHASE_TOOLS[phase]` for active phases, `UNIVERSAL_TOOLS` for terminal states (COMPLETE/DECLINED)
3. Filters `merged.tools` (the full assembly) down to only matching names
4. Non-phase-gate agents (`s === null`) get the full tool list unchanged

**Design constraints satisfied:**
- Constraint 1 (timing): `onAssemble` runs inside `preStep` → `buildRequest`, so the phase is always current at step start. Phase advances happen at `onTurnStopping` or `onPreStep` — both before the next `assemble` call.
- Constraint 2 (terminals): Explicit handling — COMPLETE/DECLINED → UNIVERSAL_TOOLS only.
- Constraint 3 (mirror pattern): Yes — tool filtering sits alongside the existing phase-instruction injection in the same `onAssemble` handler.
- Constraint 4 (non-phase-gate): The `s === null` branch passes tools through unchanged.
- Constraint 5 (`restrict()` API): Not used — `restrict()` validates against registered names and is scoped-layer-based, making per-step dynamic use awkward. Direct filtering in the waterfall is simpler and framework-local.
- Constraint 6 (streaming): Filter runs once at assembly time (before `buildRequest` freezes the request), not mid-stream.

**Tests** (9 cases in `phase-gate.spec.ts:1488-1650`):
- Per-phase visibility for all 4 phases
- Terminal state (COMPLETE, DECLINED) → UNIVERSAL_TOOLS only
- Non-phase-gate agent pass-through
- Reactive guard defense-in-depth still active
- Deny-by-default for tools not in any whitelist

## Acceptance criteria

1. 模型在 UNDERSTANDING 阶段的 LLM request 中不包含 `present_decomposition` / `present_table` / `suggest_followups` / `query_data` / `critique_sql_tool` / `evaluate_sql_quality` 的 tool definitions
2. 各阶段只包含 `PHASE_TOOLS[phase]` 中列出的工具
3. Reactive guard（`ctx.tools.guard`）保留作为 defense-in-depth（不移除）
4. 非 phase-gate agent 不受影响
5. 现有测试全绿 + 新增测试验证 tool list 按 phase 变化
