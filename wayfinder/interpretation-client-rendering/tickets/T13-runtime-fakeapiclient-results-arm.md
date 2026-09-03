# T13 — Fix runtime FakeApiClient `results` arm (T8 residual, runtime half)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: in progress
**Assignee**: claude-code · 2026-09-03 (this session — shepherding; see status note)
**Blocked by**: 无
**Related**: [T8](T8-result-get-rpc.md)（T8 加 `results: ResultsApi` 到 `IApiClient`/`ApiProxy`）、[T11](T11-connection-fixture-results-arm.md)（T11 做 connection 半——fixture + connection 测试 fake；本票做 runtime 半）

## Question

T8 给 `IApiClient`（payload-direct 视图）加了 `results: ResultsApi` 域，但所有「亲手实现 `IApiClient` 的 fake/mock」都得跟着补这个域。[T11](T11-connection-fixture-results-arm.md) 做了 **connection 半**（`connection/src/client/fixture.ts` 的 `FixtureApiClient` + `connection/tests/fake-api.client.ts` 的 `FakeApiClient`），但 T8 residual 的另一半在 runtime：

- `packages/client/runtime/tests/fake-api.client.ts:72` 的 `FakeApiClient implements IApiClient` 未补 `results` arm。

此 fake 是 **runtime + ui-conversation 测试的共享基建**——`runtime/tests/{client-apply,conversation-registry,manager,projection-store,queue-store,session,sessions-service,wire-events,workspaces-service}.client.spec.ts` 与 `ui-conversation/tests/input-scenarios.client.spec.tsx` 都 `import { FakeApiClient } from './fake-api.client.ts'`（或从 runtime 引）。故 `tsc -b tsconfig.client.json`（聚合，含所有 tests）自 T8 起在 runtime/ui-conversation 测试处红（TS2345 `Property 'results' is missing in type 'FakeApiClient' but required in type 'IApiClient'`，~116 错中的一百多）。

**不阻 T12/T10**：单包 `tsc -b packages/client/result-cache` 只 typecheck `src/`（不含 `tests/`），故 T12 的 tsc 验证不受本 residual 阻；vitest 经 esbuild 转译不 typecheck，故 `pnpm run test:gui` 不受影响（runtime/ui-conversation 测试皆绿跑）。唯一受害是 **聚合 client tsc**——一个 latent 红非 runtime break。

## Scope

T8 residual 的 runtime 半（机械补 `results` stub，无新决策）。镜像 [T11](T11-connection-fixture-results-arm.md) 的 connection 测试 fake 修法：`FakeApiClient` 加 `readonly results: IApiClient['results'] = { get: (payload: unknown) => this.record('result.get', payload, Promise.resolve({ rpcId: RpcId(`fake-${nextRpc++}`), result: { ok: false as const, error: { code: 'result-not-found' as const, message: 'fake api has no result store', details: { resultId: (payload as { resultId: string }).resultId } } } })) }`（runtime fake 已 export `err`/`ok`/`RpcId`，可直接 `Promise.resolve(err({ code: 'result-not-found', message, details: { resultId } }))`——`err<T>` 的 T 不在 arg 故须 `err<never>(...)` 或如 T11 用 `as const`；参 T11 connection fake 的 `as const` 写法最稳）。connection-scoped 改已由 T11 完成；本票是 runtime-scoped 改（T11 pathspec 排除 runtime，故 graduate 到本票）。验证：`tsc -b tsconfig.client.json` 聚合复绿（本票 + [T12](T12-harden-result-cache-per-review.md) 的 result-cache `.mock` 修齐做后）+ `pnpm run test:gui`。trivial 改动可不写 Agent Note。

## Status note (2026-09-03, this session — shepherding)

本票被本 session（做 T11/T12 的那个）按用户指令 claim，目的是让下一个 session 不会重复领 T13。**但 T13 的实现 WIP 不是本 session 产的**——本 session 选了「connection-scoped complete」(T11)，明确没碰 runtime fake，把 runtime 半 graduate 给了本票。本 session 的两个 subagent 也没碰（A 只读；B 的 scope 是 result-cache gates + 已删的 scratch 探针，跑的是单包 tsc 不含 runtime 测试）。

**观察**：工作树里 `packages/client/runtime/tests/fake-api.client.ts` 已有 `results` arm（**uncommitted**），写法镜像本 session T11 的 connection fake（注释「Mirrors connection FakeApiClient」），返回 `result-not-found`。这是**另一个并发 session** 的 WIP（同工作树还有 ~66 个其他文件的 uncommitted WIP——ui-*/data-*/core-*/credentials-*，像一次 broad sweep）。

**后果**：
- 聚合 `tsc -b tsconfig.client.json` 现 **0 错（绿）**，但**条件性绿**——绿靠这份未提交的并发 WIP 撑；并发 session 一旦 revert/stash，聚合回红（~114 错，全 runtime fake）。
- 本票实现已存在（在 WIP），但**未提交、未验证、未 resolve**。`in progress` 状态如实反映：活在做、未闭环。

**待办**（给 WIP 的 owner / 下一 session）：
1. 提交 `packages/client/runtime/tests/fake-api.client.ts` 的 `results` arm WIP（确认它确实返 `result-not-found` + 过 `tsc -b packages/client/runtime/tsconfig.client.json` + `pnpm run test:gui`）。
2. 验证聚合 `tsc -b tsconfig.client.json` 复绿（本 WIP 应使 runtime/ui-conversation 测试的 ~114 错清零）。
3. resolve 本票（resolution comment + close + map Decisions-so-far 指针）。

**若 WIP 被 revert**（并发 session 弃了）：本票回 open/unclaimed，聚合回红；下一 session 按 Scope 重做即可（机械补 `results` stub，镜像 T11）。
