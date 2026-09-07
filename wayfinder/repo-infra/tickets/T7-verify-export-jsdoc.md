# T7 — verify-export-jsdoc 402 JSDoc completeness 违规

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: PR #44 CI `node 24 / static` 失败 step "Run static gates"（job 101598597553，run 34074751506，2026-09-07 02:00）。pre-existing on master（latent，非 W20 引入）。**verify 仍红 on current master cf813c18c0（CI run 34077728551）before fixing——concurrent PRs #45–#51 (GA-AUDIT1/GA-GT3 followup) 可能已 fix 部分。**

## Question

`verify-export-jsdoc` gate 红：**402 条 JSDoc completeness 违规**（exported API 缺 `@param`/`@returns`/完整 JSDoc；见 AGENTS.md 的 JSDoc completeness 规则）。Sample（packages/data/*）：

- `ScopeRegistryService.register` 缺 @param scope（scope-registry/src/index.d.ts:65）
- `registerInvalidationHook` 缺 @returns（return type `() => void`）（semantic-layer/src/io.ts:84）
- `DataSourceRegistry.register` 缺 @param plugin（semantic-layer/src/registry.ts:107）
- `registerListScopes`/`registerSwitchScope` 无 JSDoc（tool-scope-routing/list-scopes.ts:55、switch-scope.ts:18）

非 W20 引入（W20 diff 只 touch `packages/api/remotes/tests/built-lib.e2e.ts` + `wayfinder/` docs，不动任何 exported API）。master HEAD `47ef19a26f`（PR #44 base）是 docs commit 无 CI run，故 latent；近期 semantic-layer/GA-GT3 commit 疑引入。

## Scope

补全 402 处 exported API 的 JSDoc（`@param`/`@returns`/完整 JSDoc），验 `pnpm run verify-export-jsdoc` 绿。CI log: job 101598597553（grep `verify-export-jsdoc`）。先 verify 仍红 on current master。
