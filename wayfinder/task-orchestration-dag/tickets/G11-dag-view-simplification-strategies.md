# G11 — DAG view simplification strategies

**Type**: grilling
**Status**: claimed
**Claimed by**: QoderWork session `mucgklyvt1ol4u5j`
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md)
**Blocks**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

Which renderer-neutral view transformations belong in the first release, and in what order are they composed?

Consider structural aggregation, active/focus filtering, terminal-subgraph summaries, domain filtering, and visible-node fallback. Define `TaskGraphView → TaskGraphDisplayView`, stable identities, explainable omitted counts, and selection survival independently of G6.

## Inputs from the G14 resolution

Simplification begins from the ready variant of the journal-backed `TaskGraphView` and produces a separate display-only view. It preserves Task, relation, Attempt, Hold, assurance, and omitted-count identities, never mutates the Task DAG projection, and treats unavailable views as non-transformable.

## Inputs from the R5 resolution

[R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md) gives the renderer a complete immutable `TaskGraphScene` and keeps G6-specific diffing private. This ticket therefore decides pure `TaskGraphView → TaskGraphDisplayView` transformations before scene mapping, not renderer deltas. The first-release target is legibility through 30 Tasks; a 100-Task browser case records evidence for simplification or the later renderer-scaling ticket rather than silently changing domain semantics.

## Comments

### Grilling checkpoint: first-release simplification slice

The user selected manual Task focus as the first-release simplification interaction, retaining the complete Task graph as the default. Existing-group collapse is not the first-release priority. Hidden-attention visibility, selection continuity, omitted counts, large-view handling, named follow-ups, and acceptance criteria remain unresolved; this checkpoint does not close the ticket.

### Grilling checkpoint: focus membership

The user selected the focused Task plus all its transitive dependency ancestors and descendants. Traversal follows dependency relations, not containment, execution Bindings, or tool calls. A separate branch that shares a descendant is not recursively included merely because it also feeds that descendant. This scope explains prerequisites and impact without promising that every focus produces a smaller graph; boundary dependencies still require explicit disclosure.

### Grilling checkpoint: out-of-focus attention

The user selected a persistent out-of-focus attention summary outside the graph rather than injecting unrelated attention Tasks into the focused topology. The summary deduplicates by Task identity and opens current Task details; changing the focus requires an explicit user action. Whole-plan progress remains whole-plan progress. Cross-boundary dependencies are disclosed separately, and displayed edges never recompute readiness or assurance.
