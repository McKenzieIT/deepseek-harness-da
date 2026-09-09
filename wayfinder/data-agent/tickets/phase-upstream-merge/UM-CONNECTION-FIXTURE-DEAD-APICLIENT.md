# UM-CONNECTION-FIXTURE-DEAD-APICLIENT — remove dead AbstractApiClient subclass in connection fixture

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Blocked by**: UM14（synced base `8112743d69`）、UM16
**Blocks**: UM10（typecheck-green gate）
**Related**: UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS（research 票，本票是其 Adaptive A 分支）、R-DA-CLIENT-RUNTIME-DECOMMISSION（zombie `client/runtime`——**不同域**，本票是 `client/connection`，不重叠）
**Flow**: 见 `UM-flow-2026-09-08.md`

## Question

删 `packages/client/connection/src/client/fixture.ts:3967-4101` 的死 `FixtureApiClient extends AbstractApiClient` + `callUnary<K extends keyof RpcMethodMap>`/`openMux`/`openHost`/`tapStream` override（~41 个 TS2304/2552/4112/2339/2353/2366/7006 error）。

fixture **已有新 pattern**：`:3971` `readonly rpc: ClientConnectionRpc`、`:3755` `const rpc: ClientConnectionRpc`。`AbstractApiClient`/`ApiProxy`/`RpcMethodMap`/`RequestPayload`/`ResponseValue` 在 synced-base **无声明（REPLACED 非 moved，无 repoint target）**——故不能 repoint，只能删死子类、留 `ClientConnectionRpc`。

完成迁移（fixture 已半迁），非深重构。

## Resolution

(open)
