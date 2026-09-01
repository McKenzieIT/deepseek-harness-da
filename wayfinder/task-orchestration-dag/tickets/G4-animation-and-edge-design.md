# G4 — animation and edge design for flowing DAG

**Type**: grilling (+ prototype candidate)
**Status**: open
**Blocked by**: [R2 G6 dagre layout feasibility](R2-g6-dagre-layout-feasibility.md) ✅, [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md)
**Blocks**: [G8 Z enhancement — global progress wavefront](G8-z-enhancement-global-progress-wavefront.md)

## Context from G1 + G5

G1 decided:
- **4 edge types**: dependency (solid arrow), sequence (light thin line), containment (dashed grouping box), spawning (animated flowing dashed line)
- **State display option Y**: Node state changes trigger color transitions + related edges animate. Completed path turns green.
- **Option Z** (global progress wavefront with `classifyEdge`) is a separate enhancement ticket (G8), unlocked after G4/Y implementation.
- **5 node types**: task, team-task, workflow-run, workflow-agent, subagent — each with distinct lifecycle states.

G5 D6 decided: **结构/状态变更分离**——
- **结构变更**（增删节点/边）→ `setData()` + `render()` → 全量 dagre 重算 + `prevGraph` 排序稳定 + 动画过渡
- **状态变更**（颜色/样式）→ `updateNodeData()` / `updateEdgeData()` → **零布局开销**

这意味着 G4 的所有状态过渡动画（pending→completed 颜色变化、边变绿等）都通过 `updateNodeData`/`updateEdgeData` 实现，不触发布局重算。只有新节点/边出现时才走 `render()` 路径。可复用现有 `graph-animations.ts` 中的 `fadeIn`、`pulseNode`、`blinkNodes` 模式。

## Question

How should the 4 edge types and 5 node types be visually rendered, and what animations accompany state transitions?

**Sub-questions (refined by G1):**

1. **Edge rendering per type**:
   - **dependency** (DagTask.blockedBy): Solid arrow, source→target. When source completes → edge turns green.
   - **sequence** (task list order): Light/thin line. When source completes → same green treatment as dependency.
   - **containment** (workflow-run → workflow-agent): Dashed grouping box around children? Or an explicit parent→child edge with a distinct style?
   - **spawning** (task → subagent/workflow): Animated flowing dashed line (marching ants via `lineDashOffset`).

2. **Node status visualization per type**:
   - task: pending(gray) → in_progress(blue+pulse) → completed(green+check)
   - workflow-run: running(blue+breathe) → completed(green) / failed(red) / cancelled(gray+strikethrough)
   - workflow-agent: same as workflow-run, but smaller/nested
   - subagent: distinct shape (hexagon?) with running/idle/failed indicator

3. **Transition animations**: When a task transitions status, what plays? Leverage existing `pulseNode`/`blinkNodes`/`fadeIn` patterns from `graph-animations.ts`.

4. **`prefers-reduced-motion`**: Existing codebase respects this. Flowing dashed animations → static dashed lines in reduced-motion mode.

5. **Y implementation detail**: The `classifyEdge` abstraction — should it be designed now as a two-state function (`completed | default`) with explicit extension point for Z's three-state upgrade?

## Prototype suggestion

Build a small G6 v5 proof-of-concept with dagre layout + 4 edge types + node status transitions, independent of the full DSH stack.
