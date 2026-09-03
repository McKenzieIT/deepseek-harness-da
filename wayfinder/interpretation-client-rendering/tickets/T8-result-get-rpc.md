# T8 — result.get RPC 四件实现(host → client 通路)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（host 侧 `ctx.resultCache.get` 已存在;rpcId apiproxy 已 ship）
**Blocks**: [T9](T9-result-cache-package-impl.md)（client cache 的 miss 通路依赖本 RPC）
**Related**: [R6](R6-result-store-server-side.md)（决策:无新决策,差一行 RPC）、[R5](R5-object-layer-result-cache.md)（client cache,miss = 调本 RPC）

## Question

host 侧 `ctx.resultCache.get(rid)` 已存在(R6 核验),但浏览器不可达——`RpcMethodMap` 无 `result.get` 行。补齐 = 既有 apiproxy 模式四件(R6 spec):

1. `packages/host/apiproxy/src/api/`:`ResultsApi` 接口 + `results.schema.ts`(`{ resultId }` → `ResultEntry | not-found`)。
2. `RpcMethodMap` 加一行 `'result.get': ResultsApi['get']`。
3. `IApiClient.results.get` + `AbstractApiClient.UNARY_VALUE_SCHEMAS` 一项。
4. host handler 包 `ctx.resultCache.get(rid)`,not-found 走 `RpcError`(`result-not-found` 码)。

## Scope

destination 实现(按 R6 已定 spec 机械构建,无新决策)。当前项目开发依赖票推进,故从 R6 的 destination handoff 拉进 ticket。完成 → 解 [T9](T9-result-cache-package-impl.md)(client cache miss 通路)。分页延后(day-1 全量 get)。
