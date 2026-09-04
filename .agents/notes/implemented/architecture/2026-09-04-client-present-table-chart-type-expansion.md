# Agent Note: ui-present-table chart-type expansion — the R4 7 native types + heuristic + validator

Status: implemented

English

## Problem

`ui-present-table`'s chart component rendered only `line`/`bar` (T2's v1).
[R4](../../../../wayfinder/interpretation-client-rendering/tickets/R4-chart-type-expansion.md)
decided to ship the full native Chart.js 4 set — area, horizontal-bar, scatter,
doughnut, bubble, radar, polarArea, alongside line/bar — with an LLM heuristic
(metric × dimension × grain → type) and a client column-kind/cardinality
validator that degrades an infeasible choice to bar. R4 explicitly chose **no
phasing** (all 7 at once, not 3+4); pie-only is excluded (doughnut is
preferred); heatmap/sankey/treemap are non-native and deferred to a separate
ECharts effort.

A blocker the task pathspec did not foresee: the server tool
`present_table` hard-restricted `chart.type` to `enum: ['line', 'bar']` (both
the `parameters` schema and `presentTableResult()`, which threw on any other
type). So the LLM could not emit a new type — the tool call errored before the
client saw it. Per the repo's prompt-ownership rule (per-tool semantics and
selection guidance live in the **tool description**), the heuristic also
belongs server-side. So delivering R4's "LLM 选型 = system-prompt 启发式"
required extending `packages/data/tool-present-table` — which sits in the
`data/*` exclusion zone the task copied from T10.

## Decision

**Full R4 — extend the server too** (the human's call, 2026-09-04). The
`data/*` exclusion's stated reason is "don't entangle concurrent WIP"; a
`git status` check confirmed `tool-present-table` is a verified clean pocket —
no concurrent session modifies it (the data/* WIP is in api/remotes,
evidence-query, management-session, patrol-mode, result-cache, etc.). A
pathspec-limited commit to an unmodified package does not entangle WIP, so the
exclusion's reason is honored even as its letter is stretched. The client
work is the bulk; the server change is the minimal schema + description
extension R4 requires.

### Server (`packages/data/tool-present-table`)

- `ChartConfig.type` → a 9-member literal union
  (`line|bar|area|hbar|scatter|doughnut|bubble|radar|polarArea`); added
  optional `r_column` (bubble radius). Kept as a runtime `CHART_TYPES` list so
  the schema enum + the fail-loud guard stay in lockstep with the union.
- `parameters.chart.type.enum` → the 9 types; `r_column` added to the
  `parameters` + `output.schema` (both `additionalProperties: false`, so the
  schema genuinely rejects undeclared props — verified by the failing test
  that became green). `presentTableResult`'s throw now accepts the 9 types;
  pie-only and any non-native type are still rejected (R4: doughnut over pie).
- The tool `description` carries the metric × dimension × grain heuristic
  (time grain → line/area; category → bar, long labels → hbar; 2 metrics →
  scatter; 3 metrics → bubble; ≤8 value dimensions + share → doughnut; one
  entity × N metrics → radar/polarArea) + a note that the client degrades
  infeasible choices to bar. This is the one owner for chart-selection
  guidance (the prompt-ownership rule); the client adds no second copy.

### Client (`packages/client/ui-present-table`)

- **`ChartView.tsx`** registers the new Chart.js components
  (`ArcElement`, `RadialLinearScale`, `Filler`, `Doughnut`/`PolarArea`/`Radar`/
  `Scatter`/`Bubble` controllers) and renders each type via the matching
  react-chartjs-2 component. `area` is a filled `Line`; `hbar` is a `Bar` with
  `indexAxis: 'y'`; scatter/bubble use a linear x-axis with titled scales;
  doughnut uses `ArcElement` + `cutout`; radar/polarArea use `RadialLinearScale`.
  Dataset colors are literal canvas values (consistent with the reviewed v1
  palette + the R4 prototype) — the "no literal color" rule applies to the
  CSS module, not to Chart.js JS-side dataset props; text/grid colors still
  read from `--dsw-alias-*` tokens via `getComputedStyle` (the v1 pattern).
- **`valueLabelsPlugin`** is self-written (replaces chartjs-plugin-datalabels
  — no CDN dep, full draw-order/position control). `afterDatasetsDraw` draws
  value-pills on top of every dataset; skips scatter/bubble (points carry the
  value) and non-radial charts with >8 points (would collide); pill placement
  is hbar → right, vbar/line/area/radar → above, doughnut/polarArea → arc
  center. `display` is driven by the `showLabels` prop →
  `options.plugins.valueLabels.display`.
- **`validateChartType`** (in `TableCard.tsx`, exported for direct testing —
  internal module export, not a `/client` entry export, per AGENTS.md rule 2)
  sniffs column kinds (declared `column_types` win, else sniffed upstream) +
  x cardinality and degrades to `bar` with a locale-keyed reason: line/area
  need a date x; scatter needs ≥2 numeric columns; bubble needs ≥3 (x, y,
  `r_column`); doughnut needs ≤8 distinct x classes; radar/polarArea need a
  categorical x + numeric y (entity × N-metric shape). bar/hbar always pass.
  Ordinal-numeric x for line/area is **not** relaxed (a date column is
  required) — see Known Limitations.
- **`ChartSection`** toolbar: one pill per native type (the user's override)
  + 显示数值 (toggles `showLabels`) + 仅数据 (hides the chart; the data table
  above is always visible). It runs the validator on the selected type and
  renders a `chartWarn` banner with the degrade reason when it falls back to
  bar. `colKinds` is threaded from `TableCardInner` (already sniffed for the
  table) so the validator reuses the same kinds.
- **Locales** (`locales.ts`): added 7 type keys + `chartLabels`/`chartData` +
  5 degrade-reason keys; `chartOff` (隐藏图表) → `chartData` (仅数据), matching
  R4's "仅数据" toggle naming.
- **CSS** (`TableCard.module.css`): added `.chartWarn` (alias tokens only —
  `--dsw-alias-state-warning-primary` + surface/border aliases, no literal
  color) + `flex-wrap: wrap` on `.chartToolbar` (11 pills wrap).

## Verification

- **141 owning tests** (was 93): chart-view covers all 9 types, the
  valueLabelsPlugin's draw branches (display=false, scatter/bubble skip, >8
  skip, hidden/null meta, null element, null/empty/NaN raw, object-point `.y`,
  vbar/hbar/line/radial positions) + the `??` defensive fallbacks; table-card
  covers the validator's 5 degrade rules + ok cases + the toolbar toggles +
  the degrade banner. **19 server tests** (was 15): the 7 new types accepted,
  `r_column` passthrough, the heuristic-in-description assertion.
- **Per-file 100% coverage** (statements/branches/functions/lines):
  `ChartView.tsx`, `TableCard.tsx`, `locales.ts` all 100/100/100/100. The
  global `test:coverage` threshold still fails on other packages' files
  (0% — only my tests ran) and on pre-existing gaps in goal/eval/query —
  not T7's.
- **tsc**: package (`tsc -b packages/client/ui-present-table`), aggregate
  client (`tsconfig.client.json`), and aggregate host (`tsconfig.host.json`)
  all exit 0 — the server `ChartConfig` widening breaks no consumer (the
  client mirrors the type locally, per T10's no-cross-package-import stance).
- **`test:gui`**: 4291 passed / 0 failed, 1 transient worker-timeout *error*
  (not a test failure) on `ui-directory-picker-browse/client-flow` — not my
  package; pre-existing/flaky.
- **doc-sync** (`verify-export-jsdoc`, `verify-package-readme-model-experience`,
  `verify-package-readme-limitations`): ui-present-table passes (no mentions
  in the error logs). The scripts' failures are all in other packages
  (goal-eval-context, goal-eval-policy, query-postgres, eval-runner,
  retrieval-experiment — concurrent WIP). README updated: the Chart bullet
  (9 types + validator + toggles), test count 91→141, + a Known Limitations
  entry for the degrade behavior + the line/area ordinal-x gap.
- **bundle**: `lib/client.js` 22.16 kB gzip (main entry; the T7 increment to
  `TableCard`/`locales` is small). The lazy chart chunk is ~70.8 kB
  **minified** gzip (the package build is unminified at ~102 kB gzip; the Vite
  host minifies). Per [R4 research](../../../../wayfinder/interpretation-client-rendering/research/R4-chart-type-expansion.md),
  v1 was ~40 kB + the 7 types add ~22-31 kB → ~62-71 kB total, so the
  **increment ~31 kB is within the ~55 kB budget**.

## Known Limitations

- **Line/area require a date x-column.** The validator degrades line/area to
  bar when x is not a date; ordinal-numeric x (e.g., day numbers 1..7) is not
  auto-recognized. Relaxing this is a
  [T6](../../../../wayfinder/interpretation-client-rendering/tickets/T6-chart-integration-testing.md)
  HITL refinement candidate (the heuristic guides a date column, so this is
  conservative, not broken).
- **Chart bundle ~70.8 kB minified gzip.** Matches R4's full-set estimate
  (v1 ~40 kB + 7 types ~22-31 kB); the lazy split keeps it off the initial
  load (chart intent only).
- **`onlyData` is the chart toolbar's hide-chart affordance.** R4's "仅数据"
  maps to the existing "hide chart" behavior (the data table is always
  rendered above the chart); the prototype's standalone "复制 TSV" is covered
  by the header's existing copy-MD / download-CSV actions, so no separate
  copy-TSV was added.

## Resolves

[T7](../../../../wayfinder/interpretation-client-rendering/tickets/T7-chart-type-implementation.md)
→ unblocks
[T6](../../../../wayfinder/interpretation-client-rendering/tickets/T6-chart-integration-testing.md)
(the HITL real-rendering gate). A post-ship subagent code-review (like T10's)
is the recommended next step before T6.
