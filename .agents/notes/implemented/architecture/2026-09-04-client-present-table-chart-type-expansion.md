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
(the HITL real-rendering gate).

## Final review pass (post-H1-fix, 2026-09-04)

A second independent subagent code-review + test verification on the final HEAD
(post-H1-fix, interleaved with concurrent-session commits that did not touch
the T7 pathspec). Verdict: **SHIP, no HIGH**.

- Tests: 160 pass (141 owning + 19 server); `tsc -b packages/client/ui-present-table`
  + `tsc -b tsconfig.client.json` both exit 0; coverage `ChartView.tsx` /
  `TableCard.tsx` / `locales.ts` = 100/100/100/100 (the `seriesColor` `/* v8
  ignore */` holds — `SERIES_COLORS` is a non-empty literal, `i % length`
  always in-bounds, the `??` right operand is genuinely unreachable).
- Bundle: `lib/client.js` 22.16 kB gzip; lazy chart chunk ~70.8 kB minified
  gzip (increment ~31 kB < R4's ~55 kB budget).
- Adversarial probes re-verified FINE at HEAD: the `as never` boundary casts
  (per-type union, 9 render tests + 100% cov), `effectiveType` narrowing, empty
  `y_columns` → `yKind@-1` degrade, bubble `r_column` undefined, `meta` null,
  element-geometry `?? 0`, area=Line / hbar=Bar via `chart.config.type` in the
  plugin, locale zh/en parity (compiler-enforced via `satisfies Record<TableKey>`),
  `chartWarn` locale key, `args.columns` override + `colKinds` threading
  (override renames headers only, no reordering), bundle tree-shaken (no
  `PieController`, no `MatrixController`).
- Standards (AGENTS.md): no cross-package import (`ChartConfig`/`ChartType`
  mirrored locally; no `result-cache`/`tool-present-table` value import — only
  comments reference them); no new `/client` entry exports
  (`valueLabelsPlugin`/`validateChartType` are internal module exports, tests
  import via relative `../src/client/…`); `.chartWarn` uses only
  `--dsw-alias-*` tokens (zero literal color); component props are the four
  shares; no Cordis `ctx` in components (the `ctx.` matches in ChartView are
  `CanvasRenderingContext2D`, false positives).

### M-1: pre-existing repo-wide theme-token gap (not T7, not blocking)

The final review surfaced that the `--dsw-alias-content-*` / `surface-*` /
`border-primary` / `state-warning-primary` aliases are **consumed but never
defined** in `packages/client/ui-theme/src/styles/` (only `state-error-primary`
/ `-success-primary` / `-business-primary` are in `design-platform.css`). This
is **not T7-introduced** — v1 `TableCard.module.css` (`.kpiNote`,
`.card`, `.th`, `.actionBtn`) and `ui-semantic-layer` (concurrent session)
already consume the same unset tokens. T7's `.chartWarn` only reuses existing
tokens; AGENTS.md's "no literal colors" rule is satisfied; at runtime unset
vars resolve to inherited/initial values (fallback styling, not a crash). The
fix is theme-infrastructure (add the missing aliases to `design-platform.css`)
— out of T7's pathspec, deferred to a repo-wide theme-token sweep.
