# GA-GT1 — 多租户隔离 / per-request scope 重构

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-01 claude session — A grilling (dual-line)  ·  **Resolved**: 2026-09-01
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

---

## Grilling decisions (2026-09-01)

### D1 — 领域模型与隔离单元（按推荐采纳）

**三术语模型**（domain-modeling 锐化；当前代码零命中 tenant/request 设施，故先立模型）：

- **Tenant**（*who*）：拥有 ≥1 个 scope 的主体（SaaS 组织/客户）。当前代码不存在，需新增。
- **Scope**（*what data*）：一个 `semanticRoot` 路径 = 一份语义层（tables/events/metrics/concepts）。= 现有 `ScopeDefinition { id, semanticRoot, metadata }`，registry 按 `id` 键控。
- **Request**（*when*）：一次执行单元（一次 NL→SQL 查询 / 一个 agent turn），负责解析自己的 tenant→scope 并贯穿调用链。

**子决策：**

- **D1a — tenant→scope = 1:N**。per-game 访问隔离：一个组织/租户下挂多个 game-scope；reverse-bi per-game 取数印证。当前单租户现状（1:1）是 1:N 的退化情形，迁移保持兼容（见 D5）。
- **D1b — 隔离单元 = per-request**（非 per-session）。竞态是 per-request 并发问题（两个在飞查询同读全局 `active()`），不是会话状态问题。per-session 只在"会话中途 scope 可切换"这个当前并不存在的怪特性下才相关。
- **D1c — 移除全局 `active` 指针**。`ScopeRegistryService` 的 `active()`/`activeId()`/`setActive()`/`clearActive()` 移除（或降级为仅管理用途），改为每个 Request 解析自己的 scope 并携带。`corpusVersion()` 的 `scopeEpoch` 只做缓存失效、不做隔离——不替代本决策。

**依据**：全仓 grep `AsyncLocalStorage|tenant|sessionId|session_id`（packages/）零命中 → 无既有 per-request/tenant 设施；race 为结构性缺陷，非缓存 bug。

**留给后续决策（open）**：1:N 下一个 Request 如何在 tenant 的多个 scope 中选一个（game 标识从哪来、何时解析）—— 延至 Q2（传播机制） / Q3（SemanticLayerService 作用域化）。

### D2 — 上下文传播机制（按推荐 C 采纳）

- **per-request Cordis 子 ctx，显式贯穿到 scope 消费点**。请求入口派生 `reqCtx = ctx.extend({ scopeId, tenantId }).intercept('schema', { scopeId, semanticRoot })`（或新增 `ctx.request` seam），显式传到 scope 消费 call site（semantic-layer 读 + tool-search-data-sources + critic）。
- **不引入 ALS**（全仓零、Cordis 不用、双系统风险）；不用裸 `scopeId`（B）——多租户 per-request 多维度（scope+tenant+audit+conventions）单 ctx 承载优于多参数贯穿。
- 依据：services 是单例（构造时绑 app ctx）、ctx 显式传递、无隐式传播（读 `vendor/cordis/src/context.ts` + `service.ts` 确认）；child-ctx（`extend`/`isolate`/`intercept`）是 Cordis 内置但本仓当前零用法——首采用，是 additive 的 Cordis 扩展路径。
- **open/contingent**：call-chain 深度未完全标出（turn 入口 grep 未命中命名），是 C 成本关键变量；impl 第一步标 call-chain，若深则 A-hybrid（ALS 携带 reqCtx）兜底。
- **跨线耦合（记 GA-GT1-impl）**：B1 落地的 `Nl2sqlEngineService` 构造时 `this.conventions = ctx.query.getConventions()` 缓存——GT2-D1 正确但多租户坏（`ctx.query` 单例 → 所有 tenant 同一 conventions）。C 落地后 `getConventions()` 须 per-request-scope 解析（每 scope 可能不同引擎方言），不能构造时缓存。

### D3 — ScopeRegistry 数据模型 + API（按推荐 (a)+(ii) 采纳）

- `ScopeDefinition` 加 `tenant: string`（必填；迁移给现存单 scope 赋 `"default"`）。`RegistryFile` 扁平按 id 键控 + 每 scope 带 tenant、移除 `active`：`{ scopes: { id: { tenant, semanticRoot, metadata? } } }`。
- API：`get(id)` 不变（id 全局唯一）；`list(tenant?)` 按 tenant 过滤；移除 `active()/activeId()/setActive()/clearActive()`（D1c）；新增 `forTenant(tenant, scopeId?)`（1:1 可省 scopeId、1:N 必填）。
- 非请求上下文（eval/CLI/单 scope）走 (ii) 显式配 `scopeId`——不留 default 指针（`default` 是 `active` 的 per-tenant 版、同样竞态隐患）。registry 退化为按 id 解析 + 按 tenant 列举的 store。

### D4 — SemanticLayerService 消费侧（按 β-vs-α 对比采纳 β）

- β：root 单例（**无状态**、不持 tenant 态）+ 读方法加 `scopeId` 参数（`loadTableDefinition(name,scopeId)`/`getRelationGraph(scopeId)`/`acquireSnapshot(scopeId)`/`loadRetrievalCorpus(scopeId)`/`corpusVersion(scopeId)`），call site 从 per-request child ctx（reqCtx，D2=C）拿 scopeId 传入。移除 `scopeEpoch`（全局 active 已无、成死代码），`corpusVersion(scopeId)` = per-scope 写计数器。per-scope LRU 作可选优化（β 下单例 + scopeEpoch 已正确失效，per-scope LRU 不阻塞 ship）。
- footprint（subagent 实测，file:line）：5 读方法仅 3 有 live caller（`getRelationGraph`×7 / `corpusVersion`×3 / `loadRetrievalCorpus`×5，共 15 站点跨 6 包；`loadTableDefinition`/`acquireSnapshot` 0 live caller）；链浅（turn→executeToolCalls→tool execute→`ctx.schema.X`，~3-4 帧）。`ToolExecutionInput` 加 `scopeId` 一字段 + `executeToolCalls` 从 session 填。
- scopeId 来源（连 D1 open）：**session-bound**——从 `ReactLoopAgent.session`（`packages/core/agent-loop/src/agent.ts`）在 turn/step 解析。局部回答 D1 open：会话绑定。
- 舍 α（双证）：`ctx.isolate('schema').extend()`+`provide` 不创 Fiber → 覆写 root store 泄漏（得用 `ctx.inject`）；tool mount 时捕获 root ctx → 看不到 per-request 实例，除非 `ToolExecutionInput` 加 per-request ctx + 全量 tool `execute` 切 ctx 源 = captive-dependency 反模式；per-request instance → 每请求重建 → 强制 4 缓存迁移。[Autofac](https://autofac.readthedocs.io/en/latest/advanced/multitenant.html)/[.NET DI](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection) 印证无状态单例+tenant-id-param 不泄漏 = β 形态。舍 γ（ALS）：[Platformatic](https://blog.platformatic.dev/the-hidden-cost-of-context) 共识 ALS 适合 cross-cutting、显式参数适合 core domain data，scopeId 是 core domain → β 对齐。

### D5 — H6 级联（dimension 4，四处 cascade 全 = β + per-scope + corpusVersion）

1. `tool-retrieve` enrichedLinkers（`WeakMap<schema,Bm25Linker>`、**无 corpusVersion 校验** pre-existing stale-on-write bug）：加 corpusVersion 校验 + 按 (schema, scopeId) 键控 per-scope；同款修 `tool-search-data-sources`/`tool-search-schema`。
2. `evidence-query` eval store（`EvalResultStore` 无 scope_id、单一 resultsDir）：加 `scope_id` 到 `EvalResultRecord` + query 按 scope_id 过滤；`EvidenceQueryService` schema 读方法加 scopeId（β）；resultsDir per-scope 子目录 `<resultsDir>/<scopeId>/*.jsonl`。
3. `InProcRetrieval`（`HybridRetriever` 构造时一次性建、corpus 固定）：lazy per-scope 从 `ctx.schema.loadRetrievalCorpus(scopeId)` 建 + corpusVersion 失效重建，per-scope retriever cache。
4. `scope-hint`（`buildSummaries`/`buildAliasHint` 经 `scopes.list()` 列全部 scope → 跨租户泄漏给 LLM system prompt）：按 session tenant 过滤（只列当前 tenant 的 scope）。

### D6 — 迁移策略（dimension 5，分阶段兼容垫层）

- **Phase 1 — additive 容量（零 break）**：ScopeRegistry 加 `tenant`（初始 optional，现存 scope 无 tenant = `"default"`）+ `forTenant/list`，**保留 `active`/`setActive` 作 deprecated 兼容回退**；SemanticLayerService 读方法加 `scopeId`（optional、undefined 回退 `active()`）+ per-scope LRU 叠加；H6 修 additive。纯叠加，单 scope 用法不变。
- **Phase 2 — 调用方迁移**：15 call site + `ToolExecutionInput.scopeId` + eval/CLI 显式配 scopeId；未迁移的回退 active（兼容）。
- **Phase 3 — 翻默认 + 弃 active**：scopeId required；`active` warn-on-use；现存单 scope 赋正式 default tenant。
- **Phase 4 — 删 active（D1c 完成）**：移除 `active()/setActive()/clearActive()`；tenant 必填；移除 `scopeEpoch`。
- **票拆分**：GA-GT1-impl = Phase 1+2（additive 容量 + 调用方迁移，active 作兼容回退**保留**——纯叠加不删不 break）；GA-GT1-cleanup（后续票）= Phase 3+4，等 Phase 1+2 生产验证后。
- default tenant = `"default"`；always-on 容量（无 feature-flag）。

---

## Resolution (2026-09-01)

GA-GT1 grilling 全部六项决策锁定（D1-D6）。grilling 闭环；拆出 [GA-GT1-impl](GA-GT1-impl-multi-tenant-scope.md)（Phase 1+2，task，open）实施票 + GA-GT1-cleanup（Phase 3+4，后续票）。

- **D1**：三术语模型（Tenant/Scope/Request）+ 1:N + per-request + 移除全局 active。
- **D2**：传播 = C（per-request Cordis 子 ctx，显式贯穿，不引入 ALS）。
- **D3**：registry — tenant 必填 + 扁平-by-id + 移除 active + list(tenant?)/get(id)/forTenant(tenant,scopeId?)；非请求上下文显式配 scopeId。
- **D4**：SemanticLayerService 消费 = β（root 单例 + scopeId 参数 + 移除 scopeEpoch + per-scope LRU 可选）。
- **D5**：H6 四处 cascade（tool-retrieve/evidence-query/InProcRetrieval/scope-hint）= β + per-scope + corpusVersion。
- **D6**：迁移 = 分阶段兼容垫层（Phase1+2 additive 容量+调用方迁移 active 回退保留；Phase3+4 cleanup 删 active）。
- **跨线耦合（记 GA-GT1-impl）**：`Nl2sqlEngineService.getConventions()` 构造时缓存（多租户坏）→ per-request-scope 解析。
