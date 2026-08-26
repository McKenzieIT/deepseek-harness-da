# T2: Implement ui-present-table package

**Type**: task (AFK)
**Status**: ✅ shipped
**Blocked by**: [G1-design-decisions](G1-design-decisions.md)
**Blocks**: none

## Resolution

`packages/client/ui-present-table/` shipped as `@deepseek-ai/dsh-client-ui-present-table` (Mode 3 Repository Package).

### What shipped

- **Toolview registration**: `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'present_table' }, TableCard))`
- **Data source**: scans same-turn most recent completed `query_data` ToolResultNode content (TSV format) via `useSession` hook, backward from `block.seq`
- **Header**: title + row count metadata
- **KPI cards**: client-side aggregation (sum/avg/max/min/count) with format support (%, comma-decimal)
- **Table**: native `<table>` with `overflow-x: auto`; `@tanstack/react-virtual` for >100 rows
- **Chart**: Chart.js 4 (line/bar) lazy-loaded via `React.lazy` only when `chart` intent present
- **Collapse/expand**: collapsed shows title + KPI cards; expanded shows full table + chart
- **Fallbacks**: skeleton for RunningToolCall; "数据已过期" + text for unavailable data; generic text card for `block.call === null`
- **CSV export**: download button when rows >= 10,000 (MAX_DISPLAY_ROWS cap)
- **Dependencies**: `@tanstack/react-virtual`, `chart.js`, `react-chartjs-2`
- **Registration**: `cordis.patch.yml`, `web-app/package.json`, `tsconfig.client.json`
- **Tests**: 52 tests across 4 spec files, 100% per-file coverage gate passing
- **`pnpm run test:gui`**: 299 files, 4108 tests, all green
