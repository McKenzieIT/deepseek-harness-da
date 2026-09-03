# T11 — Fix connection FixtureApiClient `results` arm (T8 residual)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Related**: [T8](T8-result-get-rpc.md)（T8 加 `results` 域到 `ApiProxy`/`IApiClient`,未更 connection fixture）、[T9](T9-result-cache-package-impl.md)（构建时浮现本 residual）

## Question

T8 注册 `result.get` 时给 `ApiProxy`/`IApiClient` 加了 `results: ResultsApi` 域,但 `packages/client/connection/src/client/fixture.ts` 的 `FixtureApiClient`(`ApiProxy` fake)未补 `results` arm。`tsc -b packages/client/connection/tsconfig.client.json` 自 T8 起红(TS2741 `Property 'results' is missing in type ... but required in type 'ApiProxy'` + 一处 TS2366 缺 return);client tsc 聚合(`tsconfig.client.json`)因此红。T8 验证跑 `tsc -b apiproxy` + `tsc -b tsconfig.host.json` + `pnpm run test:gui`,均不 typecheck `connection/fixture.ts`,故残留未被发现。

补齐:`FixtureApiClient` 的 `ApiProxy` fake 加 `results: { get: ... }` stub(镜像其他域的 fixture 行为——fixture 不命中真 resultCache,返回 `result-not-found` 或 `internal` service-absent),并补全缺 return 的函数臂。1 行机械修。

**亦 runtime break(非仅 tsc)**:`FixtureApiClient.dispatch` 无 `result.get` arm,故 `?fixture` 模式下 `AbstractApiClient.callUnary` throw `TypeError: Cannot read properties of undefined (reading 'rpcId')`——T9 的 `?fixture`/demo/dev 路径在 T11 land 前死(T9 code review 发现)。且 T9 的 `tsc -b packages/client/result-cache` exit 2(references `../runtime` 拉 `connection/fixture.ts` 的本 T8 residual),故 [T12](T12-harden-result-cache-per-review.md) 的 tsc 验证依赖本票先/同 land。

## Scope

T8 residual 的机械补丁(无新决策)。connection-scoped change(T9 pathspec 排除 connection,故 graduate 到本票)。完成后 client tsc 聚合复绿;T9 + 后续 client 包的 `tsc -b` 不再被本 residual 阻。验证:`tsc -b packages/client/connection/tsconfig.client.json` exit 0 + `tsc -b tsconfig.client.json` + `pnpm run test:gui`。trivial 改动可不写 Agent Note(或简短补注 T8 fixture 遗漏)。
