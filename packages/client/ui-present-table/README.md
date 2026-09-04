# @deepseek-ai/dsh-client-ui-present-table

Toolview card for the `present_table` INTERPRETATION tool. Renders query
results as a rich data table with KPI summary cards, sorting, virtual
scrolling, SQL transparency, and optional Chart.js visualizations.

## Rendering

When the model calls `present_table`, this plugin replaces the generic tool
row with a rich card showing:

- **Header bar** — collapse toggle + title + row count (`shown / total` when
  the bound result is truncated) + row actions (copy Markdown, download CSV)
- **SQL disclosure** — a collapsed "View SQL" box sourced from the bound
  `query_data` call's arguments
- **KPI cards** — aggregated values from `kpi_columns` (sum, avg, max, min,
  count), with an explicit "computed on a truncated sample" note when the
  bound text was display-capped
- **Data table** — native `<table>` (≤100 rows) or an ARIA grid-based
  virtual table (>100 rows); click-to-sort per column with type-aware
  compare (`column_types` wins, values are sniffed otherwise), numeric
  columns right-aligned
- **Chart** (optional) — Chart.js 4, code-split via `React.lazy` so chart.js
  never loads without chart intent. The R4 native type set (line, bar, area,
  horizontal-bar, scatter, doughnut, bubble, radar, polarArea) renders the
  model's `chart.type`; a client column-kind/cardinality validator degrades an
  infeasible choice to bar with an honest banner (e.g. scatter with <2 numeric
  columns, doughnut with >8 classes, line/area whose x is not a date). A
  toolbar offers per-type override plus 显示数值 (value-pills via a self-written
  `valueLabelsPlugin`, >8 non-radial points skipped) and 仅数据 (hide the chart;
  the data table above is always visible)
- **Collapse/expand** — collapsed state shows title + KPI cards; expanded
  shows SQL + full table + chart

Data binding: the primary row source is the result-store hot cache
(`ctx.results`, a session-scoped LRU over the `result.get` RPC), reached
through the slot's inject face (`fetchResult`). `args.result_id` resolves the
full entry; a fresh same-turn `query_data` (a higher `seq` for the same id)
invalidates the stale entry and re-fetches (R5 fresh-vs-folded), so the card
shows the latest snapshot while fold/expand reuses the cached entry without a
re-RPC. The same-turn `query_data` TSV scan is the cache-miss fallback: when
the result-cache plugin is absent (no `fetchResult` face) or the host answers
`result-not-found`, the card renders the TSV rows it can see, keeping the
existing `result_id` mismatch / `isError` honesty. The result-store RPC is
wired (R5/T8/T9); the TSV scan was the interim path (see wayfinder ticket
`R6-result-store-server-side`).

Fallbacks: while the tool runs (or a fetch is in flight), a skeleton; when
`block.call === null` (window truncation), `block.content` renders as plain
text; a failed tool call (`isError`) renders an error banner; when no query
result binds (the result store is unavailable / `result-not-found` with no
same-turn TSV), an "expired" banner plus text fallback and a retry button
that re-fetches from the result store (G1 D2/D6: retry = refetch; re-running
the query is the user's job, not the card's).

Row limit: 10,000 rows maximum; CSV export is available at any row count
and exports the currently parsed rows (with truncation reported in the
header count).

Localization: the card registers the `present.table` locale namespace
(zh/en) with the slot; all copy goes through `t`.

## Tests

141 tests across 4 spec files; fixtures use the real `renderCompleted`
output format (result_id line, elision markers, row-count trailer) so the
parser contract cannot drift from `dsh-query-tool` silently, and the
fetchResult wiring specs cover the result-store primary path, the TSV
cache-miss fallback, fresh-vs-folded invalidation, and retry = refetch.
The R4 chart specs cover all 9 native types, the `valueLabelsPlugin` draw
branches, the validator's degrade-to-bar rules, and the toolbar toggles.

## Model Experience

None, as this browser-side toolview renders the `present_table` tool result for the user; it registers no prompt, tool, schema, or session event, and rendered rows never enter model context.

#### KV Cache effect

No direct effect; the card renders query/compute result rows for the user, and the `fetchResult` `result.get` RPC fetches renderer data, not model context. The model already saw the `present_table`/`query_data` tool results in the conversation; the card's rendering and its hot cache change no token the provider KV-caches.

## Known Limitations and Deferred Work

- **The TSV cache-miss fallback is partial.** When the result-cache plugin
  is absent (no `fetchResult` face) or the host answers `result-not-found`,
  the card falls back to the same-turn `query_data` TSV scan, which renders
  only the rows the tool-result text carries — the `renderCompleted` format
  display-truncates (an elision marker) well below the 10,000-row full-result
  cap. Full data requires the result-cache ([R5](../../wayfinder/interpretation-client-rendering/tickets/R5-object-layer-result-cache.md)/[T9](../../wayfinder/interpretation-client-rendering/tickets/T9-result-cache-package-impl.md)).
- **Inherited fresh-vs-folded residual.** The card inherits the result-cache's
  missed-event residual: a `fetchResult` that starts after an
  `invalidateResult` but before the in-flight fetch resolves coalesces onto it
  and receives the old value once. The full generation-token hardening is
  deferred to the cache (R5 Known Limitation); the card's `freshSeq`-keyed
  invalidation is the v1 mitigation.
- **Retry re-fetches, not re-runs.** The retry button re-fetches from the
  result store; re-running the query is the user's job, not the card's
  ([G1](../../wayfinder/interpretation-client-rendering/tickets/G1-design-decisions.md) D6).
- **Chart-type validator degrades to bar.** A client column-kind/cardinality
  check degrades an infeasible `chart.type` to bar (scatter with <2 numeric
  columns, doughnut with >8 classes, line/area whose x is not a date, bubble
  with <3 numeric columns, radar/polarArea not in entity × N-metric shape).
  Line/area over an ordinal-numeric x is not yet recognized — a date x-column
  is required, else the validator falls back to bar; relaxing this is a T6
  ([T6](../../wayfinder/interpretation-client-rendering/tickets/T6-chart-integration-testing.md)) HITL refinement candidate. The model-side heuristic lives in the
  `present_table` tool description ([R4](../../wayfinder/interpretation-client-rendering/tickets/R4-chart-type-expansion.md)).
- **Radial value-labels stack at the donut center.** The `valueLabelsPlugin`
  draws doughnut/polarArea value-pills at each `ArcElement`'s `x`/`y`, which
  Chart.js sets to the shared donut center — so enabling 显示数值 on a
  multi-slice radial chart stacks the pills at one point (unreadable). Per-slice
  arc-centroid placement is a
  [T6](../../wayfinder/interpretation-client-rendering/tickets/T6-chart-integration-testing.md)
  HITL refinement candidate (the R4 prototype has the same behavior).
