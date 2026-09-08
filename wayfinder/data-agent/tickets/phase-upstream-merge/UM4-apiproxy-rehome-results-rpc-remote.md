# UM4 — apiproxy 重落户：results-RPC → packages/api/remotes；presetSwitches → data-agent（A6）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM1, UM3（results-RPC 触 session，须先定 session format）
**Blocks**: UM6, UM7, UM8（knip 死指针依赖此）
**Related**: d5 A6（`.tmp/audit/d5-upstream-impact.md` line 14）；[T8-result-get-rpc](../../../interpretation-client-rendering/tickets/T8-result-get-rpc.md) + [T9](../../../interpretation-client-rendering/tickets/T9-result-cache-package-impl.md)/[T10](../../../interpretation-client-rendering/tickets/T10-consumer-fetchResult-wiring.md)/[T11](../../../interpretation-client-rendering/tickets/T11-connection-fixture-results-arm.md)/[T12](../../../interpretation-client-rendering/tickets/T12-harden-result-cache-per-review.md)/[T13](../../../interpretation-client-rendering/tickets/T13-runtime-fakeapiclient-results-arm.md) 簇、[B-DA1](../phase-misc/B-DA1-preset-switch-tool-interrupt-race.md)、[harness-package-removal research](../../research/harness-package-removal.md)；upstream `4f00a8b refactor(api): remove ApiProxy package` + Remote controllers 迁移链

## 背景

upstream `4f00a8b refactor(api): remove ApiProxy package` 删了整个 `packages/host/apiproxy`（ls-tree 确认 upstream 已无此目录）。前导：`ce3391e retire migrated unary routes`、`fd7f206 !: remove settings and credentials RPCs`、`6e40876 !: remove directory-picker RPCs`、`243f662 delete the goal unary domain`。替代：`packages/api/remotes/`（`src/{client/index.ts,index.ts,remote-events.ts,types.ts}`）+ `refactor(connection): own RPC transport contracts` + `refactor(api): converge the Remote failure vocabulary` + `refactor(client): consume migrated Remote namespaces`。

fork 的 `packages/host/apiproxy/src/api-proxy.ts`（grep 确认 fork 仍有）含两块：
- **(a) presetSwitches 并发重写**（d5 A6 / B-DA1 partial-fix）：`swapPreset` 同步预留 slot（`:3024`）+ recompose `await queued` + turn `await pendingSwitch`（`:2397`）。Comment 自承 driver："a mid-flight rebind destabilizes the agent's scope observers"（data-agent scopeId）。
- **(b) additive `results.get` RPC 域**（d5 line 14 判 LEGITIMATE-EXTENSION / KEEP）：`results.ts`/`results.schema.ts`/`rpc-map.ts`/`fetch/client.ts`/`fetch/handler.ts`/`api-proxy.ts` handler/`index.ts`——"textbook additive domain"。T8-T13 整 R5 数据线 premised on 它。

两块现在都在 upstream 已删的包里。

## Scope

1. **接受 upstream 删除 `packages/host/apiproxy`**（fork 侧丢该包）。
2. **重落户 results-RPC 域**（保 additive 工作）：把 `result.get` RPC 按 upstream 的 Remote 模式迁进 `packages/api/remotes/`——四镜像（`remotes/src` 的 namespace + `remote-events` + transport + client/server 半）。参 upstream `refactor(apiproxy): retire migrated unary routes` + `refactor(client): consume migrated Remote namespaces` 的迁移模式。
3. **A6 presetSwitches 并发**：upstream 已无 apiproxy → "在纯 upstream 验证 race"已无意义。改：在 **data-agent 层**做 observer rebind-safe（让 scopeId observer 不被 mid-flight rebind 打断），OR 在 Remote 层重做 preset-swap 序列化。先核 race 是否在纯 upstream Remote 架构下复现（B-DA1 复现路径）。
4. **更新 T8-T13 + B-DA1 + R5/R6 + harness-package-removal**：加 upstream-supersession addendum（re-home 落此票）——本批 PR 已加 addendum。
5. **knip.json**：清 `packages/host/apiproxy` 死指针（UM8 接力）。

## Merge outcome (2026-09-07)

22 conflicts，确认 apiproxy 整簇删 + re-home 目标：
- **13 UD apiproxy 簇**（upstream 删整包，fork 改）：`packages/host/apiproxy/{package.json, src/api-proxy.ts, src/api/{index,rpc-map,rpc.schema,rpc}.ts, src/fetch/{client,handler}.ts, src/index.ts, tests/{client-handler,fetch-carrier,rpc-schemas}.spec.ts, tsconfig.json}` → 接受删除（drop fork 侧）。
- **4 UU `packages/api/remotes/`**（re-home 目标）：`package.json, src/client/index.ts, src/remote-events.ts, tests/built-lib.e2e.ts` → 把 `result.get` RPC 按 Remote 模式重落此处。
- **UD runtime/connection fake-api**（T11/T13 residual）：`client/connection/tests/fake-api.client.ts`、`client/runtime/{src/client/index.ts, tests/fake-api.client.ts}`、`code-runtime/code-runtime-python/src/index.ts` → 接受 upstream 删除/迁移，fake-api arm 重落 `packages/api/remotes/` 或 `session-controller`。
- `client/connection/src/client/fixture.ts`(UU) → 审 + re-home results arm（跨 UM7）。

## Resolution (2026-09-08)

**A**: 13 UD apiproxy files `git rm`'d (accept upstream deletion). **B**: results-RPC re-homed — `packages/data/result-cache/` gains `src/remote.ts` (`ResultsRemoteGateway extends TypertRemoteService`, `@Remote('get')`→`ctx.get('resultCache')`) + `src/client/index.ts` + `src/types.ts` + package.json exports; 4 UU `packages/api/remotes/` resolved. ⚠️ UM4-B invented `TypertLookupFailure` (never existed); build-fix corrected to `RemoteError` + `result-not-found` via module augmentation in `result-cache/src/types.ts`. **C**: `result-cache-gateway` bundle row added to `data-agent/cordis.patch.yml`; fake-api `results` arms confirmed matching. **A6**: accept deletion — fork's `presetSwitches`/`await pendingSwitch` placebo dropped (against a refuted hypothesis); B-DA1 real fix → post-build task #10.
