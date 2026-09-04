# T6 — present_table 图表扩展接入后实测

**Type**: task（HITL——需人眼校真实渲染）
**Phase**: post-impl
**Status**: closed (resolved 2026-09-04, GO)
**Assignee**: claude-code · 2026-09-04 (this session; go via render harness ../dsh-t6-render-harness)
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

## Resolution

**GO**（2026-09-04，HITL 视觉 gate 过）。9 R4 类型在 K11 形态 query_data 上正确渲染 + 2 post-ship 精修候选 land（PR #7 `fix/T6-chart-integration-testing`）。经 standalone render harness（`../dsh-t6-render-harness`，import 真实 `ChartView` + `validateChartType` + `parseQueryData` from 本 worktree，绕 DSH web-app boot——pre-existing CB-4 zod master 回归阻 web app，不阻 harness）人眼校验：

- **9 类型**：line / bar / area / **hbar（真横置 `indexAxis:'y'`）** / **scatter（`LinearScale` titled x 轴）** / **doughnut（`ArcElement` + cutout）** / bubble / **radar + polarArea（`RadialLinearScale`）**——均正确渲染。
- **显示数值 toggle**：doughnut/polarArea 药丸落 per-slice arc-centroid（fix 1——原叠 donut center）；hbar 右 / vbar 上 / line 上 / radar 各点；scatter/bubble 跳过；>8 非径向跳过。
- **5 降级规则**：`degradeLineDate`（line+string-x）/ `degradeScatter`（scatter+非 numeric）/ `degradeDoughnut`（>8 类）/ `degradeBubble`（<3 numeric）/ `degradeRadar`（非 categorical×numeric）——均出 locale-keyed banner + 降 bar。
- **fix 2（序数 numeric x）**：line/area 接受单调非递减 numeric x（不降级）；非序数/非 numeric 仍降级。
- **仅数据 toggle**：隐 chart 显数据表。

**2 fix（PR #7）：** (1) `valueLabelsPlugin` radial arc-centroid（`ChartView.tsx`，per-slice centroid via `startAngle/endAngle/innerRadius/outerRadius` + `?? 0` fallback）；(2) `validateChartType` line/area 序数 numeric x 放宽（`TableCard.tsx` + `isOrdinalNumericX`——接受 date OR 单调 numeric x；非序数/非 numeric 降级）。

**验证（本包 ui-present-table）：** 165 tests（160→165，+5 TDD red→green）+ per-file coverage ChartView/TableCard 100/100/100/100 + bundle chart chunk +87B gzip（R4 ~55KB 增量预算内）+ README 删 2 fixed Known Limitations + passes `verify-package-readme-limitations`。

**master 状态注：** PR #7 CI 红是 pre-existing master 问题——CB-4 zod 回归（api-remotes client bundle 启动失败，并发 session 在 CB-4 票里追）+ checkout/issue-policy infra fail。皆非 ui-present-table；fix 已验绿。早先疑的「master remotes refactor break」是误报（fresh-worktree no-builds；copy 8 个 data package 的 built `lib/` → aggregate tsc 绿；CI fresh checkout + build → 绿）。

→ T6 closed（go）。R4 chart-type 扩展全 landed + 验证。
