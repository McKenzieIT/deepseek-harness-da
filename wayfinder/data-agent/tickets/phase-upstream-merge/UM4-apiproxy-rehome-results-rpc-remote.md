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

## Resolution

**[2026-09-09 triage] → Status: leave-open (R-DA/Phase-2).** synced base 仍 track `packages/host/apiproxy/src/api/results.{ts,schema.ts}`（2 fork-only 文件，results-RPC re-home 待 `packages/api/remotes/`）；upstream `c389f96bf3` 无 `packages/host/apiproxy`；presetSwitches race re-validation under new Remote arch = R-DA + Phase-2。详 `.tmp/next-5-triage.md`。

---

### (original pre-triage)
（待落地后填：results-RPC 重落户后的 remotes 路径 + A6 race 在新架构下的处置）
