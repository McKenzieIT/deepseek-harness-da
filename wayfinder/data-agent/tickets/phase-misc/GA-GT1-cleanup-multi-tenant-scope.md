# GA-GT1-cleanup — 多租户 scope Phase 3+4（breaking）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open (gated)  ·  **Claim**: 2026-09-02 (待前置门满足后认领)
**Source**: [GA-GT1-impl](GA-GT1-impl-multi-tenant-scope.md)（resolved 2026-09-02，Phase 1+2 完成）+ [GA-GT1 grilling D6](GA-GT1-multi-tenant-scope.md)
**Priority**: medium (breaking change，gated)
**Blocked by**: GA-GT1-impl Phase 1+2 生产验证 + 全 callers 迁移（含 #25/#32 carry-forward）+ 用户授权 breaking change

## Question

实施 GA-GT1 Phase 3+4（翻默认 + 删 `active`），完成 D1c（移除全局 `active` 指针）。**breaking change**——需前置门满足后开本票实施。

## Scope

### Phase 3 — 翻默认 + 弃 active

- `scopeId` 改 **required**（无 fallback；SemanticLayerService 5 读方法 + 各 consumer 的 `scopeId?` → `scopeId: string` 必填）。
- `active()`/`activeId()`/`setActive()`/`clearActive()` 加 **warn-on-use**（运行时 deprecation 警告，引导迁移）。
- 现存单 scope 赋正式 default tenant（`ScopeDefinition.tenant` 从 optional → 现存 scope 显式 `tenant="default"`）。

### Phase 4 — 删 active（D1c 完成）

- 移除 `active()`/`activeId()`/`setActive()`/`clearActive()`（D1c）。
- `tenant` 必填（`ScopeDefinition.tenant: string`，非 optional）。
- 移除 `scopeEpoch`（全局 active 已无，成死代码）+ `lastScopeId`/`hasObservedScope`。
- 移除 SemanticLayerService 的 no-arg active 回退路径（`resolveRoot(undefined)`→active 语义）+ `corpusVersion()`/`getRelationGraph()` 的 no-arg 路径。
- 移除各 consumer 的 dormant `ACTIVE_SENTINEL` 路径（scopeId 必填后无 active 回退）。
- 收 carry-forward：#25（code-mode run_code 子调度传播 scopeId）+ #32（harness-responder D3ii）——Phase 4 scopeId required 前这两处也须传 scopeId。

## 前置门（gated——满足后开本票实施）

1. **Phase 1+2 生产验证**：多租户并发运行验证——无跨租户语料泄漏、无 `active()` 竞态、per-scope 缓存 root-check（#19/#22 已修）生产实证有效。
2. **全 callers 迁移**：所有 `active()`/no-scopeId 调用迁移为显式 `scopeId`（含 carry-forward：#25 nested scopeId in code-mode `run_code` 子调度 + #32 harness-responder `bootContext` D3ii）。
3. **用户授权 breaking change**：Phase 3+4 是 breaking（scopeId required、删 `active`、`tenant` 必填）——需用户显式授权。

## Out of scope

- Phase 1+2 的 additive 容量（已完成，见 [GA-GT1-impl](GA-GT1-impl-multi-tenant-scope.md)）。
- per-scope engine mapping（D1 open：一个 Request 如何在 tenant 的多 scope 中选一个——延至 Q2/Q3，非本票）。
- `ctx.query.getConventions(scopeId)` 的实际 per-scope 差异化（需 per-scope engine 选型，D1 open）——Phase 6 已铺 seam（dormant），本票不强制。

## 关联

[GA-GT1-impl](GA-GT1-impl-multi-tenant-scope.md)（Phase 1+2，resolved 2026-09-02）、[GA-GT1 grilling](GA-GT1-multi-tenant-scope.md)（D1-D6，D6 Phase 3+4 = 本票）。
