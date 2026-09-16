# R5 — G6 renderer adapter stability

**Type**: research
**Status**: resolved 2026-09-16
**Assignee**: Codex · 2026-09-16
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G15 Current client placement](G15-current-client-placement.md)
**Blocks**: [G4 Animation and edge design](G4-animation-and-edge-design.md), [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md)

## Question

What smallest renderer adapter isolates `@antv/g6` and `@antv/g` while supporting layout, updates, animation, cancellation, destruction, reduced motion, and upgrades?

Verify public typed APIs for display lookup, animation, draw/render, layout ordering, events, and cleanup. Define renderer-neutral node, edge, Task, Attempt, assurance, hold, and replan inputs plus remount, resize, hidden-tab, scale, and reduced-motion tests.

## Inputs from the G14 resolution

The renderer consumes safe `TaskGraphView` values from the independent Task DAG Remote. Host and executor bindings arrive as renderer-neutral summaries; adapter-private native references, outbox payloads, credentials, transport cursors, and DSH Session events never enter the G6 adapter.

## Resolution

See [R5 G6 renderer adapter stability](../research/R5-g6-renderer-adapter-stability.md).

Use one renderer-neutral full-scene value and one private G6 adapter. The adapter distinguishes topology changes (`setData` then `render`) from style-only changes (`updateData` then `draw`), serializes asynchronous work with generation-based logical cancellation, and owns direct `@antv/g` animation handles. The first release disables G6-managed animation, defers zero-sized or hidden rendering, preserves static meaning under reduced motion, and treats `@antv/g6@5.1.1` plus `@antv/g@6.3.1` as a tested dependency pair behind root-import type and real-browser lifecycle checks.
