# G4 — animation and edge design for flowing DAG

**Type**: grilling (+ prototype candidate)
**Status**: open
**Blocked by**: [R2 G6 dagre layout feasibility](R2-g6-dagre-layout-feasibility.md), [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md)
**Blocks**: —

## Question

The user specifically requested **"节点间伴随的动效流动的虚线"** — animated flowing dashed lines between nodes to communicate task flow direction. How should this be designed?

**Sub-questions:**

1. **Edge animation technique**: The most natural approach is CSS/Canvas `lineDash` + animated `lineDashOffset` (marching ants effect). Does G6 v5 support animating edge stroke properties per-frame? The existing `graph-animations.ts` uses `dashedHighlight` (static dashed stroke) — can this be extended to animate the dash offset?

2. **Flow direction**: Dashes should flow from blocker → dependent (upstream → downstream). For edges where the blocker is completed, should the animation stop (solid line) or change (e.g., green flowing line → static green line)?

3. **Node status visualization**: Nodes need to show status at a glance:
   - `pending` (blocked): gray, dashed border
   - `pending` (ready): outlined, waiting
   - `in_progress`: pulsing/glowing border (reuse `pulseNode` pattern?)
   - `completed`: solid fill, checkmark icon
   - Subagent node: distinct shape (hexagon?) with running/idle/failed indicator
   - Workflow node: compound node containing phase sub-nodes?

4. **Transition animations**: When a task transitions status (e.g., pending → in_progress), what animation plays? When a new node appears, how does it enter (fade in + layout shift, like the existing `fadeIn` in `graph-animations.ts`)?

5. **`prefers-reduced-motion`**: The existing codebase respects `prefers-reduced-motion: reduce`. The flowing dashed animation must too — in reduced-motion mode, show static dashed lines instead.

## Prototype suggestion

This ticket deserves a `/prototype` session to build a small G6 v5 proof-of-concept with dagre layout + animated dashed edges + node status transitions, independent of the full DSH stack.
