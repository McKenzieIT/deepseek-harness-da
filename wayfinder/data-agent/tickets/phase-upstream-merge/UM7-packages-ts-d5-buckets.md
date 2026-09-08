# UM7 — packages/* 68 .ts 按 d5 桶处置（additive keep / coupled refactor / churn revert）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM3, UM4（3 logic-change 文件先归 UM3/UM4）
**Blocks**: UM10
**Related**: d5 审计（`.tmp/audit/d5-upstream-impact.md`，68 .ts 分桶：45 legit-extension / 8 coupled / 12 churn / 3 logic-change）

## 背景

d5 把 68 个 fork-modified upstream `.ts`/`.tsx` 分四桶：**LEGITIMATE-EXTENSION**（~45，additive 向后兼容，KEEP）/ **DATA-AGENT-COUPLED**（~8，改 upstream 逻辑服务 data-agent，移进 data-agent 包）/ **UNNECESSARY-DIVERGENCE**（~12，comment-only/test-only churn，REVERT）/ **UPSTREAM-LOGIC-CHANGE**（3，id-less 簇 + apiproxy presetSwitches——归 UM3/UM4）。

## Scope（additive-over-mutation 原则）

1. **KEEP ~45 legit-extension**：scopeId dormant 管线（`core/agent-loop/src/tool-calls.ts:82`、`core/agent/src/runtime-types.ts:31`、`core/tools/src/index.ts:326,:1408`、`core/tools/src/code-mode.ts`）、`ctx.effect` 泄漏修复（`core/agent-loop/src/index.ts:351-353` + `extensions/tool-cordis`，核 disposer 契约仍成立 on upstream）、credentials addressing 等。逐个核**仍能编译过 upstream**（周边被 projection registry / dsh-util-values 改动可能移位）。
2. **REFACTOR ~8 coupled**：data-agent 进程规则移出 root `AGENTS.md`（移进 data-agent 自有包）；CI 分离归 UM2；`credentials-local static override name`（d5 line 27 verify-then-decide）核 Cordis DI identity 是否 collide。
3. **REVERT ~12 churn**：comment-only / test-only 重组（`core/tools/src/index.ts:660,:1299` catch-block 注释、`lsp-stdio/instance.spec.ts`、`shell/*` test-only churn 等）——顺势回退降债。
4. **3 logic-change** 归 UM3（id-less 簇）+ UM4（apiproxy presetSwitches）。
5. UNNECESSARY-DIVERGENCE 顺势回退（d5 12 churn 文件）。

## Merge outcome (2026-09-07)

~14 packages .ts conflicts（runtime src，非 README/test）：`boot/app-boot/src/index.ts`、`client/{ui-layout/src/client/AppFrame.tsx, ui-trajectory/src/client/layout.ts}`、`core/tools/src/index.ts`、`credentials/{credentials,credentials-local}/src/{index,types}.ts`、`extensions/{cordis-client-runner/src/client/slot-catalog, tool-cordis/src/{api-catalog,index}}.ts`、`subagent/tool-subagent/src/index.ts`。

跨 UM 重叠：`client/connection/src/client/fixture.ts` + `client/runtime/src/client/index.ts` ∈ UM4∩UM7（apiproxy/re-home 相关，归 UM4 处置）；`bundle/web-app/package.json` ∈ UM7∩UM8。按 d5 桶（KEEP legit-extension / REFACTOR coupled / REVERT churn）逐个解，核 KEEP 文件仍能编译过 upstream。

### Cascade update（pnpm-install unblock 发现）
upstream 重构了 data-agent 客户端依赖的包 → fork deps/imports 引旧名 → pnpm 逐个报错。已临时 restore（fork's HEAD，等 UM7 迁移）：
- `packages/client/runtime`（upstream → `client-modules`）：`ui-suggest-followups`/`result-cache`/`ui-context-layer` 10+ import `ClientContext`/`SessionId`/`ToolCallBlock` from `dsh-client-runtime/client` → **须迁 `@deepseek-ai/dsh-client-modules`**（rename split 散落多 dir，逐 type 查新位置）。
- `packages/code-runtime/code-runtime-python`（→ `experimental`）：`code-runtime-data-python` dep → `dsh-experimental-code-runtime-python`。
- `packages/examples/{agent-spine-demo,jsonrpc-demo}`：`python/sdk-runtime` deps；保/删 sort。
**UM7 现 scope 最大**（restructured 迁移 + 原 d5 68 .ts 桶）。临时 restore 造 duplicate-types（client-runtime fork + client-modules upstream 共存）→ typecheck 会标 → UM7 迁移消 dup。

## Resolution (2026-09-08)

3 sub-agents + 2 design tickets. **UM7-1 client-runtime**: REVERTED premature delete+repoint; minimal-patch = keep zombie `packages/client/runtime` (compat shim) + repoint stale apiproxy imports (`transportError`→`dsh-client-connection/client` [4 files]; `SESSION_SEARCH_RESULT_LIMIT`→`dsh-api-session-controller/client` [2 files]) + remove `dsh-host-apiproxy` dep → **R-DA-CLIENT-RUNTIME-DECOMMISSION** opened. **UM7-2 DashScope + credentials**: DashScope `acceptIdentity` ported + `CallId`→`ToolCallId`/`brandString`; credentials (5 UU): `address?` KEEP + upstream `notifyUpdated`/`fanOut` merged + `credentials/updated`→`credentials/reference-updated` + `static override name='credentials'` REVERTED (no-op). **UM7-3**: 21 files per d5 (KEEP/REVERT/REFACTOR); AGENTS.md 2 rules → `packages/data/AGENTS.md` (root pristine); code-runtime-python dep → `dsh-experimental-code-runtime-python`; fixture.ts (UM4∩UM7) resolved; cards.ts (broken AU) deleted; keychain-host `parseCredentialsDocument` return-type fixed. **Design research**: apiproxy→modular Remote interface (api/gateway + api/{session,settings,workspace}-controller @Remote + api/remotes assembly + bundle composition); data-agent uses 4/5 seams, violates #3 (zombie internals vs `./client` public exports) → **R-DA-UI-PRESENTER-COMPOSITION** opened.
