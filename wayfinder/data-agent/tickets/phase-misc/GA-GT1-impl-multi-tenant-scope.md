# GA-GT1-impl — 多租户 scope 重构实施（Phase 1+2）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-01 claude session — A impl (dual-line)  ·  **Resolved**: 2026-09-02
**Source**: [GA-GT1 grilling](GA-GT1-multi-tenant-scope.md)（resolved 2026-09-01，D1-D6 锁定）
**Priority**: critical
**Blocked by**: 无（GA-GT1 grilling 已 resolved）

## Question

实施 GA-GT1 的 Phase 1+2（additive 容量 + 调用方迁移），`active` 作兼容回退**保留**——纯叠加、不删、不 break 单 scope。Phase 3+4（翻默认 + 删 `active`）拆 GA-GT1-cleanup 后续票。

## Scope

### Phase 1 — additive 容量（零 break）

**ScopeRegistry**（`packages/data/scope-registry/src/index.ts`）：
- `ScopeDefinition` 加 `tenant?: string`（**Phase 1 optional**，现存单 scope 无 tenant = `"default"`；Phase 3 改 required）。
- 新增 `forTenant(tenant, scopeId?)` + `list(tenant?)`（按 tenant 过滤）；`get(id)` 不变。
- **保留** `active()`/`activeId()`/`setActive()`/`clearActive()`（deprecated，作兼容回退；Phase 4 删）。

**SemanticLayerService**（`packages/data/semantic-layer/src/index.ts`）：
- 读方法加 `scopeId?: string`（**optional，undefined 时回退 `active()`**，保现状行为）：`loadTableDefinition(name, scopeId?)` / `getRelationGraph(scopeId?)` / `acquireSnapshot(scopeId?)` / `loadRetrievalCorpus(scopeId?)` / `corpusVersion(scopeId?)`。
- per-scope LRU cache（`Map<scopeId, { graph, version }>`）叠加在现有 instance cache 旁（Phase 1 可选优化；`scopeEpoch` 暂留作 fallback 路径失效，Phase 4 删）。

**H6 四处 cascade**（全 = β + per-scope + corpusVersion，D5）：
1. `tool-retrieve` enrichedLinkers（`packages/data/tool-retrieve/src/index.ts`）：加 corpusVersion 校验（pre-existing stale-on-write bug）+ 按 (schema, scopeId) 键控 per-scope；同款修 `tool-search-data-sources` / `tool-search-schema`。
2. `evidence-query` eval store（`packages/data/evidence-query/src/index.ts`）：加 `scope_id` 到 `EvalResultRecord` + query 按 scope_id 过滤；`EvidenceQueryService` schema 读方法加 scopeId；resultsDir per-scope 子目录 `<resultsDir>/<scopeId>/*.jsonl`。
3. `InProcRetrieval`（`packages/retrieval/retrieval-inproc/src/index.ts`）：lazy per-scope 从 `ctx.schema.loadRetrievalCorpus(scopeId)` 建 + corpusVersion 失效重建，per-scope retriever cache。
4. `scope-hint`（`packages/data/tool-scope-routing/src/scope-hint.ts`）：`buildSummaries`/`buildAliasHint` 按 session tenant 过滤（只列当前 tenant 的 scope，不泄漏给 LLM system prompt）。

### Phase 2 — 调用方迁移（贯穿 scopeId）

- `ToolExecutionInput`（`packages/core/agent-loop/src/tool-calls.ts` 的 `defineTool` 框架）加 `scopeId` 字段；`executeToolCalls` 从 `agent.session` 填（session-bound scopeId，D4；`ReactLoopAgent` 在 `packages/core/agent-loop/src/agent.ts` turn/step 解析）。
- 15 call site（tools/services）传 scopeId：`ctx.schema.X(name, scopeId)`。3 个有 live caller 的方法（`getRelationGraph`×7 / `corpusVersion`×3 / `loadRetrievalCorpus`×5）+ 2 前向（`loadTableDefinition`/`acquireSnapshot`，0 caller）签名加 scopeId。
- eval/CLI（`packages/eval/eval-cli`、`eval-runner-service`）显式配 scopeId（D3 (ii)，无 default 指针）。
- 未迁移 caller 仍回退 `active()`（兼容）。

## 跨线耦合（必须处理）

`Nl2sqlEngineService.getConventions()`（`packages/data/nl2sql-engine/src/index.ts`，GT2-D1 落地）构造时 `this.conventions = ctx.query.getConventions()` 缓存——多租户坏（`ctx.query` 单例）。Phase 1/2 改 per-request-scope 解析（从 reqCtx 拿 scopeId，`ctx.query.getConventions(scopeId)` 或 per-scope conventions cache），**不构造时缓存**。

## Out of scope（→ GA-GT1-cleanup 后续票）

- Phase 3：scopeId 改 required（无 fallback）；`active`/`setActive` warn-on-use；现存单 scope 赋正式 default tenant。
- Phase 4：移除 `active()/setActive()/clearActive()`；`tenant` 必填；移除 `scopeEpoch`。等 Phase 1+2 生产验证后。

## 规则

- **additive-only**：Phase 1+2 不删任何东西（`active` 保留作 fallback）；不改 core。
- **preserve GA-EXP2 WIP**：`engine.ts` 的 `promptBuilder` + eval-cli/eval-runner 改动 + 未追踪 eval 测试文件（`stand-in-odps.spec.ts` / `per-scope-maxc-config.spec.ts`）——别碰、别修（用户并行 eval 工作，本来就编译不过/测不过）。
- 每 subagent/step：`pnpm tsc --noEmit` 0 新错 + vitest 无新回归 + additive-only。
- 不 auto-commit（工作树有 GA-EXP2 WIP，per-task commit 会 entangle；留 diff review，最后干净提交）。

## Key files

- `packages/data/scope-registry/src/index.ts`（D3 registry model）
- `packages/data/semantic-layer/src/index.ts`（D4 β consumption）
- `packages/data/tool-retrieve/src/index.ts`、`packages/data/tool-search-data-sources/src/index.ts`、`packages/data/tool-search-schema/src/index.ts`（D5.1 caches）
- `packages/data/evidence-query/src/index.ts`（D5.2 eval store）
- `packages/retrieval/retrieval-inproc/src/index.ts`（D5.3 re-probe）
- `packages/data/tool-scope-routing/src/scope-hint.ts`（D5.4 tenant-filter）
- `packages/core/agent-loop/src/agent.ts` + `tool-calls.ts`（D4 request entry + ToolExecutionInput）
- `packages/data/nl2sql-engine/src/index.ts`（跨线 getConventions）

## 关联

[GA-GT1 grilling](GA-GT1-multi-tenant-scope.md)（D1-D6 决策）、[GA-GT2-impl](GA-GT2-impl-engine-abstraction.md)（resolved，跨线 getConventions 耦合）、GA-GT1-cleanup（Phase 3+4，后续票，[已创建](GA-GT1-cleanup-multi-tenant-scope.md)）。

## Resolution (2026-09-02)

Phase 1+2（additive 容量 + 调用方迁移 + 跨线 getConventions）实施完成，`active` 作兼容回退保留（纯叠加、不删、不 break 单 scope）。每阶段两阶段 subagent review（spec + code-quality）+ tsc/vitest gate 全过；GA-EXP2 WIP 全程保留（engine.ts promptBuilder / eval-cli EXP2_ARM / eval-runner sql_semantic_judge / 未追踪 eval 测试文件——零回退零 entangle）。

**实施（additive-only）**：
- **Phase 1 ScopeRegistry**：`ScopeDefinition` 加 `tenant?`（optional，现存 scope 无 tenant="default"）+ `forTenant(tenant,scopeId?)`/`list(tenant?)`；`active` 家族保留 `@deprecated`；`withTenant` 在读边界解析缺失→"default"（保旧文件 round-trip 形状）。
- **Phase 2 SemanticLayerService**：5 读方法加 `scopeId?`（undefined→active 回退）+ per-scope LRU `graphCacheByScope`（**root-check 防 I-1 重注册泄漏**）+ `corpusVersionForRoot` 助手；`scopeEpoch` 保留（Phase 4 删）。
- **Phase 3 H6 四处级联**：(1) enrichedLinkers×3（tool-retrieve/search-data-sources/search-schema）corpusVersion 校验 + per-scope 键控；(2) evidence-query `scope_id`+query 过滤+resultsDir per-scope 子目录+service 读方法 scopeId+`resolveRoot` fail-loud；(3) InProcRetrieval lazy per-scope re-probe + corpusVersion 失效重建；(4) scope-hint 按 session tenant 过滤（alias-hint 改从 filtered summaries 派生 active，不泄漏外 tenant）。
- **Phase 4 ToolExecutionInput.scopeId**：`ToolExecutionInput` 加 `scopeId?`；`executeToolCalls` 从 `agent.options.scopeId` 填（session-bound，选 AgentOptions 而非 Session——后者私有构造+storage 契约侵入大）；`createExecution` base pick 传播到 ToolRunContext；dormant 直至 5d。
- **Phase 5 调用方迁移**：5a 公开 `resolveScopeRoot` 作共享 seam；5b 4 per-scope 缓存加 `entry.root` 检查（**#19/#22 carry-forward 解决——TDD red→green 功能证明重注册跨租户泄漏闭合，parity Phase 2 I-1**）+ execute 透传 `exec.scopeId`；5c 4 外部 call site（tool-search-data-sources/tool-resolve-term/schema-gateway×2）传 scopeId；5d eval/CLI 显式配 scopeId（D3ii 无 default 指针——boot/runBatch 未提供则 throw）+ EXP2_ARM 全程保留。
- **Phase 6 跨线 getConventions**：`Nl2sqlEngineService` 去构造时缓存，`getConventions(scopeId?)` per-call → `ctx.query.getConventions(scopeId)`；`QueryEngine.getConventions` 加 `scopeId?`（concrete override 未碰——TS 允许 `()` override `(scopeId?)`，零 query-maxcompute 纠缠）；engine.ts promptBuilder 未碰。

**carry-forward（Phase 5+，tracked）**：
- #25 nested scopeId propagation in code-mode `run_code` 子调度（code-mode.ts:475——子 ToolExecutionInput 未传播 scopeId；dormant 直至 nested scoped dispatch live）。
- #32 harness-responder.ts D3ii（`HarnessAgentResponder.bootContext` 硬编码 'k11'；G1b 实验路径，~3 行修复，G1b land 时做）。

**→ GA-GT1-cleanup 前置门**：Phase 3+4（scopeId required + active warn-on-use + 现存 scope 赋正式 default tenant + 删 active/setActive/clearActive + tenant 必填 + 移除 scopeEpoch）= breaking change。**前置条件**：①Phase 1+2 生产验证（多租户并发无泄漏/竞态）+ ②全 callers 迁移（含 #25 nested + #32 harness-responder carry-forward）+ ③用户授权 breaking change。满足后开 [GA-GT1-cleanup](GA-GT1-cleanup-multi-tenant-scope.md) 票。
