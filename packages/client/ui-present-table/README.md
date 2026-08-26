# @deepseek-ai/dsh-client-ui-present-table

Toolview card for the `present_table` INTERPRETATION tool. Renders query
results as a rich data table with KPI summary cards, virtual scrolling,
and optional Chart.js visualizations.

## Model Experience

When the model calls `present_table`, this plugin replaces the generic tool
row with a rich card showing:

- **Header** — title + row count metadata
- **KPI cards** — aggregated values from `kpi_columns` (sum, avg, max, min, count)
- **Data table** — native `<table>` with `overflow-x: auto` for wide tables,
  virtual scrolling via `@tanstack/react-virtual` for >100 rows
- **Chart** (optional) — Chart.js 4 line/bar chart, lazy-loaded only when
  `chart` intent is present
- **Collapse/expand** — collapsed state shows title + KPI cards; expanded
  shows full table + chart

Data source: scans the same turn's most recent completed `query_data`
ToolResultNode content (TSV format) via `useSession`.

Fallback: when `block.call === null` (window truncation), renders
`block.content` as plain text. While the tool is running, displays a
skeleton loading state. When query data is unavailable, shows "数据已过期"
with text fallback.

Row limit: 10,000 rows maximum; beyond that, a CSV download link is offered.
