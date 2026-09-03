# T8 — result.get RPC 四件实现(host → client 通路)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
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

## Resolution

Resolved 2026-09-03 (this session). 四件已实现并全链验证通过——host 侧 `result.get` RPC 上线,浏览器可达 `ctx.resultCache`。

**实现**(纯机械走既有 apiproxy 模式,无新决策/协议,参 [R6](R6-result-store-server-side.md) Resolution):

1. `packages/host/apiproxy/src/api/results.ts` + `results.schema.ts`:`ResultsApi` 接口(`get(request: RpcRequest<{ resultId: string }>): Promise<RpcResponse<ResultEntry>>`)+ `resultGetRequestSchema`/`resultGetValueSchema`(zod,锚 `Wire<RequestPayload/ResponseValue<'result.get'>>`)。wire `ResultEntry`/`ResultMetadata` **本地定义**(镜像 host 类型,带 `readonly`),**非** import——保 `api/` 零 Node 依赖、浏览器可导入,且不把 result-cache 包的 `Service`/`Context` 拖进 client.d.ts(同 `CredentialView` stance;规避 `agentPresets` 记的 gateway-drag)。
2. `RpcMethodMap` 加 `'result.get': ResultsApi['get']`(`src/api/rpc-map.ts`)。
3. `IApiClient.results.get` + `AbstractApiClient.UNARY_VALUE_SCHEMAS['result.get']` + `readonly results` impl(`src/fetch/client.ts`);`UNARY_ROUTES['result.get']`(`src/fetch/handler.ts`)——四镜像编译期校验全闭(缺行即 type error)。
4. host handler(`createApiProxy` in `src/api-proxy.ts`):`ctx.get('resultCache')`(**optional**,非 `ctx.resultCache`——per `packages/AGENTS.md`「optional services use `ctx.get(name)`」;无 provider 时返 `internal` service-absent 而非解引用 undefined,镜像 credentials/settings/approval);miss = `result-not-found`(`{ resultId }`,新 `RpcErrorDetailsMap` 行 + `rpcErrorSchema` discriminated-union 分支 in `rpc.ts`/`rpc.schema.ts`)。`ApiProxyService` 同步加 `readonly results` + 构造赋值(`src/index.ts`)。

**伴随**:`@deepseek-ai/dsh-result-cache` 加入 apiproxy `dependencies`(augmentation loader `import type {} from '@deepseek-ai/dsh-result-cache'`,同 user-approval 的 side-effect type import)+ tsconfig project reference `../../data/result-cache`;`pnpm install` 已 link。Agent Note:`.agents/notes/implemented/architecture/2026-09-03-result-get-rpc.md`(实现决策超 R6 spec:`ctx.get` vs `ctx.resultCache` / 本地 wire ResultEntry vs import / `result-not-found` vs `internal` / 分页延后;含 supersession 检查——无既有 note 拥有 result-cache seam,protocol note 是高层模式非 per-method)。

**验证**:tsc -b apiproxy(exit 0)+ tsc -b tsconfig.host.json 全 host 聚合含 tests(exit 0;含 `fetch-carrier.spec.ts`/`client-handler.spec.ts` 两处 `ApiProxy` fixture 补 `results` stub)+ apiproxy vitest 377/377 + `pnpm run test:gui` 4214/4214(1 skipped,exit 0)。四镜像编译期校验 = 完整性保证;runtime round-trip 测试覆盖 ok + result-not-found 通路(`client-handler.spec.ts` +2 tests)+ error-code accept/reject(`rpc-schemas.spec.ts` +2 断言)。

**移交**:[T9](T9-result-cache-package-impl.md)(client result-cache 包,按 [R5](R5-object-layer-result-cache.md) Resolution:inject fetchResult face + lru-cache + Config + 事件订阅失效)的 cache-miss = 调 `IApiClient.results.get(rid)`——T8 是其 miss 通路前置,现已就绪可全链验证。分页(`result.getPage`)day-1 不含,后续非破坏性加入。
