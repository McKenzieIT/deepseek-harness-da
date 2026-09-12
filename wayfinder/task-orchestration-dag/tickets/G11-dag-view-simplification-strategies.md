# G11 — DAG view simplification strategies

**Type**: grilling
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md)
**Blocks**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

Which renderer-neutral view transformations belong in the first release, and in what order are they composed?

Consider structural aggregation, active/focus filtering, terminal-subgraph summaries, domain filtering, and visible-node fallback. Define `TaskGraphSnapshot → TaskGraphViewSnapshot`, stable identities, explainable omitted counts, and selection survival independently of G6.
