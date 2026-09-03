# R10 — 查询理解卡与 present_table metric 身份互认(数据层调研)

**Type**: research (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（数据流依赖已解:P1 卡终版 + R6 result store/compute/`result.get` RPC 通路）
**Related**: [P1](P1-decomposition-prototype.md)（decomposition 卡终版:焦点行/谱系 chips/常显指标网格/信任带）、[T2](T2-ui-present-table.md)/[T4](T4-present-table-display-upgrade.md)（present_table KPI 卡:`kpi_columns`）、[R6](R6-result-store-server-side.md)（`result_id` 数据通路）

## Question

`present_decomposition` 卡(P1 终版)的「指标口径」网格 与 `present_table` 的 `kpi_columns` KPI 卡,在**数据层是否共享同一 metric 身份**(按 `result_id` 关联)?即:两张卡渲染的 metric 是否同源、可否互认?

调研:
1. decomposition 卡的「指标口径」metric 从哪来(query understanding / LLM 声明?字段路径?经 `result_id`?)。
2. present_table 的 `kpi_columns` 从哪来(`query_data` 结果字段?`argsRaw`?经 `result_id`?)。
3. 两者是否同源、是否共享 `result_id`、可否建立 metric 身份对应。

## Scope

仅 research(查数据模型 + 字段路径 + 源码,AFK)。结论 → 毕业 grilling 票(两卡是否应联动/链接 metric)。本票是 map「查询理解↔table KPI 互认」雾的**语义层**磨清。
