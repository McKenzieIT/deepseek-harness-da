# GA-GT3-5c — backfill `origin` 字段到 K11 现存 ref（数据卫生）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（origin 字段卫生）
**Size**: M  ·  **Risk**: Med（分类错→下次 re-discovery 丢数据）

## 问题

GA-I18N-1 加了 `origin` 字段但选了 lazy migration——`examples/k11-semantic-layer/` 下 4344 条现存 dimension_ref/external_ref **全 `undefined`**（无 origin）。GA-GT3 item 5（PR #43）用 `undefined≡manual` 保住它们，但 `origin` 字段对现存数据**形同虚设**（从不写值）。

一次性迁移：给 K11 现存「确定性可复现」ref（即 `discoverRelationsDeterministic` 能重新导出的）补 `origin: deterministic`；其余（手工 curated / 不可复现）留 `undefined`（≡manual，保住）。

## scope

- 新脚本 `scripts/backfill-k11-deterministic-origin.ts`：对 K11 layer（`examples/k11-semantic-layer/`）重跑确定性轮，现存 ref 若被确定性轮重新导出（同 `dim_table` + 至少一组同名 `join_keys`）→ 标 `origin: deterministic`；否则留 `undefined`。
- backfill 结果：改 `examples/k11-semantic-layer/{tables,events}/**/*.yaml`（约 190 个文件，给确定性可复现 ref 加 `origin: deterministic`）。
- **TDD/验证（关键）**：脚本对 fixture 跑，断言 deterministic-reproducible ref 被标 `deterministic`、manual/undefined ref **不被误标**。**分类必须正确**——误把 manual 标 `deterministic` → 下次 re-discovery（origin-aware replace）会丢它 = 数据丢失。
- 跑 `pnpm typecheck` + 相关包 vitest 确认无回归。

## 不做

- 不改 `enrichment.ts`（item 5 行为不变；本票只填数据）。
- 不批量改 non-K11 layer（x63 等另议）。
- 不动 `origin: manual`/`origin: llm` 的现存 ref（只补 `deterministic`）。

## 参考

PR #15（`fix/ga-gt3-mergeexisting-dataloss`，已 close）的 commit `04f4b7fe82` + `scripts/backfill-k11-deterministic-origin.ts` 有现成实现，**可参考但必须审分类逻辑 + TDD**（不盲 cherry-pick）。
