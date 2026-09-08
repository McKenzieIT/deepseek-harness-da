# UM10 — verify：typecheck + lint + check:ci:static + check:ci:consumers + data-agent surface

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM16 + R-DA-CLIENT-RUNTIME-DECOMMISSION + R-DA-UI-PRESENTER-COMPOSITION + cordis regen（Phase B 完成后，在 synced+改造+build-green base 上验证）
**Blocks**: UM11
**Related**: [GA-FORK-CI-green](../phase-misc/GA-FORK-CI-green.md)、[UM-flow-2026-09-08](UM-flow-2026-09-08.md)（Phase C）

## Findings (2026-09-08 调查，已核)

- **tsc 已修**（`c28b928fa9`，落 `upstream/merge-2026-09-07`）：4 个 `Promise<Agent>` 错误（`tool-calls.spec.ts:790,816` 漏 `await` on async `agentLoop.create`）——handoff 摘要说"tsc 0 errors"是错的，从未提交，我修了。
- **tsdown（build:official）不绿**——根 entry 阻塞是 **upstream 共享 breakage**（base `d347e703` + latest `c389f96bf3` 都有，449 没修，upstream master CI 自 8/13 没绿）。**re-sync 修不了**，由 UM16 在 synced base 上 fork-local fix。详见 UM16 + UM13 + UM-flow-2026-09-08。
- 所以本票验证 **pivot 到 post-re-sync**（Phase C）：在 UM14 re-sync + UM16 build-green + R-DA 改造 + cordis regen 之后的 synced+改造 base 上做。

## Scope（post-re-sync，Phase C）

1. `pnpm run typecheck` 绿（tsc 已绿 `c28b928fa9`，post-re-sync 再验）。
2. `pnpm run lint` 绿。
3. `pnpm run build:official` 绿（= UM16 交付）。
4. `pnpm run check:ci:static` 不 regress。
5. `pnpm run check:ci:consumers` 不 regress（GA-FORK-CI 6/7 绿——translation-pairing 本就红，不 regress 即可）。
6. data-agent surface 测试：`packages/data/*` + `packages/client/ui-*`。
7. 修 re-sync（UM14）+ 改造（R-DA）引入的破损。

## Resolution
（待 Phase B 完成后落地：每门 verify 结果 + 修复清单 + GA-FORK-CI 实跑 6/7）
