# T6 — present_table 图表扩展接入后实测

**Type**: task（HITL——需人眼校真实渲染）
**Phase**: post-impl
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [T7](T7-chart-type-implementation.md)（R4 7 类型接入实现;实现已从 destination 无票拉进 map 作 T7——当前项目开发依赖票推进;T7 完成本票即 go/no-go gate）
**Related**: [R4](R4-chart-type-expansion.md)（决策）、[prototype/index.html](../prototype/index.html)（参考原型 v6）、[T2](T2-ui-present-table.md)（v1 line/bar 实现）

## Question

R4 决策的 7 个新图表类型（area / horizontal-bar / scatter / doughnut / bubble / radar / polarArea）+ 启发式选型 + 客户端校验器 + 显示数值/仅数据 toggle 真实接入 `packages/client/ui-present-table/` 后，对真实 K11 `query_data` 结果跨域跑一遍，验证：

1. 每种类型正确渲染（含 hbar 真横置、radar/polarArea 的 `RadialLinearScale`、doughnut 的 `ArcElement`、scatter 的 `LinearScale` x 轴）。
2. LLM 按启发式（system prompt，metric×dimension×grain→type）选型合理。
3. 客户端校验器对不可行选择正确降级（scatter<2 数值列→bar；doughnut>8 类→bar；line x 非日期/序数→bar；bubble<3 数值列→bar；radar/polarArea 非实体×N metric→bar）。
4. "显示数值" toggle（valueLabelsPlugin 顶层叠数值药丸，>8 点不叠）+"仅数据" toggle（DSH 真实表格 + 复制 TSV）工作正常、不遮挡。
5. `--dsw-alias-*` token + `TableCard.module.css` 样式合规（dsh-plugin-development Mode 3 + AGENTS.md slot/props/styling/export 纪律）。
6. bundle 增量在预算内（v2+v3 全 native，~55KB gzip 内，见 [research/R4](../research/R4-chart-type-expansion.md)）。

通过即 go；不通过回流实现。

## Scope

仅实测验证（接入后）。实现本身（接入 ui-present-table + system prompt 启发式 + 客户端校验器 + valueLabelsPlugin + token）是 destination 工作（wayfinder "plan don't do"），不另开实现票；本票 gate 其 go/no-go。
