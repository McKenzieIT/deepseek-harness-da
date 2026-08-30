# R4 — present_table chart 渲染类型扩展

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
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
