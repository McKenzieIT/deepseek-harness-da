# UM10 — verify：typecheck + lint + check:ci:static + check:ci:consumers + data-agent surface

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM2–UM9
**Blocks**: UM11
**Related**: [GA-FORK-CI-green](../phase-misc/GA-FORK-CI-green.md)

## Scope

1. `pnpm run typecheck` 绿。
2. `pnpm run lint` 绿。
3. `pnpm run check:ci:static` 不 regress。
4. `pnpm run check:ci:consumers` 不 regress（GA-FORK-CI 6/7 绿——translation-pairing 本就红，不 regress 即可）。
5. data-agent surface 测试：`packages/data/*` + `packages/client/ui-*`（含 interpretation-client-rendering 的 ui-present-* / result-cache）。
6. 修 UM2–UM9 引入的破损。

## Resolution
（待落地后填：每门 verify 结果 + 修复的破损清单 + GA-FORK-CI 实跑 6/7）
