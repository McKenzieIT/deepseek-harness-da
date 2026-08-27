# `@deepseek-ai/dsh-tool-present-table`

Model-facing `present_table`: **present a query result table with display metadata** (title, columns, sort, KPI aggregations, chart config) for the data agent's `INTERPRETATION` phase. The agent calls it to instruct the UI how to render the executed query result — which columns to show, how to sort, what summary KPI cards to display above the table, and whether to include a chart visualization.

This is a **pure presentation tool** (`inject=['tools']` only): it records the table presentation intent and returns it for the UI to render. It has NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`. The phase-gate's `captureToolData` detects the call via `tools/post-execute`.

## Model Experience

The model calls `present_table` with:
- `result_id` (required): the query result ID from `query_data` execution
- `title` (required): human-readable title for the table
- `columns` (optional): display column names
- `column_types` (optional): semantic type per column ("number", "date", "string")
- `sort_column` (optional): column index to sort by (-1 = no sort)
- `kpi_columns` (optional): array of `{column, aggregation, label, format?}` for KPI summary cards
- `chart` (optional): `{type: "line"|"bar", x_column, y_columns}` for chart visualization

The tool returns `{ presented: true, result_id, title, ... }` and renders a compact summary for the model's tool-result context.

## Known Limitations

- Pure intent recording only — the UI layer owns actual rendering; this tool only declares the intent.
- `result_id` is not validated against any result store (the UI resolves it at display time).
- Chart config is advisory — the UI may fall back to table-only display for unsupported chart types.

## Config

No knobs. Pure presentation.

## Verification

```sh
tsc -b packages/data/tool-present-table/tsconfig.json
pnpm vitest run packages/data/tool-present-table
pnpm verify-cordis-config
```
