# @deepseek-ai/dsh-client-ui-present-table

Toolview card for the `present_table` INTERPRETATION tool. Renders query
results as a rich data table with KPI summary cards, sorting, virtual
scrolling, SQL transparency, and optional Chart.js visualizations.

## Model Experience

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
- **Chart** (optional) — Chart.js 4 line/bar, code-split via `React.lazy`
  so chart.js never loads without chart intent; a toolbar lets the user
  switch line/bar/hide (auto-generated chart types are a hint, not a lock)
- **Collapse/expand** — collapsed state shows title + KPI cards; expanded
  shows SQL + full table + chart

Data binding: scans the same turn's `query_data` ToolResultNodes (up to 6
most recent) and binds the one whose rendered `result_id:` line matches
`args.result_id`; nodes without any id (older render format) fall back to
most-recent; ids present but none matching renders an explicit "mismatch"
card instead of silently binding the wrong result. The parser understands
the real `renderCompleted` shape: `result_id:` first line, elision markers
(`... N more rows elided`), and the `(N rows)` trailer are metadata, never
headers or data rows. This scan is the interim path until the result-store
RPC lands (see wayfinder ticket `R6-result-store-server-side`).

Fallbacks: while the tool runs, a skeleton; when `block.call === null`
(window truncation), `block.content` renders as plain text; a failed tool
call (`isError`) renders an error banner; when no query result binds, an
"expired" banner plus text fallback.

Row limit: 10,000 rows maximum; CSV export is available at any row count
and exports the currently parsed rows (with truncation reported in the
header count).

Localization: the card registers the `present.table` locale namespace
(zh/en) with the slot; all copy goes through `t`.

## Tests

79 tests across 4 spec files; fixtures use the real `renderCompleted`
output format (result_id line, elision markers, row-count trailer) so the
parser contract cannot drift from `dsh-query-tool` silently.
