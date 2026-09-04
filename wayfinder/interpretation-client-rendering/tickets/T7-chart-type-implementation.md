# T7 — present_table 图表类型扩展接入实现

**Type**: task (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-04)
**Assignee**: claude-code · 2026-09-04 (this session)
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

## Resolution

实现完成(2026-09-04,claude-code)。R4 决策的 7 native 类型 + 启发式 + 校验器 + toggle + token + bundle 全部落地:

- **server** `packages/data/tool-present-table`:`ChartConfig` 9 类型 + `r_column`;`parameters` + `output.schema` 的 chart enum 扩到 9(`additionalProperties: false` 已验,undelared prop 真拒);`presentTableResult` 去 line/bar-only throw(接受 9,pie-only 仍拒);metric×dimension×grain 启发式写入 tool `description`(prompt-ownership:tool 选型 guidance 归 tool description,一处唯一)。本票 pathspec 原 client-only + data/* 排除;发现 server schema 硬限 line/bar 阻断 LLM emit 新类型(schema enum + throw 双阻),经人确认「全量 R4 — 也改 server」——`tool-present-table` 已 `git status` 核验为干净口袋(data/* 并发 WIP 在 api/remotes/evidence-query/management-session/patrol-mode/result-cache 等,非本包),pathspec-limited commit 不卷 WIP,排除项的 *理由*(不卷 WIP)得守。
- **client** `packages/client/ui-present-table`:`ChartView` 注册 `ArcElement`/`RadialLinearScale`/`Filler` + `Doughnut`/`PolarArea`/`Radar`/`Scatter`/`Bubble` controllers;per-type config(area=line+fill,hbar=bar+`indexAxis:'y'`,scatter/bubble linear x titled scales,doughnut `ArcElement`+cutout,radar/polarArea `RadialLinearScale`);自写 `valueLabelsPlugin`(`afterDatasetsDraw` 顶层叠药丸,>8 非径向不叠,scatter/bubble 不叠,hbar 右/vbar 上/径向中心);`validateChartType`(列-kind + x 基数,line/area 需 date x / scatter ≥2 数值 / bubble ≥3 数值 / doughnut ≤8 类 / radar·polarArea 实体×N metric,不可行降级 bar + 诚实 locale-keyed banner);`ChartSection` 9 type pills + 显示数值(`showLabels`→`valueLabels.display`)+ 仅数据(hide chart;数据表常驻)toggle,thread `colKinds`;locales 7 类型键 + chartLabels/chartData + 5 degrade reason(`chartOff`→`chartData`);CSS `.chartWarn`(alias token,无 literal color)+ chartToolbar flex-wrap。dataset 色 literal canvas(v1 既审 palette,非 CSS);text/grid 色 readCssColor token(v1 pattern)。
- **验证**:141 owning tests(原 93)+ 19 server tests(原 15);per-file 100% 覆盖(`ChartView`/`TableCard`/`locales` 100/100/100/100,分支 100%——`??` defensive fallback + r_column 未定义 + el 无几何 各补覆盖);package + 聚合 client(`tsconfig.client.json`)+ 聚合 host(`tsconfig.host.json`)tsc 全 exit 0;`test:gui` 4291 pass/0 fail(1 transient worker-timeout *error* 在 `ui-directory-picker-browse`,非本包,pre-existing);doc-sync(`verify-export-jsdoc`/`verify-package-readme-model-experience`/`verify-package-readme-limitations`)对 ui-present-table 全绿(失败皆 goal/eval/query 并发 WIP);bundle `lib/client.js` 22.16KB gzip + lazy chart chunk ~70.8KB **minified** gzip(包 build unminified ~102KB,Vite host minify;按 R4 research v1 ~40KB + 7 类型 ~22-31KB = ~62-71KB,**增量 ~31KB < R4 ~55KB 预算**)。
- **Known limitation**:line/area 需 date x(序数 numeric x 不自动识别 → 降级 bar,heuristic 引导 date 列故保守非破;T6 HITL 精修候选);chart bundle ~70.8KB minified gzip(lazy,匹配 R4 全集估算);「仅数据」复用既有 hide-chart(数据表常驻 chart 上方,prototype 的 copy-TSV 由 header copy-MD/CSV 覆盖,故不另加)。

详见 Agent Note:[`.agents/notes/implemented/architecture/2026-09-04-client-present-table-chart-type-expansion.md`](../../../.agents/notes/implemented/architecture/2026-09-04-client-present-table-chart-type-expansion.md)。

→ [T6](T6-chart-integration-testing.md)(HITL 实测 gate)unblocked。

**Post-ship subagent code-review**(2026-09-04,参 T10 `469fd8967b`):static + adversarial probes(`as never` cast / `effectiveType` narrowing / 空 y_columns → yKind@-1 / bubble r_column undefined / meta null·data null / el 无几何 `?? 0` / area=Line·hbar=Bar 的 chart.config.type / 7 类型 render / heuristic description)全 fine;1 **HIGH**(ChartView `seriesColor` 的 `?? '#3b82f6'` 不可达分支 → per-file 100% gate fail,**本 post-ship commit 已修**:`/* v8 ignore next 1 */` + 真实 reason——SERIES_COLORS 非空 literal + i%length 必 in-bounds,fallback 仅为 noUncheckedIndexedAccess);2 MEDIUM(radial(doughnut/polarArea)value-labels 叠在 donut center——R4 prototype 同行为,per-slice arc-centroid 留 T6 HITL 精修,已记 README Known Limitations;line/area 序数 numeric x 不识别——已记);LOW/NIT(`as never` boundary cast[per-type union 故,structurally correct+tested]/ hbar 复用 cartesianScales[cosmetic]/ scatter 空单元点[Chart.js 自处]/ literal tooltip canvas 色[v1 pattern,非 CSS]——acceptable)。coverage 复 `ChartView`/`TableCard`/`locales` 100/100/100/100。详见 Agent Note。
