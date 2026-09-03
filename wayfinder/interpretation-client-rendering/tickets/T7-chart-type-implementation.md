# T7 — present_table 图表类型扩展接入实现

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无（R4 决策已 closed;实现按 R4 spec）
**Blocks**: [T6](T6-chart-integration-testing.md)（接入后实测 gate）
**Related**: [R4](R4-chart-type-expansion.md)（决策:7 类型 + 启发式 + 校验器 + toggle + 预算）、[prototype/index.html](../prototype/index.html)（参考原型 v6）、[T2](T2-ui-present-table.md)（v1 line/bar 实现,本票在其上扩展）

## Question

R4 决策的 7 个新图表类型(area / horizontal-bar / scatter / doughnut / bubble / radar / polarArea)+ 启发式选型(system prompt,metric×dimension×grain→type)+ 客户端校验器(不可行降级 bar)+ 显示数值/仅数据 toggle,真实接入 `packages/client/ui-present-table/` 包。

实现项(R4 spec):
1. 7 类型 Chart.js 配置(hbar 真横置;radar/polarArea 的 `RadialLinearScale`;doughnut 的 `ArcElement`;scatter 的 `LinearScale` x 轴)。
2. system prompt 启发式选型注入。
3. 客户端列-kind/基数校验器(scatter<2 数值列→bar;doughnut>8 类→bar;line x 非日期/序数→bar;bubble<3 数值列→bar;radar/polarArea 非实体×N metric→bar)。
4. valueLabelsPlugin(显示数值 toggle,>8 点不叠)+ 仅数据 toggle(DSH 真实表格 + 复制 TSV)。
5. `--dsw-alias-*` token + `TableCard.module.css` 合规(dsh-plugin-development Mode 3 + AGENTS.md slot/props/styling/export)。
6. bundle 增量 ≤~55KB gzip(research/R4 预算)。

## Scope

destination 实现(按 R4 已定 spec 机械构建,无新决策)。完成后 → [T6](T6-chart-integration-testing.md) 接入后实测 gate(go/no-go;不通过回流本票)。本票把原「destination 无票工作」拉进 map——当前项目开发依赖票推进,无票则不前。
