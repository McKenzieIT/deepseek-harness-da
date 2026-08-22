# P-DA3 — 加厚 persona 修 model-following（qwen3.7-max 不自驱四阶段）

**Type**: prototype
**Phase**: misc
**Status**: resolved (2026-08-22, persona 加厚 + model-following fixed——3 失败全解：早调 query_data 大减 / event-table 工具 3/3 修 / 过早 clarify-decline 3/3 修；route-token 简化 + gate 纠正反馈均不需要 deferred。新 gap = event 定义不暴露表名 → GENERATION 卡 FROM，→ G-DA4)
**Graduated from**: 2026-08-22 (b) e2e model-following finding——qwen3.7-max 不可靠自驱四阶段（早调 query_data / event-table 工具混淆 / 过早 clarify-decline）；persona（A 最小切片）太薄。
**Assignee**: (unclaimed)

## Question

加厚 persona（A 最小切片 → 显式 phase 顺序 + event/table 工具选择 + route 判据），让 qwen3.7-max 可靠自驱四阶段（UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION）；重 e2e 验模型自驱改善。**qwen3.7-max 是 DashScope 最强、不可换模型**，故从指令侧修。

## Spec（3 e2e 失败 → 3 显式指令）

1. **phase 顺序**：UNDERSTANDING 只 `search_data_sources` + `load_*definition` + `present_clarification`；GENERATION 才写 SQL（**不调 query_data**）；EXECUTION 才 `query_data`；INTERPRETATION 才 `present_*`。显式：「`query_data` 是 EXECUTION-only，GENERATION 出 SQL 前绝不调」。
2. **event/table 工具选择**：events（`ods_*` / event 名如 `game.role.online`）→ `load_event_definition`；DWS 表（`dws_*`）→ `load_table_definition`。search 返候选带 `mode`/type——按 type 选 loader，**别拿 event 名调 `load_table_definition`**。
3. **route 判据**：`proceed` = search 返候选 + 已 load 相关定义（有 grounding）+ 无歧义；`clarify` = 真歧义（多候选/口径不明）；`decline` = 无候选/不可答。显式：「若 search 返候选 + 已 load 定义 → 有 grounding → `【route:proceed】`，勿过早 clarify/decline」。

## Files

- `packages/data/phase-gate/src/phase-gate.ts`：`PHASE_INSTRUCTIONS[UNDERSTANDING]` + `BASE_PERSONA` 加厚（3 显式指令）。**route-token 机制保留**（不简化——先看加厚是否够；不够再考虑 route-token 简化 / gate 纠正反馈，另开票）。
- tests：persona 文本断言（可选）。

## 前置/阻塞

- 无：phase-gate 已 ship（P-DA1）；persona 在 phase-gate.ts。
- 与 D2c/P4c/P4d 无关（persona-only）。

## 验收

- 重 e2e：`K11 DAU` → 模型自驱是否改善（reaches EXECUTION reliably? fewer 早调 query_data? fewer 过早 clarify/decline?）。2-3 次探针评估可靠性。
- per-pkg tsc + vitest green；additive（仅 persona 文本）。

## Out of scope

- route-token 简化（defer 除非加厚不够）；gate 纠正反馈（defer）；present_* ship（→ `present-delivery-tools.md` deferred）；更强模型（qwen3.7-max 是 DashScope 最强，不可换）。
