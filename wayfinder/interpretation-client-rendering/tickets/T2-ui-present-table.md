# T2: Implement ui-present-table package

**Type**: task (AFK)
**Blocked by**: [G1-design-decisions](G1-design-decisions.md)
**Blocks**: none

## Question

Implement `packages/client/ui-present-table/` as a Mode 3 Repository Package — a client-side Cordis plugin that registers a `tool.call.toolview` entry with key `'present_table'`, rendering a table with KPI cards and optional chart visualization.

### Deliverable

A complete plugin package:
- `package.json` (`@deepseek-ai/dsh-client-ui-present-table`)
- `src/index.ts` (empty host apply)
- `src/client/index.ts` (Cordis apply)
- `src/client/TableCard.tsx` (main table renderer)
- `src/client/KpiCards.tsx` (KPI summary row above table)
- `src/client/ChartView.tsx` (line/bar chart)
- `src/client/TableCard.module.css`
- `tests/`
- Wire into tsconfig.client.json + bundle patch

### Component design

Parse `block.call.argsRaw` for: `result_id`, `title`, `columns`, `column_types`, `sort_column`, `kpi_columns`, `chart`.

Render:
1. **Header**: title + table metadata
2. **KPI cards row** (if `kpi_columns` present): aggregation summary cards
3. **Table**: column headers + rows (data source = per G1/R3 decisions on result_id resolution)
4. **Chart** (if `chart` present): line or bar chart below/beside table

Performance: virtual scrolling for >100 rows, chart downsampling for >1000 points (per G1 §7).
