# GA-CL15 — eval-cli context.ts i18n (重复中文扩展 prompt + [粒度])

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-CL-batch.md](GA-CL-batch.md) CL15 (folded to GRILL2 but uncovered — "folded to nowhere", Round 3 found)

## Task

CL15（通用性审计）: `eval-cli/src/context.ts:221,375` 重复中文扩展 prompt + `[粒度]` marker。审计修法: 引用单一源 + localize。

## Why no ticket until now / why deferred

- CL15 在 `GA-CL-batch.md` 关联行原漏（Round 3 G-ticket 审计发现"folded to nowhere"——关联行 + GRILL2 票正文都没 CL15）。Round 3 已在 `GA-CL-batch.md` 关联行补登 CL15→GRILL2 + 标注。
- GRILL2（`GA-GRILL2-i18n-architecture.md`）已 Grilled→Resolved，产出 GA-I18N-1~5 + GA-I18N-R1 子票，但**未覆盖 CL15**（grep 确认 GRILL2 无 `context.ts`/`粒度`）——CL15 是 GRILL2 griled 时的遗漏。
- `eval-cli/src/context.ts` 是 **WIP**（上一 session 在改，+22 行未提交）——CL15 的修法（i18n 改造）依赖 GRILL2 i18n 架构决策 + context.ts WIP 定稿。

## What to do (scope 已被 GA-EXP2 重新定义)

**GA-EXP2 结论（2026-09-02）**：英文 prompt 灾难性退化 -41%，prompt 保留中文。因此：

- ~~localize（英文化）~~ → **不做**（EXP2 证实英文 prompt 不可行）
- **引用单一源（去重）** → **仍可做**：context.ts:221 的 `EXPANSION_SYSTEM_PROMPT` 是 expand-query.ts 的复制品，应改为 import 单一源
- **`[粒度]` marker** → 已被 GA-I18N-3 处理（TREND_PATTERN 双语化），`granularityTag` 返回的 `[日粒度]`/`[快照]` 保留中文（EXP2 证实不改）
- context.ts 的 EXP2 WIP 已落地（`EXP2_ARM` env var + `buildPromptEN` import + expansion prompt 条件切换），作为实验基础设施保留

**剩余行动**：仅 expansion prompt 去重（import from expand-query.ts 而非 copy）。scope 从 "i18n 改造" 缩减为 "去重引用"。

## Context pointers

- `GA-CL-batch.md` Round 3 段（CL15 gap 发现）+ 关联行（CL15→GRILL2 补登）。
- GRILL2: `GA-GRILL2-i18n-architecture.md`（resolved）+ GA-I18N-1~5 + GA-I18N-R1 子票。
- context.ts WIP: `packages/eval/eval-cli/src/context.ts:221,375`（重复中文扩展 prompt + `[粒度]`）。
