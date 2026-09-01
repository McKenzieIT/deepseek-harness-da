# GA-GT1 — 多租户隔离 / per-request scope 重构

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) · [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) — C1+H6 / arch G5 · **critical**

**Problem**: ScopeRegistry 用全局唯一 `active` 指针（共享 YAML，`load()` 每次 readFileSync），无 per-request/tenant 上下文（全仓 grep tenant/sessionId/AsyncLocalStorage 零命中）→ 并发租户竞态、租户 A 读到租户 B 的 semantic root。多租户 SaaS 不可行；H6 跨租户泄漏级联（scope-hint/list_scopes 暴露全部 scope；tool-retrieve enrichedLinkers 无 corpusVersion 校验；evidence-query eval store 无 scope 字段）是其子症状。

**Scope**:
- per-request scope context（AsyncLocalStorage 键控 tenant+session，或显式 scopeId 贯穿调用链），移除全局 `active` 指针；registry 按 id 解析 scope 定义
- `ScopeDefinition` 加 `tenant` 字段；list/get/setActive 按 tenant 过滤
- `SemanticLayerService` load/getRelationGraph/acquireSnapshot 加 scopeId 参数，从 `ctx.scopes.get(scopeId)` 解析
- `tool-retrieve` 的 `enrichedLinkers` WeakMap 加 `corpusVersion()` 校验（H6）
- `evidence-query` eval store 按 `scope_id` 盖章+过滤，scope 切换 re-resolve resultsDir（H6）
- `InProcRetrieval` 改可 re-probe 的 `SchemaCorpusSource`（H6）

**Blocked by**: 无  ·  **关联**: GA-GT2、GA-GRILL3、CL14、[R9 context-layer](../../research/r9-context-layer-frontier-audit.md)
**Key files**: packages/data/scope-registry/src/index.ts:142,206; packages/data/semantic-layer/src/index.ts:530,539; packages/data/tool-scope-routing/src/scope-hint.ts:66; packages/data/tool-retrieve/src/index.ts:134; packages/data/evidence-query/src/index.ts:245; packages/retrieval/retrieval-inproc/src/index.ts:57
