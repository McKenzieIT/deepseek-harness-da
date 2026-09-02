# G4 — animation and edge design for flowing DAG

**Type**: grilling (+ prototype candidate)
**Status**: open
**Blocked by**: [R2 G6 dagre layout feasibility](R2-g6-dagre-layout-feasibility.md) ✅, [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md) ✅
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

## Context from G2(2026-09-02,修正与起点)

- ⚠️ **修正上文两处**:(1) `updateNodeData`/`updateEdgeData` 在 G6 5.1.1 **不触发重绘**
  (像素哈希实测;上游 `graph-animations.ts` 的 rAF 动画因此视觉全死,见 data-agent
  [W13](../../data-agent/tickets/phase-misc/W13-contextlayer-animations-no-repaint.md))——状态
  变更后必须补 `graph.draw()`,连续样式动画必须走 **@antv/g WAAPI**
  (`element.animate()`,场景树按 item id 取显示对象);(2) "复用 graph-animations.ts
  模式"作废——它是反面教材,修复参考 `prototype/dag-graph.js` 的
  `findEl/installAnimations`。
- **起点不是从零**:G2 原型(`prototype/`,用户已验收)已实现并像素级验证:节奏恒定
  流动(派生 2 cyc/s、包含 1 cyc/s,与 zoom 无关)、活跃节点呼吸(0.67 cyc/s)、
  状态变迁脉冲(750ms)、完成路径转绿、hover 上下游链路高亮、图例行、字号基线
  (任务节点 134×38/13px)。G4 的主要剩余问题:failed/cancelled 状态族、
  `classifyEdge` 两态抽象(Z 扩展点)、`prefers-reduced-motion` 降级、
  containment 的"分组框 vs 显式边"取舍(G1 倾向分组框,原型用的显式边)。

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
