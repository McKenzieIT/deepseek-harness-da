# R10 — 查询理解卡与 present_table metric 身份互认(数据层调研)

**Type**: research (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
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

## Resolution

Resolved 2026-09-03 (this session, AFK `/research` subagent)。**结论:两卡 metric 身份独立——无共享、无 `result_id` 链接、客户端不可建立对应。**

- `present_decomposition` 卡的「指标口径」metric = 纯 LLM 声明的自由文本 `{ name, value, unit? }`(在 `argsRaw`),`value` 是描述/表达式**非**计算值;**该工具全包零 `result_id`**(`grep result_id` 退出 1,无字段)。
- `present_table` 的 `kpi_columns` = `argsRaw` 声明的选择规格 `{ column, aggregation, label, format? }`(`column` 为数值索引),其 KPI **值**在 render 时从 `result_id` 绑定的 `query_data` 行计算(sum/avg/max/min/count)。
- 身份模型不兼容:`(name, value)` 自由文本对 vs `(result_id, column_index, aggregation)` 三元组;无共享 key、无语义 id、无交叉引用。唯一可想象链接 = LLM authored label 巧合(都标 "DAU"),但标签独立生成无一致性保证——**非**客户端可依赖的数据层对应。

**毕业**:map「查询理解↔table KPI 互认」雾的**语义层**(是否联动 metric)→ 结论 **否**(无需 metric 链接;建链接将桥接两个独立 LLM 声明仅凭 label 巧合,脆弱且无据),**不为 metric-链接开新 grilling 票**。「选哪种 affordance」= [P2](P2-decomposition-revision-prototype.md)(低置信改口径 affordance 形态,prototype),独立于 R10——R10 既不 block 也不 bind P2;R10 的「无 link」反而收窄 P2 scope(改口径不波及 table)。

资产:研究笔记(primary-source file:line 引证):[research/R10-decomposition-table-metric-identity.md](../research/R10-decomposition-table-metric-identity.md)
