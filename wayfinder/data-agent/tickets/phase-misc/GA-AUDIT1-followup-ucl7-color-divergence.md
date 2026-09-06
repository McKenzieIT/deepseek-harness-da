# GA-AUDIT1-followup ucl-7 residual: chip↔combo color divergence under multi-domain filter

**Type**: task (ui-context-layer, low-risk residual)
**Status**: open (DEFERRED from the 2026-09-04 ucl-7 fix `c26eada21b` → PR #9 merged; documented in [GA-AUDIT1-followup-residual.md](GA-AUDIT1-followup-residual.md) Notes)
**Source**: re-review on the committed ucl-7 fix (`c26eada21b`); the prior pass missed it.

## Question

Should the chip↔combo color divergence under multi-domain filter be fixed (thread the full sorted `allDomains` into `ContextLayerGraph` → `toG6Data` → `domainIndexMap`), and does the TDD RED/GREEN confirm it?

## Evidence

- ucl-7 fix (`c26eada21b`): `NodeDetailPanel` chips color by the GLOBAL sorted domain index (new optional `allDomains` prop, threaded from `ContextLayerView`'s sorted set). But `ContextLayerView` passes `filteredData` (a node subset) to `ContextLayerGraph` → `toG6Data` builds `domainIndexMap` from the subset, while the chip uses the full `allDomains` → combo uses the subset index. Divergence under multi-domain filter (chip↔combo mismatch).
- Before the ucl-7 fix: chip used the local (subset) index (worse — chip↔combo diverged the other way). So the fix is a strict improvement, not a regression; the no-filter common case is fully consistent (chip + combo both use the full set).
- Fix sketch: thread the full sorted `allDomains` into `ContextLayerGraph` (new optional prop) → `toG6Data`, use `allDomains ?? [...domainSet].sort()` for `domainIndexMap` so `comboStyle` uses the global index (matches the chip).
- TDD: RED — render `ContextLayerGraph` (mocked `Graph`) with `data` domains `['beta','gamma']` + `allDomains=['alpha','beta','gamma']`; assert `mockGraph.setData`'s combos contain `style: comboStyle(1)` for `'beta'` (global 1 vs subset 0 → RED). GREEN — thread `allDomains`. ~4 src + ~15 test lines.
