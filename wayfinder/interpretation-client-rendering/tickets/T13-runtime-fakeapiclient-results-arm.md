# T13 — Fix runtime FakeApiClient `results` arm (T8 residual, runtime half)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Related**: [T8](T8-result-get-rpc.md)（T8 加 `results: ResultsApi` 到 `IApiClient`/`ApiProxy`）、[T11](T11-connection-fixture-results-arm.md)（T11 做 connection 半——fixture + connection 测试 fake；本票做 runtime 半）

## Question

T8 给 `IApiClient`（payload-direct 视图）加了 `results: ResultsApi` 域，但所有「亲手实现 `IApiClient` 的 fake/mock」都得跟着补这个域。[T11](T11-connection-fixture-results-arm.md) 做了 **connection 半**（`connection/src/client/fixture.ts` 的 `FixtureApiClient` + `connection/tests/fake-api.client.ts` 的 `FakeApiClient`），但 T8 residual 的另一半在 runtime：

- `packages/client/runtime/tests/fake-api.client.ts:72` 的 `FakeApiClient implements IApiClient` 未补 `results` arm。

此 fake 是 **runtime + ui-conversation 测试的共享基建**——`runtime/tests/{client-apply,conversation-registry,manager,projection-store,queue-store,session,sessions-service,wire-events,workspaces-service}.client.spec.ts` 与 `ui-conversation/tests/input-scenarios.client.spec.tsx` 都 `import { FakeApiClient } from './fake-api.client.ts'`（或从 runtime 引）。故 `tsc -b tsconfig.client.json`（聚合，含所有 tests）自 T8 起在 runtime/ui-conversation 测试处红（TS2345 `Property 'results' is missing in type 'FakeApiClient' but required in type 'IApiClient'`，~116 错中的一百多）。

**不阻 T12/T10**：单包 `tsc -b packages/client/result-cache` 只 typecheck `src/`（不含 `tests/`），故 T12 的 tsc 验证不受本 residual 阻；vitest 经 esbuild 转译不 typecheck，故 `pnpm run test:gui` 不受影响（runtime/ui-conversation 测试皆绿跑）。唯一受害是 **聚合 client tsc**——一个 latent 红非 runtime break。

## Scope

T8 residual 的 runtime 半（机械补 `results` stub，无新决策）。镜像 [T11](T11-connection-fixture-results-arm.md) 的 connection 测试 fake 修法：`FakeApiClient` 加 `readonly results: IApiClient['results'] = { get: (payload: unknown) => this.record('result.get', payload, Promise.resolve({ rpcId: RpcId(`fake-${nextRpc++}`), result: { ok: false as const, error: { code: 'result-not-found' as const, message: 'fake api has no result store', details: { resultId: (payload as { resultId: string }).resultId } } } })) }`（runtime fake 已 export `err`/`ok`/`RpcId`，可直接 `Promise.resolve(err({ code: 'result-not-found', message, details: { resultId } }))`——`err<T>` 的 T 不在 arg 故须 `err<never>(...)` 或如 T11 用 `as const`；参 T11 connection fake 的 `as const` 写法最稳）。connection-scoped 改已由 T11 完成；本票是 runtime-scoped 改（T11 pathspec 排除 runtime，故 graduate 到本票）。验证：`tsc -b tsconfig.client.json` 聚合复绿（本票 + [T12](T12-harden-result-cache-per-review.md) 的 result-cache `.mock` 修齐做后）+ `pnpm run test:gui`。trivial 改动可不写 Agent Note。
