# P-DA4b — Phase-gate scope 动态化

**Type**: prototype
**Phase**: misc
**Status**: open
**Assignee**: (unclaimed)
**Blocking**: 无硬阻塞
**Blocked by**: [P-DA4](P-DA4-scope-routing-tools.md)（工具 + 兜底机制确定后本票才有明确接线点）
**Related**: [G-DA5](G-DA5-per-question-scope-routing.md)（resolved，设计决策），[P13b](../phase-3/P13b-nl2sql-engine-prod-hardening.md)（conventions loader）

## Question

G-DA5 确定 scope 切换后 phase-gate 需要正确响应。本票实现三项配套改动：

1. **SQL_CONVENTIONS 动态化**：`phase-gate.ts:119` 硬编码 `ieu_ods.ods_10000251_all_view`（K11）注入 GENERATION system prompt。改为从 conventions seam（`query-maxcompute/conventions.yaml` + scope config `event_view`）按 active scope 动态组装。
2. **Scope 切换后 state reset**：`switch_scope` 调用后自动 cleanup phase-gate 脏字段（`last_sql`、`candidate_tables`、`event_params`、`last_critique`、`last_quality`、`definition_loaded`），防止旧 scope 的状态污染新 scope 查询。F2 same-source gate 同步 reset。
3. **Subagent scope binding**：`delegate_query` spawn 的 subagent 如何获得正确 scope 而不依赖 `ctx.scopes.active()` global——per-call 参数覆写 or subagent-local scope override。

## 现状

- `SQL_CONVENTIONS` 是一个 `const` 字符串（`phase-gate.ts:119`），硬编码 K11 的 `ieu_ods.ods_10000251_all_view` 和 `GET_JSON_OBJECT(params, '$.{field_name}')` 模板
- 动态 conventions 数据已有：`packages/query/query-maxcompute/conventions.yaml`（通用 MaxCompute 方言）+ 每个 scope 的 `config.yaml`（`event_view.full_name`、`params_extract_template`）
- phase-gate 不监听 `scopes/active-changed` 事件
- `PhaseGateState.scope_id` 是 dead field（不消费）
- subagent `spawn-in-process` 与父 agent 共享 `ctx.scopes`（global singleton）

## 实现方向

### SQL_CONVENTIONS 动态化
- 删除 `const SQL_CONVENTIONS` 硬编码
- 在 `onSystemPromptAssemble`（GENERATION phase）中从 `ctx.schema`（active scope 的 config）+ conventions seam 动态组装 SQL conventions section
- 数据源：`ctx.schema` 的 scope config → `event_view.full_name` + `params_extract_template`；conventions.yaml → 通用 MaxCompute 语法规则

### State reset
- phase-gate 监听 `scopes/active-changed` 事件（或 P-DA4 的 `switch_scope` 工具内部调用 reset）
- reset = `freshPhaseGateState(newScopeId)` 中的部分字段清零（保留 `turn_count`/`llm_call_count` 等会话级计数器？或全部 reset？）
- F2 same-source：`last_sql = null` 即可解除 gate

### Subagent scope binding
- 取决于 P-DA4 grilling 结论（甲/乙/丙）
- 最可能路径：subagent 启动时接收 `semanticRoot` 参数 → 其 `ctx.schema.semanticRoot` 被显式设定而非读 global active

## 约束

- additive-only
- 不改 scope-registry API
- conventions 动态化不能破坏 nl2sql-engine 的 conventions 消费（两者独立注入，不冲突）

## Out of scope

- `switch_scope` / `delegate_query` 工具本身（→ P-DA4）
- P9 access gate
- scope CRUD
