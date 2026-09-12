# G15 — Current client placement for task orchestration

**Type**: prototype
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md)
**Blocks**: [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md), [G4 Animation and edge design](G4-animation-and-edge-design.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

Which public DSH client slots should host the compact summary, normal graph, and larger inspection view?

Prototype `conversation.input.dock` with a session-owned right-sidebar tab/fullscreen view, a global sidebar/main panel, and a deliberate hybrid. Retain G2 interaction goals without patching upstream layout or using a root overlay as a window system. Verify session ownership, focus, keyboard behavior, narrow layouts, remount recovery, and explanation of ready, blocked, attempts, verification, and replan states.
