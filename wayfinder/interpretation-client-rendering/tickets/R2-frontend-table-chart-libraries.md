# R2: Frontend table + chart libraries 2026 comparison

**Type**: research (AFK)
**Status**: ✅ resolved
**Blocked by**: none
**Blocks**: [G1-design-decisions](G1-design-decisions.md)
**Output**: [../research/R2-frontend-table-chart-libraries.md](../research/R2-frontend-table-chart-libraries.md)

## Question

Compare lightweight frontend table and chart libraries suitable for a Cordis/React client plugin (no SSR needed — pure browser). Criteria:

### Tables
- **Candidates**: TanStack Table v9, AG Grid Community, Glide Data Grid, react-data-grid
- **Criteria**: bundle size (gzipped), virtual scrolling (10K+ rows), column sorting/resizing, TypeScript-first, headless vs opinionated styling, React 19 compatibility, tree-shaking

### Charts
- **Candidates**: Observable Plot, Chart.js 4, ECharts 5, Recharts, visx, lightweight-charts
- **Criteria**: bundle size (gzipped), line + bar chart, responsive/container-query, animation, React wrapper quality, TypeScript types, accessibility (aria-labels on data points)

### KPI cards
- No library needed — pure CSS + React component. Document the pattern used by existing data dashboards (Metabase, Superset, Grafana) for KPI card layout.

Produce a comparison matrix with bundle sizes, trade-offs, and a recommendation for each slot.
