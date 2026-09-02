# R4 — present_table chart 渲染类型扩展

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-v1
**Status**: closed (resolved 2026-09-02)
**Assignee**: claude-code · 2026-09-02 (this session)
**Blocked by**: 无（独立）
**Related**: [T2](T2-ui-present-table.md)（v1 实现，仅 line/bar）、[G1](G1-design-decisions.md)（D5: Chart.js 4 tree-shaken）

## Question

当前 `present_table` 的 chart 组件仅支持 line（折线）和 bar（柱状）两种 chart type。是否以及何时扩展更多图表类型（area/pie/scatter/heatmap 等）？

需要回答：
1. 哪些新图表类型对 data-agent 的取数场景有价值？（调研真实 BI 工具的 chart 类型使用频率分布）
2. Chart.js 4 支持哪些类型开箱即用 vs 需要额外插件？tree-shaken bundle size 影响？
3. LLM 如何决定用哪种图表类型？当前 `present_table` 的 `chart.type` 参数是 LLM 自主选择——扩展类型后是否需要约束/建议机制？
4. 优先级排序：哪些类型 v2 做、哪些 v3+？

## Scope

- 调研：真实场景的 chart type 需求分布 + Chart.js 支持情况 + bundle 影响
- 决策（grilling）：扩展哪些、以什么优先级、LLM 选型约束机制

## Resolution

决策（grilling 收口，2026-09-02）：

1. **框架**：留 Chart.js 4。只扩 native 类型；heatmap/sankey/treemap（非 native，需 `chartjs-chart-matrix` 或 ECharts 原生）推迟到独立"迁 ECharts"未来 effort，不并入本 map。
2. **类型全集 + 优先级**：纳入全部 native 类型，不分 v2/v3 阶段——现有 line/bar + 新增 area / horizontal-bar / scatter / doughnut / bubble / radar / polarArea。排除 pie-only（doughnut 更优）。
3. **LLM 选型**：system-prompt 启发式（语义层词汇，metric×dimension×grain→type）+ 客户端列-kind/基数校验器（不可行降级 bar）。启发式：metric+类别维→bar（长标签→h-bar）；metric+时间粒度(ds)→line/area；2 metric→scatter；metric+≤8值维+占比→doughnut；3 metric→bubble；实体×N metric→radar/polarArea。校验器：scatter<2数值列→bar；doughnut>8类→bar；line/area x 非日期/序数→bar；bubble<3数值列→bar；radar/polarArea 非实体×N metric→bar。保留用户 toggle（显示数值/仅数据）作最终覆盖。依据：Tableau Show Me / Metabase / Vega-Lite 均数据形状启发式。
4. **每图展示什么（K11 语义层锚定）**：图表词汇 = metric×dimension×grain。K11 语义层 = domains + tables(dim/dws, di/df/mi 粒度, 按 ds 分区) + columns(role: dimension/measure/partition) + metrics(具名+SQL 表达式) + dimension_refs(join 路径)。例：pay_amt_sum×ds→line；pay_amt_sum×pay_type→bar/doughnut；pay_amt_sum×server_id(长标签)→h-bar；pay_arpu×pay_account_uv→scatter；pay_amt_sum×pay_account_uv×pay_arpu→bubble；单服×N metric→radar/polarArea。

资产：
- 研究笔记：[research/R4-chart-type-expansion.md](../research/R4-chart-type-expansion.md)
- 原型：[prototype/index.html](../prototype/index.html)（v6，单 HTML，Chart.js CDN）：模拟 DSH 对话场景，11 turn 覆盖 8 类型 + 2 校验器降级演示；每图卡片内"显示数值"开关（自写 valueLabelsPlugin, afterDatasetsDraw 顶层叠数值药丸,>8 点不叠）+"仅数据"（DSH 真实表格+复制 TSV）；用真实 --dsw-alias-* token 镜像 TableCard.module.css。真实落地走 Mode 3（toolview 注册见 R3/T2），AGENTS.md 纪律适用于真实包。

移交：7 类型的真实实现（接入 ui-present-table + system prompt 启发式 + 客户端校验器 + valueLabelsPlugin/token）是 destination 工作（wayfinder "plan don't do"）；接入后实测 → [T6](T6-chart-integration-testing.md)。
