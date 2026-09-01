# R2 — G6 v5 dagre layout feasibility for task DAG

**Type**: research
**Status**: closed
**Blocked by**: —
**Blocks**: [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md), [G4 animation and edge design](G4-animation-and-edge-design.md)

## Question

Can G6 v5 render a task DAG with hierarchical dagre layout and animated flowing dashed edges?

## Resolution

See [research/R2-g6-dagre-layout-feasibility.md](../research/R2-g6-dagre-layout-feasibility.md).

**Summary**: Yes — G6 v5.1.1 natively supports `type: 'antv-dagre'` layout, `lineDashOffset` animation (via Web Animations API or rAF), and incremental layout via automatic preset mechanism. At 3-30 nodes, full re-layout is sub-millisecond. No reason to build a separate SVG+dagre stack — G6 v5 is already a dependency with established patterns in `ContextLayerGraph`.
