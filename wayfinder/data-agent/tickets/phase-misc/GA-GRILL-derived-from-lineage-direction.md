# GA-GRILL — derived_from lineage direction (RelationGraph.getDerived)

**Type**: grilling (HITL — needs a product/design call)
**Status**: open
**Source**: [GA-AUDIT1-followup](./GA-AUDIT1-followup-findings.md) deferred item sl-3
**Scope**: `packages/data/semantic-layer/src/relation-graph.ts` + 2 cross-package callers
**Related**: [GA-AUDIT1-followup](./GA-AUDIT1-followup-findings.md)

## Question

`RelationGraph.build` stores every relation bidirectionally — both the forward
(`source→target`) and reverse (`target→source`) edges carry the SAME `type`. For
symmetric types (`joins`, `related_to`) this is correct. For the ASYMMETRIC
`derived_from` relation (metric M `derived_from` host table T), the reverse edge
`T→M` is also typed `derived_from`, so `getDerived(T)` returns an edge claiming
"T derived_from M" — the lineage direction is inverted.

Should `getDerived` / the `derived_from` storage be:

- **A — Directional lineage (forward-only).** `getDerived(M) → host T` (M is
  derived from T); `getDerived(T) → []` (T isn't derived from anything). Fix:
  store `derived_from` unidirectionally (skip the reverse edge for asymmetric
  types) OR emit the reverse edge with a distinct type (`derives_into`).
  **Cost:** breaks the 2 recall-expansion callers that rely on the reverse
  edge (table → derived metrics) — they'd lose table→metric recall expansion.

- **B — Bidirectional expansion, re-documented (current behavior, kept).**
  `getDerived` returns all `derived_from` neighbors regardless of direction
  (graph-expanded recall). Fix: docstring only (drop the "G2 lineage
  traversal" claim; document it as "bidirectional derived_from neighbors").
  No code change. The "inversion" is accepted as neighbor expansion, not
  lineage. Cheapest; closes the finding's "misleading" complaint.

- **C — Directional lineage + new bidirectional method.** Make `getDerived`
  directional (A), add `getDerivedNeighbors(id)` (bidirectional) for recall,
  and rewire the 2 cross-package callers to the new method. Cleanest
  semantics (lineage is directional; recall has an explicit bidirectional
  API) but a cross-package refactor + retrieval eval to verify no recall
  regression.

## Context (verified during the GA-AUDIT1-followup ④ reconciliation)

- **Finding**: `.tmp/adversarial-review/d-semantic-layer-findings.json` sl-3;
  `relation-graph.ts:46-57` `build()` + `:144` `getDerived()`.
- **Callers** (grep-verified, non-test, non-`.d.ts`):
  - `packages/data/nl2sql-engine/src/ontology.ts:114` `expandCandidates` —
    `for (const e of graph.getDerived(h.id))`. Docstring (`:89`): "1-hop
    `joins` neighbors (DIM tables) and `derived_from` targets (a metric's
    source table, **or vice versa**)" → explicitly bidirectional intent.
  - `packages/data/tool-search-data-sources/src/index.ts:558`
    `applyGraphExpansionAndJoins` — `for (const edge of graph.getDerived(hit.id))`,
    "same logic as `expandCandidates`" → bidirectional intent.
  - Both use `getDerived` for 1-hop recall expansion (metric↔host, both
    directions). NO caller uses `getDerived` for strict directional lineage.
- **Tests**: `relation-graph.spec.ts` only tests forward traversal
  (`getDerived('metric_dau') → host`); no test encodes the inversion. So a
  directional fix (A/C) wouldn't break existing semantic-layer specs, but
  WOULD change recall behavior in the 2 cross-package consumers.
- **Why ④→②**: the original "local to build()" smell framing missed the 2
  cross-package recall callers. A correct directional fix ripples
  cross-package + needs eval to confirm no recall regression. Reclassified
  during the sl-3 caller check (commit `82c59266ae`).

## Notes

- Resolve via `/grilling` + `/domain-modeling` (one question at a time). This
  is a product/design call: is `derived_from` lineage a directional concept
  future consumers might query (→ A/C), or is it purely graph-expansion (→ B)?
- After a direction is chosen, open an impl ticket (e.g.
  `GA-DERIVED-FROM-impl-direction`) if A or C; for B, the fix is a docstring
  change and can close inline.
- If A/C: the retrieval eval (`GA-EVAL-CLEAN-RERUN` or a focused retrieval
  regression) must confirm table→metric recall isn't lost.
