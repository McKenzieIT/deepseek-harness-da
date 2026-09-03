# T11 — Fix connection FixtureApiClient `results` arm (T8 residual)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
**Blocked by**: 无
**Related**: [T8](T8-result-get-rpc.md)（T8 加 `results` 域到 `ApiProxy`/`IApiClient`,未更 connection fixture）、[T9](T9-result-cache-package-impl.md)（构建时浮现本 residual）

## Question

T8 注册 `result.get` 时给 `ApiProxy`/`IApiClient` 加了 `results: ResultsApi` 域,但 `packages/client/connection/src/client/fixture.ts` 的 `FixtureApiClient`(`ApiProxy` fake)未补 `results` arm。`tsc -b packages/client/connection/tsconfig.client.json` 自 T8 起红(TS2741 `Property 'results' is missing in type ... but required in type 'ApiProxy'` + 一处 TS2366 缺 return);client tsc 聚合(`tsconfig.client.json`)因此红。T8 验证跑 `tsc -b apiproxy` + `tsc -b tsconfig.host.json` + `pnpm run test:gui`,均不 typecheck `connection/fixture.ts`,故残留未被发现。

补齐:`FixtureApiClient` 的 `ApiProxy` fake 加 `results: { get: ... }` stub(镜像其他域的 fixture 行为——fixture 不命中真 resultCache,返回 `result-not-found` 或 `internal` service-absent),并补全缺 return 的函数臂。1 行机械修。

**亦 runtime break(非仅 tsc)**:`FixtureApiClient.dispatch` 无 `result.get` arm,故 `?fixture` 模式下 `AbstractApiClient.callUnary` throw `TypeError: Cannot read properties of undefined (reading 'rpcId')`——T9 的 `?fixture`/demo/dev 路径在 T11 land 前死(T9 code review 发现)。且 T9 的 `tsc -b packages/client/result-cache` exit 2(references `../runtime` 拉 `connection/fixture.ts` 的本 T8 residual),故 [T12](T12-harden-result-cache-per-review.md) 的 tsc 验证依赖本票先/同 land。

## Scope

T8 residual 的机械补丁（无新决策）。connection-scoped change（T9 pathspec 排除 connection，故 graduate 到本票）。

> **Scope 修正（resolve 时发现）**：原 ticket 称「1 行 / connection fixture / 完成后聚合 tsc 复绿」低估了 residual 范围。T8 给 `IApiClient` 加 `results: ResultsApi`，所有「实现 `IApiClient` 的 fake」都得补该域，不止 connection fixture 一个。受影响 fake：(1) `connection/src/client/fixture.ts` `FixtureApiClient`（本票修）、(2) `connection/tests/fake-api.client.ts` `FakeApiClient`（connection-scoped，本票修）、(3) `runtime/tests/fake-api.client.ts` `FakeApiClient`（runtime 共享测试基建，runtime + ui-conversation 测试都 import——**不在 connection 范围**，graduate 到 [T13](T13-runtime-fakeapiclient-results-arm.md)）。另：`result-cache/tests/result-cache.client.spec.ts` 有 2 个 `Property 'mock' does not exist on 'ResultFetcher'` 错——**非 T8 residual**，是 T9 测试自己 cast `vi.fn() as unknown as ResultFetcher` 后访问 `.mock` 的问题，归 [T12](T12-harden-result-cache-per-review.md)（T12 重写 result-cache 测试时一并处理）。

经 [wayfinder 用户裁决](#)（connection-scoped complete）：本票做 **connection 半**（fixture + connection 测试 fake），runtime 半 graduate 到 T13，result-cache `.mock` 归 T12。三者皆 latent（vitest/esbuild 不 typecheck，`test:gui` 全绿；单包 `tsc -b` 只看 src 不含 tests，T12 的 `tsc -b packages/client/result-cache` 不受任何阻）——唯一受害是**聚合 client tsc**，一个 latent 红非 runtime break。

**验证（修订）**：`tsc -b packages/client/connection/tsconfig.client.json` exit 0 ✓ + connection 测试 fake 错从聚合清零（聚合 131→116，减 15 全是 connection）✓ + `pnpm run test:gui` exit 0（4235 passed / 1 skipped）✓。聚合 `tsc -b tsconfig.client.json` 仍红（116 错：runtime fake[T13] + result-cache `.mock`[T12]）——范围外，不卡 T12。trivial 改动不写 Agent Note（T8 fixture/fake 遗漏记于此 + T13）。

## Resolution

Resolved 2026-09-03 (this session). T8 residual 的 **connection 半**补齐——connection 包 tsc 复绿，`?fixture` 运行时通路修复，T12 的 `tsc -b packages/client/result-cache` 不再被 connection residual 阻。

**改动**（两文件，皆 connection-scoped，机械修无新决策）：

1. **`packages/client/connection/src/client/fixture.ts`**（`FixtureApiClient`，`ApiProxy` 视图——arms 收 `request: RpcRequest<P>`）：
   - `api: ApiProxy` 字面量加 `results` 域 arm：`get: (request) => err(request, { code: 'result-not-found', message: \`fixture has no result store for ${request.payload.resultId}\`, details: { resultId: request.payload.resultId } })`（镜像 `downloads` stub 的「contract-satisfying」放置 + `err` helper 风格；fixture 不命中真 resultCache，返 not-found——`?fixture`/demo/dev 路径走 cache 的 miss→not-found→undefined 通路，graceful 不 throw）。
   - `FixtureApiClient.dispatch` switch 加 `case 'result.get': return this.api.results.get(request)`（恢复 switch 穷尽性——修 TS2366 `dispatch` 签名缺 return；亦修 `?fixture` 模式 `callUnary` 的 `TypeError: Cannot read properties of undefined (reading 'rpcId')` runtime break，因 `dispatch` 原无 `result.get` arm 返 undefined）。
2. **`packages/client/connection/tests/fake-api.client.ts`**（`FakeApiClient implements IApiClient`，payload-direct 视图——arms 收 `payload: RequestPayload<K>`）：
   - 加 `readonly results: IApiClient['results'] = { get: (payload: unknown) => this.record('result.get', payload, Promise.resolve({ rpcId: RpcId(\`fake-${nextRpc++}\`), result: { ok: false as const, error: { code: 'result-not-found' as const, message: 'fake api has no result store', details: { resultId: (payload as { resultId: string }).resultId } } } })) }`（镜像文件内 `sessions`/`workspace` field-access arm 的 `(payload: unknown) =>` + cast 风格；`as const` 钉 `ok`/`code` 判别位，免依赖 contextual 推断；返 not-found 同 fixture 语义）。

**验证**：`tsc -b packages/client/connection/tsconfig.client.json` exit 0（connection src tsc 复绿——TS2741 line 2266 + TS2366 line 3176 皆消）+ 聚合 `tsc -b tsconfig.client.json` 错数 131→116（减 15 全是 connection fake：`connection/tests/fake-api.client.ts` 与 `connection/tests/connection.client.spec.ts` 出错文件，皆清零；余 116 全在 runtime fake[T13] + result-cache `.mock`[T12]）+ `pnpm run test:gui` exit 0（308 files / 4235 passed / 1 skipped；connection 测试 `connection.client.spec.ts` 用 `FakeApiClient` 但不调 `result.get`，stub 不触发，无行为变）。

**Graduate（范围外，T11 不修）**：
1. **runtime `FakeApiClient` `results` arm**（runtime 半的同 residual）→ [T13](T13-runtime-fakeapiclient-results-arm.md)（runtime-scoped change，T11 pathspec 排除 runtime）。
2. **result-cache `.mock` tsc 错**（T9 测试 cast 问题，非 T8 residual）→ [T12](T12-harden-result-cache-per-review.md)（T12 重写 result-cache 测试加 throwing-fetcher/single-flight/epoch-race/apply.client.spec 时，`notFound()`/`serviceError()` 的 `as unknown as ResultFetcher` cast + `.mock` 访问一并理顺）。

**移交**：T11 解 → T12 的 `tsc -b packages/client/result-cache`（src-only）通路就绪（connection fixture 已修），T12 可全链验证。聚合 tsc 复绿待 T13 + T12 的 `.mock` 修齐做。前沿：[T12](T12-harden-result-cache-per-review.md)（blocks T10）、[T13](T13-runtime-fakeapiclient-results-arm.md)（latent，不阻）、T7（chart 线，large）、P2（HITL prototype）。
