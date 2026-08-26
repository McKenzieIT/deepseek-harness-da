# T1: Implement ui-present-decomposition package

**Type**: task (AFK)
**Blocked by**: [G1-design-decisions](G1-design-decisions.md)
**Blocks**: none

## Question

Implement `packages/client/ui-present-decomposition/` as a Mode 3 Repository Package — a client-side Cordis plugin that registers a `tool.call.toolview` entry with key `'present_decomposition'`, rendering a structured card showing the query decomposition (summary, metrics, dimensions, time range, confidence).

### Deliverable

A complete plugin package following the `packages/client/AGENTS.md` new-plugin-package checklist:
- `package.json` (`@deepseek-ai/dsh-client-ui-present-decomposition`)
- `src/index.ts` (empty host apply)
- `src/client/index.ts` (Cordis apply: inject slots, register toolview)
- `src/client/DecompositionCard.tsx` (the React component)
- `src/client/DecompositionCard.module.css`
- `tests/` (component spec)
- Wire into `tsconfig.client.json` + `packages/bundle/web-app/cordis.patch.yml`

### Component design

Parse `block.call.argsRaw` to extract: `summary`, `metrics[]`, `dimensions[]`, `time_range`, `source`, `filters[]`, `confidence`.

Render a card with:
- Header: summary text + confidence badge (if present)
- Body: metric pills, dimension tags, time range, source, filters
- Collapsed by default in non-latest turns (per G1 decision)
