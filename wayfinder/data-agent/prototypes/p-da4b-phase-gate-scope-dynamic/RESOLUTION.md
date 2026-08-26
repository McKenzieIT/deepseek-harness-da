# P-DA4b Resolution — Phase-gate scope 动态化

## 决策总览

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | SQL_CONVENTIONS 动态化 | **从 ctx.schema.semanticRoot → config.yaml 动态组装** | P1 pipe 已将 semanticRoot 委托给 active scope；loadConfig 已有；零新依赖 |
| 2 | 通用方言 vs scope 特定 | **两层合成，保持精简**（engine key_differences + scope event_view；不重复 functions/cast/templates） | 方言规则不变（MaxCompute），变的只是 FROM 表名和 params 模板；完整速查表由 nl2sql-engine 独立注入，不重复 |
| 3 | State reset 触发方式 | **`scopes/active-changed` 事件监听**（phase-gate constructor） | 解耦：switch_scope 只做 setActive，phase-gate 自己清理自己 |
| 4 | Reset 范围 | **scope-bound data only**（保留 phase 位置 + budget 计数器） | phase 是 question-scoped；mid-INTERPRETATION switch 是合法操作 |
| 5 | Subagent scope binding | **不需要**（P-DA4 resolved: delegate_query 用 Nl2sqlEngine 传参隔离） | 非 subagent 无全局状态共享问题 |
| 6 | Fallback（无 scope） | **仅通用 conventions（无 event_view 行）** | 防 crash；conventions 仍提供方言语法；phase-gate 不硬依赖 scope |

## 架构

```
system-prompt/assemble (GENERATION phase)
│
├── ctx.schema.semanticRoot       ← P1 pipe: delegates to active scope
│   └── resolveSemanticLayer()
│       └── loadConfig(layerDir)  ← config.yaml
│           ├── event_view.full_name
│           ├── event_view.params_extract_template
│           └── partition.field / partition.format
│
├── loadConventions('maxcompute') ← generic engine conventions (cached)
│   └── key_differences[]
│
└── assembleSqlConventions(scopeInput)  ← pure function → string
    └── sections.push({ name: 'sql-conventions', text: ... })
```

```
scopes/active-changed (event)
│
└── PhaseGate listener (constructor-wired)
    └── for each active session:
        └── resetScopeSensitiveState(state, newScopeId)
            ├── clear: last_sql, candidate_tables, event_params, ...
            └── preserve: current_phase, llm_call_count, turn_count, ...
```

## 实现细节

### §1 SQL_CONVENTIONS 动态化

**Before** (phase-gate.ts:120):
```ts
const SQL_CONVENTIONS = 'SQL conventions (MaxCompute/hive dialect): ... FROM ieu_ods.ods_10000251_all_view ...'
```

**After**:
```ts
// In system-prompt/assemble, when phase === Phase.GENERATION:
const scopeInput = extractScopeConventions(this.ctx.schema?.semanticRoot ?? '')
sections.push({ name: 'sql-conventions', text: assembleSqlConventions(scopeInput) })
```

Key properties:
- `extractScopeConventions` is a pure function: semanticRoot → ScopeConventionsInput | null
- `assembleSqlConventions` is a pure function: ScopeConventionsInput | null → string
- No new Cordis service dependency; uses existing `ctx.schema.semanticRoot` (P1 pipe)
- `loadConventions` is already cached (module-level singleton)
- `loadConfig` is cheap (file read, YAML parse); called once per GENERATION turn's system-prompt assembly — typically 1-5 times per question

### §2 State reset

**Trigger**: `ctx.on('scopes/active-changed', handler)` in PhaseGate constructor.

**Reset fields** (scope-bound data):
- `scope_id` → new scope
- `last_sql`, `last_query_outcome`, `last_failure_kind`, `last_query_error` → null
- `self_evolution_table` → null
- `last_critique`, `last_quality` → null
- `candidate_tables`, `event_params`, `partition_cols` → empty Set
- `last_search_empty`, `last_retrieve_empty` → true
- `definition_loaded` → false

**Preserved fields** (question-scoped):
- `current_phase`, `phase_idx`, `phase_attempts`, `fallback_count`
- `llm_call_count`, `exec_count`, `turn_count`, `step_count`
- `delivery_started`, `awaiting_clarification`
- `phase_output`, `subquestions`
- `honest_decline_reason`, `cancelled`, `cancelled_reason`
- `prior_status`, `stall_timer`, `execution_auto_advance`

**Edge case**: `scopeId === undefined` (clearActive) → no-op. A cleared scope is not actionable; the model can't generate SQL without a scope. The grounding backstop (definition_loaded=false + last_search_empty=true) will honest_decline if GENERATION is attempted.

### §3 Subagent scope binding — MOOT

P-DA4 resolved: `delegate_query` directly instantiates `Nl2sqlEngine` with the target scope's corpus/retrieval linker via parameters. No subagent is spawned; no `ctx.scopes.active()` is read by the delegated engine. The original P-DA4b §3 concern is fully addressed by the P-DA4 architecture.

## 实现位置

All changes land in `packages/data/phase-gate/`:
- `src/dynamic-conventions.ts` — new file (pure functions)
- `src/state-reset.ts` — new file (pure function + type)
- `src/phase-gate.ts` — 4 patches (delete const, add imports, modify assemble, add listener)
- `src/types.ts` — PHASE_TOOLS whitelist additions (switch_scope, delegate_query, resolve_scope)

## 约束验证

- ✅ additive-only (new files + small patches to phase-gate.ts; no core edits)
- ✅ 不改 scope-registry API (only listens to existing event)
- ✅ conventions 动态化不破坏 nl2sql-engine 消费 (nl2sql-engine imports `loadConventions` + `renderConventionsPrompt` independently; phase-gate assembles its own conventions string — two independent consumers of the same data source)
- ✅ 无 subagent scope isolation concern (delegate_query = Nl2sqlEngine direct call)

## 后续

- PHASE_TOOLS whitelist additions (`switch_scope`, `delegate_query`, `resolve_scope`) ship with the P-DA4 tool-scope-routing package — they reference names here but register the tools there.
- Performance: `loadConfig` does a file read per GENERATION assemble. If this becomes hot (unlikely — 1-5 per question), add a scope-epoch-keyed cache (same pattern as SemanticLayerService.scopeEpoch).
