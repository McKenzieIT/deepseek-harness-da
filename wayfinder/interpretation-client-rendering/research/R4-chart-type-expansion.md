# R4: present_table chart 渲染类型扩展 — research findings

## Summary

- **Chart.js 4 ships all 8 core chart types in the `chart.js` npm package** — line, bar, pie, doughnut, scatter, bubble, radar, polarArea — each just needs the right `register()` call. None require a separate package. The one exception is **heatmap, which is NOT native** and requires the third-party `chartjs-chart-matrix` package.
- **The cheapest additions to DSH's current line+bar set are: area (filled line via `fill:true` + Filler plugin, ~2-3KB gzip), horizontal bar (zero new code — `indexAxis:'y'` config only), and scatter (~1-2KB, reuses already-registered `PointElement`+`LinearScale`).** Pie/doughnut add `ArcElement` (~5-7KB). Radar/polarArea are heavier because they need a new `RadialLinearScale` (~6-8KB).
- **Every major BI tool + most LLM data-agents converge on the same small core for "SQL result → chart": bar, line, area, scatter, pie/doughnut.** Tableau "Show Me", Metabase, and Vega-Lite all use **data-shape heuristics** (count of dimensions/measures + field types) to auto-pick the type — not free LLM choice. ChatGPT Advanced Data Analysis is the outlier: free LLM choice via generated matplotlib code.
- **Recommended v2 set: area, horizontal bar, scatter, doughnut.** ~10-15KB additional gzip over the current ~40KB, all core Chart.js, no new third-party package, react-chartjs-2 already exports the matching components (`Doughnut`, `Scatter`; area/h-bar are config on `Line`/`Bar`).
- **Recommended v3+ set: radar, polarArea, bubble, heatmap, and a future ECharts migration** for heatmap/sankey/treemap if those become priority.

## 1. Chart-type usage frequency / value

For the DSH scenario — an LLM runs SQL and visualizes the result set (typical shape: categorical X + 1+ numeric Y, or time + numeric, or 2 numeric) — the chart types that matter cluster tightly.

**Widely supported across BI tools (Tableau, Power BI, Looker, Metabase, Apache Superset, Grafana):** bar, line/area, pie/doughnut, scatter/bubble, table, heatmap. Superset alone ships 40+ pre-installed viz types including `table, line, bar, pie, area, scatter, bubble, heatmap, box_plot, treemap, sunburst, sankey, graph_chart, map` [superset.apache.org/docs/intro]. Grafana's built-in panels: Time series, Bar chart, Histogram, Heatmap, Pie chart, Stat, Gauge, Bar gauge, Table, State timeline, Candlestick, Trend, XY chart, Geomap [grafana.com/docs/.../visualizations]. Metabase native types: table, line, bar, area, pie, scatter, bubble, histogram, funnel, map, combo, pivot [metabase.com/docs].

**Frequently the *right* choice for SQL result sets (ranked):**

1. **Bar / horizontal bar** — categorical X + numeric Y. The default for "compare N groups." Tableau's Show Me defaults to bar for 1 dimension + 1 measure; every tool lists it first.
2. **Line** — time/ordinal X + numeric Y. The default for trends. Metabase auto-selects line when you group a metric by time [metabase.com docs, "Views"].
3. **Area (filled line)** — trend + cumulative volume; stacked area for part-to-whole over time.
4. **Scatter** — two numeric columns (correlation). Databricks docs: "散点/气泡图: 显示两个数值变量之间的关系" [learn.microsoft.com Databricks visualize].
5. **Doughnut / pie** — part-of-whole for a categorical column with few (≤6-8) categories. Databricks: "饼图: 适合显示整体比例部分(但不适用于时序)" [same].
6. **Heatmap** — category × category × measure density. High value but rarer shape for ad-hoc SQL.
7. **Radar / polarArea** — multi-dimensional comparison of a few entities across many equal-scale axes. Niche for SQL result sets.
8. **Bubble** — 3 numeric columns (x, y, radius). Rare in SQL output.

**LLM data-agent UIs:** ChatGPT Advanced Data Analysis generates Python (pandas + matplotlib/seaborn) code with **free LLM choice** of chart type — no constrained data-shape heuristics; the user typically names the chart or the model picks one [php.cn FAQ "如何使用ChatGPT进行数据可视化"]. Julius AI and Hex Magic similarly render via Python plotting libraries with LLM-selected types. The notable exception is **Flint** (Microsoft Research + Renmin Univ. IDEAS Lab): an intermediate visualization language where the LLM outputs ~10 lines of semantic JSON (`chart_type` + `semantic_types` + `encodings`) and a **compiler** validates and expands it into full ECharts/Chart.js/Vega-Lite configs [CSDN, "Flint 可视化中间语言"]. This is the strongest prior-art for "LLM proposes in a constrained vocabulary + a validator/expander."

## 2. Chart.js 4 type support + bundle impact

Chart.js 4 is tree-shakeable: "JavaScript bundle size can be reduced by dozens of kilobytes by registering only necessary components" [chartjs.org homepage]. The official integration doc lists each type's **bare-minimum requirements** [chartjs.org/docs/latest/getting-started/integration.html]:

| Type | Core vs separate pkg | Components needed (beyond current DSH set) | +gzip KB vs current (~40KB line+bar) | Notes |
|---|---|---|---|---|
| **Area** (filled line) | core | `Filler` plugin (+ `fill:true` on line dataset) | ~2-3 KB (approx.) | Reuses `LineController`/`LineElement`/`PointElement`. Docs: "Filler — used to fill area described by LineElement, see Area charts" [integration.html]. |
| **Horizontal bar** | core | **none** — just `indexAxis: 'y'` config on a bar chart | **0 KB** | Same `BarController`+`BarElement`; only config changes. |
| **Scatter** | core | `ScatterController` (+ use `LinearScale` on x-axis) | ~1-2 KB (approx.) | Reuses `PointElement` + `LinearScale` (already registered for y). **Caveat:** current DSH registers `CategoryScale` on x; scatter needs `LinearScale` on x — but `LinearScale` is already imported, just needs to be applied to the x-axis config, no new registration. |
| **Bubble** | core | `BubbleController` (reuses `PointElement` + `LinearScale`) | ~1-2 KB (approx.) | Data points are `{x,y,r}`. |
| **Pie** | core | `PieController` + `ArcElement` | ~4-6 KB (approx.) | No scales used. `ArcElement` is the substantive new element. |
| **Doughnut** | core | `DoughnutController` (reuses `ArcElement` from pie) | ~1-2 KB incremental over pie | Center cutout configurable; often preferred over pie. |
| **Radar** | core | `RadarController` + `RadialLinearScale` (reuses `LineElement`+`PointElement`) | ~6-8 KB (approx.) | `RadialLinearScale` is a full new scale (radial grid, angle lines, point labels). |
| **PolarArea** | core | `PolarAreaController` + `RadialLinearScale` + `ArcElement` | ~7-9 KB (approx.) | Heaviest of the radial set; needs both new scale and new element. |
| **Heatmap** | **separate package** | `chartjs-chart-matrix` (`MatrixController`, `MatrixElement`) | ~10-15 KB (approx.) + new dependency | **Not native.** Chart.js docs: "additional community-maintained chart types" [chartjs.org/docs/latest]. Confirmed by chartjs-chart-matrix package ("Chart.js module for creating matrix charts"). |

**Bundle-size methodology & caveats:** bundlephobia.com was unreachable (HTTP 403) during research, so the gzip figures are reasoned approximations, not measured. Anchors: (a) the chart.js homepage claims tree-shaking saves "dozens of kilobytes" [chartjs.org]; (b) a CSDN technical article states the full `chart.js/auto` build is "gzip 后不到 60KB" [CSDN, "ChartJS数据可视化实战"]; (c) a Vue-ECharts vs Chart.js comparison reports Chart.js "核心包32KB" (gzip) for a minimal tree-shaken build [CSDN, "Vue ECharts与Chart.js对比"]. Against the orchestrator's known ~40KB gzip for DSH's line+bar set, the full/auto build (~60KB) leaves ~20KB for *all* remaining controllers + `RadialLinearScale` + `ArcElement` + `Filler` + `Decimation` + extra scales. The per-type estimates above are the controller/scale/element slices of that ~20KB pie, labeled approximate. react-chartjs-2 already exports `Pie`, `Doughnut`, `Radar`, `PolarArea`, `Bubble`, `Scatter` components [confirmed via react-chartjs-2 docs/CSDN], so no wrapper cost.

## 3. LLM chart-type selection mechanisms

**Prior art splits into two camps:**

1. **Data-shape-driven (constrained):** Tableau "Show Me" auto-selects mark type from the count and type of dimensions/measures dropped on shelves — e.g. 1 dimension + 1 measure → bar; a temporal field + measure → line; 2 measures → scatter; 1 dimension with proportions → pie [Mackinlay, Hanrahan, Stolte, "Show Me: Automatic Presentation for Visual Analysis," Tableau whitepaper, 2007; the PDF was unreachable (403), so rules are summarized from the abstract + secondary descriptions — labeled]. Metabase: "if you select a metric, like count of orders, and group by time, Metabase will automatically select a line chart" and "greys out" incompatible types (e.g. map when no geo data) [metabase.com/docs, "Views"]. Vega-Lite uses a grammar-of-graphics `mark` + `encoding` (field + type) spec; the type system (quantitative/ordinal/nominal/temporal) constrains valid marks [vega.github.io/vega-lite tutorial]. The standard data-shape → chart heuristic table (widely reproduced):
   - categorical + numeric → bar
   - time + numeric → line/area
   - 2 numeric → scatter
   - categorical + proportions (≤8) → pie/doughnut
   - category × category × measure → heatmap
2. **Free LLM choice:** ChatGPT Advanced Data Analysis, Julius, Hex Magic all let the LLM generate plotting code (matplotlib/plotly) and pick the type from natural language. No validation against data shape — if the user says "pie" with 30 categories, it draws an unreadable pie.

**Recommendation for DSH:** **LLM-proposes-with-data-shape-heuristics + client validates against sniffed column kinds.** Rationale:
- DSH already has the LLM setting `chart.type` in the `present_table` tool-call JSON, and the client already sniffs each column's `ColumnKind` (`number`/`date`/`string`) for sorting. So both signals are present for free.
- Put the heuristic in the **system prompt** so the LLM proposes well: "1 categorical + 1+ numeric → bar; time/date x + numeric → line or area; 2 numeric → scatter; single categorical with ≤8 rows and part-of-whole intent → doughnut; long category labels → horizontal bar."
- Add a **thin client-side validator** that downgrades an impossible choice rather than rendering garbage: e.g. scatter requested but <2 numeric columns → fall back to bar; doughnut requested with >8 categories → fall back to bar; line requested with a non-date/non-ordinal x-column → fall back to bar. This mirrors Metabase's "grey out" and Flint's compiler-validate-and-expand pattern, and preserves the user-override toggle DSH already has.
- Keep the existing user toggle buttons (now expanded: bar / line / area / horizontal-bar / scatter / doughnut / off) so the user always has the final say.

## 4. Priority recommendation (v2 vs v3+)

**v2 set (ship first — highest value, lowest cost, all core Chart.js, no new package):**

- **Area (filled line)** — `fill:true` + `Filler` plugin, ~2-3KB. Trend + volume in one glance; stacked-area for part-to-whole over time. Cleanest win.
- **Horizontal bar** — `indexAxis:'y'` on existing `Bar`, 0KB new code. Essential when category labels are long (the single most common "the bar chart is unreadable" complaint).
- **Scatter** — `ScatterController`, ~1-2KB, reuses `PointElement`+`LinearScale`. The canonical chart for 2 numeric columns; currently impossible in DSH.
- **Doughnut** — `DoughnutController`+`ArcElement`, ~5-7KB (pie shares the cost). Part-of-whole for ≤8 categories; doughnut over pie for readability.

Total v2 added cost: ~10-15KB gzip on top of the current ~40KB, staying under ~55KB — still far below ECharts' ~170KB.

**v3+ set (defer — lower value, bigger bundle, new package, or better in ECharts):**

- **Bubble** — low value for SQL result sets (3 numeric columns with the 3rd as radius is rare); +1-2KB but reuses `PointElement`. Could be a cheap v2.5 add.
- **Radar / polarArea** — need new `RadialLinearScale` (~6-8KB); niche for SQL output (multi-dimensional entity comparison). Defer.
- **Pie** (non-doughnut) — visually inferior to doughnut; only add if a user explicitly wants it. ~0KB over doughnut.
- **Heatmap** — high value for category×category×measure, but requires `chartjs-chart-matrix` (new third-party package, ~10-15KB) and ECharts does heatmaps natively. **Defer to a future ECharts migration** alongside sankey/treemap, which are also non-native to Chart.js.
- **Stacked bar/area, combo (line+bar)** — not new *types*, just config on existing controllers (`stacked:true`, mixed datasets); can be added in v2 as options if cheap, but not a type-expansion.

## Sources

- https://www.chartjs.org/docs/latest/getting-started/integration.html — Chart.js 4 bare-minimum components per chart type; Filler/Decimation plugin list; tree-shaking registration.
- https://www.chartjs.org/ — Chart.js homepage; "tree-shaking reduces bundle by dozens of KB"; 8 core chart types; MIT license.
- https://superset.apache.org/docs/intro — Apache Superset; 40+ pre-installed viz types; plugin architecture.
- https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/ — Grafana built-in visualization types list.
- https://www.metabase.com/docs/latest/ (and "Views" tutorial) — Metabase native chart types; auto-selection by data shape; grey-out of incompatible types.
- https://www.tableau.com/sites/default/files/whitepapers/081027-infovis-showme-vfinal-fix.pdf — Mackinlay/Hanrahan/Stolte, "Show Me: Automatic Presentation for Visual Analysis" (InfoVis 2007); the canonical data-shape→mark-type rules. PDF was unreachable (403) during research; rules summarized from abstract + secondary descriptions, labeled as such.
- https://vega.github.io/vega-lite/tutorials/getting_started.html — Vega-Lite grammar: data + mark + encoding (field+type) as the constrained-spec approach.
- https://learn.microsoft.com/.../use-apache-spark-azure-databricks/06-visualize-data (and /visualizations/types) — Azure Databricks AI/BI dashboard viz types + the standard data-shape→chart guidance (bar/line/area for trends, pie for proportions, scatter/bubble for 2 numeric, heatmap for cat×cat).
- https://bundlephobia.com/package/chart.js — intended for measured gzip size; **unreachable (HTTP 403)**, so bundle estimates are reasoned from component structure + secondary size reports, labeled approximate.
- CSDN "ChartJS数据可视化实战:多图表类型与动态配置详解" — secondary source: chart.js full/auto build "gzip 后不到 60KB."
- CSDN "Vue ECharts与Chart.js对比" — secondary source: Chart.js core tree-shaken ~32KB gzip; ECharts core ~128KB gzip.
- CSDN "Flint 可视化中间语言:AI Agent 时代的图表生成实践与思考" — Flint (MS Research + RUC IDEAS Lab): LLM outputs constrained semantic spec, compiler expands to ECharts/Chart.js/Vega-Lite; prior art for LLM-proposes + validator pattern.
- CSDN, chartjs-chart-matrix package listing — confirms `chartjs-chart-matrix` as the third-party Chart.js module for heatmap/matrix charts (not native to core).
- react-chartjs-2 docs (via CSDN "react-chartjs-2深度解析") — confirms exported components: `Line, Bar, Pie, Doughnut, Radar, PolarArea, Bubble, Scatter`.
