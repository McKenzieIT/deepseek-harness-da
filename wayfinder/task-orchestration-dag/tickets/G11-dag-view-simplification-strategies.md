# G11 — DAG view simplification strategies

**Type**: grilling
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md)
**Blocks**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

Which renderer-neutral view transformations belong in the first release, and in what order are they composed?

Consider structural aggregation, active/focus filtering, terminal-subgraph summaries, domain filtering, and visible-node fallback. Define `TaskGraphView → TaskGraphDisplayView`, stable identities, explainable omitted counts, and selection survival independently of G6.

## Inputs from the G14 resolution

Simplification begins from the ready variant of the journal-backed `TaskGraphView` and produces a separate display-only view. It preserves Task, relation, Attempt, Hold, assurance, and omitted-count identities, never mutates the Task DAG projection, and treats unavailable views as non-transformable.

## Inputs from the R5 resolution

[R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md) gives the renderer a complete immutable `TaskGraphScene` and keeps G6-specific diffing private. This ticket therefore decides pure `TaskGraphView → TaskGraphDisplayView` transformations before scene mapping, not renderer deltas. The first-release target is legibility through 30 Tasks; a 100-Task browser case records evidence for simplification or the later renderer-scaling ticket rather than silently changing domain semantics.
