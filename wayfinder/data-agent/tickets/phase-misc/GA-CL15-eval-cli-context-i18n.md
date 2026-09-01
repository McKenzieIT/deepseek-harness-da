# GA-CL15 — eval-cli context.ts i18n (重复中文扩展 prompt + [粒度])

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-CL-batch.md](GA-CL-batch.md) CL15 (folded to GRILL2 but uncovered — "folded to nowhere", Round 3 found)

## Task

CL15（通用性审计）: `eval-cli/src/context.ts:221,375` 重复中文扩展 prompt + `[粒度]` marker。审计修法: 引用单一源 + localize。

## Why no ticket until now / why deferred

- CL15 在 `GA-CL-batch.md` 关联行原漏（Round 3 G-ticket 审计发现"folded to nowhere"——关联行 + GRILL2 票正文都没 CL15）。Round 3 已在 `GA-CL-batch.md` 关联行补登 CL15→GRILL2 + 标注。
- GRILL2（`GA-GRILL2-i18n-architecture.md`）已 Grilled→Resolved，产出 GA-I18N-1~5 + GA-I18N-R1 子票，但**未覆盖 CL15**（grep 确认 GRILL2 无 `context.ts`/`粒度`）——CL15 是 GRILL2 griled 时的遗漏。
- `eval-cli/src/context.ts` 是 **WIP**（上一 session 在改，+22 行未提交）——CL15 的修法（i18n 改造）依赖 GRILL2 i18n 架构决策 + context.ts WIP 定稿。

## What to do (WIP 落地后)

1. 等 `context.ts` WIP 定稿（上一 session 的 eval-cli 扩展 prompt 工作）。
2. 按 GRILL2 i18n 架构（GA-I18N-1~5 子票），把 context.ts 的重复中文扩展 prompt **引用单一源** + localize `[粒度]` marker。
3. 或并入对应的 GA-I18N-* 子票（如果 context.ts 的扩展 prompt 属于某 I18N 子票范畴）——评估后归并。

## Context pointers

- `GA-CL-batch.md` Round 3 段（CL15 gap 发现）+ 关联行（CL15→GRILL2 补登）。
- GRILL2: `GA-GRILL2-i18n-architecture.md`（resolved）+ GA-I18N-1~5 + GA-I18N-R1 子票。
- context.ts WIP: `packages/eval/eval-cli/src/context.ts:221,375`（重复中文扩展 prompt + `[粒度]`）。
