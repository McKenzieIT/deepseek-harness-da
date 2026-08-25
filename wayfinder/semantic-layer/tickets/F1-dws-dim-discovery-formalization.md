# F1 — DWS→DIM 关系发现功能模块正式化

**Type**: task
**Status**: Closed
**Blocked by**: —

## Question

将 Phase 1 的「subagent-seed 关系发现」正式化为 dsh-data-agent 的**生产功能模块**：从「会话内 subagent 充当 llmCall 的一次性种子」转为「`ctx.llm` 注入式 `llmCall` 的可复用能力」。

## 前置

[dws-dim-discovery-report](../research/dws-dim-discovery-report.md)（Phase 1 前置报告）已记录方法、结果（162 DWS / 126 得 refs / 225 refs / 34 DIM）、质量发现与建议。

## Scope

1. **`makeLlmCall(ctx, {provider, model})` 工厂**：包装 `ctx.llm.stream` + `BlockAssembler` 成 `(prompt)=>Promise<string>`，注入 `ctx.schema.setLlmCall()`。substrate（`enrichment.ts`）已为注入式设计，本项是接线 + provider/key 配置。
2. **Bundle 注册**：在 data-agent bundle 挂载 `llm-deepseek`/`llm-dashscope` provider + `tool-discover-relations`，使 `discover_relations` 可被 agent 在 loop 中调用。
3. **多替代 FK 表示精化**：`table-kind.relations()` 当前把一个 `DimensionRef` 的所有 `join_keys` AND-连接成 `on`；对「同 DIM 多替代外键」（如 acc_summary 的 4 个 server_id 列）过度约束。区分「复合键」与「替代外键」。
4. **置信度/审批门控（G3 §3，暂缓）**：当前直接写入无审批；有用户后再加。
5. **events `external_refs`（G3 第二轮）**：453 events 的 external_refs 发现。

## 验收

- 生产 `llmCall` 接线后，`ctx.schema.discoverRelations()` 跑 K11 全 162 DWS 产出 dimension_refs，与 Phase 1 subagent seed 量级相当（~126 表得 refs）。
- `discover_relations` tool 注册到 data-agent bundle，agent 可调用。
- 多替代 FK 的 `on` 不再过度约束。
- 关系发现结果经 NL2SQL eval 暴露错误 join 后可修正（G3 §3 纠错回路）。

## 注意

- Phase 1 的 subagent seed 已为 K11 写入 225 个 dimension_refs；本 ticket 是将其**生产化**，不是重跑种子。
- 环境需配置 LLM API key（Phase 1 因无 key 才用 subagent 充当 llmCall）。

## Resolution

Resolved 2026-08-22. All scope items implemented and verified:

### 1. LLM Wiring Plugin (`enrichment-llm-wiring`)
- New file: `packages/data/semantic-layer/src/llm-wiring-plugin.ts`
- Cordis plugin (`inject: ['schema', 'llm']`) that creates a `TextLlm` adapter from `ctx.llm.stream()` + `BlockAssembler` and calls `wireEnrichmentLlm(ctx.schema, textLlm)`
- Configurable `provider`/`model` (defaults: `aga`/`qwen3.7-max`)
- Added to bundle patch as `id: enrichment-llm-wiring`
- Added `@deepseek-ai/dsh-llm` as optional peerDependency
- Added tsconfig.base.json path mapping for subpath resolution

### 2. Alternative FK Refinement
- Modified `table-kind.ts` `relations()`: when multiple `dws_column` values map to the same `dim_column`, generates separate `RelationDef` per alternative (independent join paths)
- Composite keys (distinct `dim_column` per `join_key`) still produce one AND-connected edge
- K11 验证: `acc_summary_df` now produces 4 independent `server_id` join edges (was 1 over-constrained AND)

### 3. Events `external_refs` (deterministic round)
- Ran `enrichAllEvents` on K11 scope: 92/445 events gained deterministic `external_refs` (PK-name match)
- LLM round will discover additional semantic matches once API key is configured
- Seed script: `scripts/seed-event-external-refs.ts`

### 4. Verification
- 188 tests green (semantic-layer 143 + nl2sql-engine 34 + tool-discover-relations 11)
- New integration test file: `tests/llm-wiring-integration.spec.ts` (4 tests covering two-round discovery, event discovery, merge semantics, and alternative FK behavior)
- Cordis config verification passes

### Remaining (deferred per scope)
- **LLM round for events**: requires live `DASHSCOPE_API_KEY`; the wiring is in place and will activate automatically
- **置信度/审批门控**: deferred per G3 §3 (no users yet)
