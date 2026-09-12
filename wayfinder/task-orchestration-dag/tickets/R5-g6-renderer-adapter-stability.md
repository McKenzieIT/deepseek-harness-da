# R5 — G6 renderer adapter stability

**Type**: research
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G15 Current client placement](G15-current-client-placement.md)
**Blocks**: [G4 Animation and edge design](G4-animation-and-edge-design.md), [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md)

## Question

What smallest renderer adapter isolates `@antv/g6` and `@antv/g` while supporting layout, updates, animation, cancellation, destruction, reduced motion, and upgrades?

Verify public typed APIs for display lookup, animation, draw/render, layout ordering, events, and cleanup. Define renderer-neutral node, edge, Task, Attempt, assurance, hold, and replan inputs plus remount, resize, hidden-tab, scale, and reduced-motion tests.
