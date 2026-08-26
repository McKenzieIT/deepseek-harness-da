# T1: Implement ui-present-decomposition package

**Type**: task (AFK)
**Status**: ✅ resolved
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

## Resolution

Implemented as `packages/client/ui-present-decomposition/` — all deliverables complete:

**Package structure:**
- `package.json` — `@deepseek-ai/dsh-client-ui-present-decomposition`, peers on cordis + runtime + invariants, deps clsx
- `tsconfig.json` — extends `tsconfig.base.client.json`, references cordis/ui-slots/ui-primitives/runtime/invariants
- `tsdown.config.ts` — standard `clientBundle()` with invariant companion
- `src/index.ts` — empty host-half apply
- `src/invariant.ts` — empty invariant installer
- `src/client/index.ts` — `inject: ['slots']`, registers via `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ key: 'present_decomposition' }, DecompositionCard))`
- `src/client/DecompositionCard.tsx` — three states: skeleton (RunningToolCall), fallback (block.call===null or invalid JSON), rich card (valid argsRaw)
- `src/client/DecompositionCard.module.css` — semantic tokens, confidence warning (yellow border), skeleton pulse animation

**Design decisions applied:**
- Default expanded (per G1 §5)
- confidence < 0.7 → yellow/orange border + 「理解可能不准确，请确认」warning
- block.call===null → generic text fallback from block.content
- RunningToolCall → skeleton loading
- Chinese product copy, English code

**Registration surfaces:**
- `tsconfig.client.json` references entry
- `cordis.patch.yml` row `ui-present-decomposition`
- `web-app/package.json` dependency

**Tests:** 3 files, 15 tests, all branches covered. `pnpm run test:gui` green (292 files, 4034 tests). `verify-client-packages` clean (0 violations for this package).
