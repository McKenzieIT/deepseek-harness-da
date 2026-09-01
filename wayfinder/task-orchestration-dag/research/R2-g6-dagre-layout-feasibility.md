# R2 — G6 v5 dagre layout feasibility (resolved)

## Installed versions

- **@antv/g6**: `5.1.1` (from `^5.0.0`)
- **@antv/layout**: `2.0.0` (transitive)
- **@antv/g**: `6.3.1` (rendering engine)

## 1. G6 v5 dagre layout — natively supported

**Yes.** Two variants registered out of the box:

| Layout type | Class | Recommendation |
|-------------|-------|----------------|
| `'antv-dagre'` | `AntVDagreLayout` | **Use this** — AntV's own re-implementation, richer options |
| `'dagre'` | `DagreLayout` | Wraps external `dagre` npm package |

**Configuration for task DAG:**
```ts
layout: {
  type: 'antv-dagre',
  rankdir: 'TB',           // top-to-bottom
  nodesep: 60,             // horizontal spacing in same rank
  ranksep: 80,             // vertical spacing between ranks
  ranker: 'network-simplex',
  controlPoints: true,     // polyline edge control points
  animation: true,         // animate position transitions
}
```

**Key options**: `rankdir` (TB/BT/LR/RL), `nodesep`/`ranksep`, `ranker`, `preset` (reference positions for continuity), `nodeOrder` (explicit rank ordering), `radial` (dagre-based radial layout).

## 2. Existing ContextLayerGraph patterns

The current graph uses `combo-combined` (force + concentric) layout. **Switching to dagre is a localized change** — replace the layout config, remove combo-related code. Graph instance creation, data flow (`setData` → `render`), event handling, resize patterns all stay identical.

Key reusable patterns:
- Imperative `new Graph({...})` in `useEffect`
- Full-data-replacement via `graph.setData()` + `graph.render()` (G6 diffs internally)
- Minimap plugin
- Drag/zoom/pan behaviors
- Node click/dblclick event handling

## 3. Animated dashed edges — two approaches

**Approach A: Web Animations API (recommended for performance)**
`BaseEdge.animate()` delegates to `@antv/g`'s Web Animations API. `BaseStyleProps` includes both `lineDash` and `lineDashOffset` — standard properties that the Web Animations API can interpolate. Runs in the rendering engine's animation loop.

**Approach B: rAF loop (consistent with existing patterns)**
Same pattern as existing `pulseNode`/`blinkNodes` — `requestAnimationFrame` loop updating `lineDashOffset` via `graph.updateEdgeData()`. Simpler, already proven in the codebase.

```ts
function marchingAnts(graph, edgeIds) {
  let offset = 0, cancelled = false;
  const step = () => {
    if (cancelled) return;
    offset = (offset + 1) % 20;
    graph.updateEdgeData(edgeIds.map(id => ({
      id, style: { lineDash: [6, 4], lineDashOffset: offset },
    })));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => { cancelled = true; };
}
```

## 4. Incremental layout

**Partially supported via `preset` option.** G6 v5's `setData()` + `render()` automatically uses existing node positions as dagre preset — new nodes are placed by dagre while existing nodes animate to new positions. The layout still runs a full recomputation, but at 3-30 nodes this is sub-millisecond.

**Practical impact**: Full dagre re-layout on 30 nodes is instantaneous. `animation: true` smoothly transitions nodes from old to new positions. Appears incremental to the user even though it's a full re-layout.

## 5. G6 v5 vs lightweight SVG+dagre

| Factor | G6 v5 | SVG + dagre |
|--------|-------|-------------|
| Already in deps | Yes | Would need custom wiring |
| Dagre layout | Built-in, zero config | Manual position mapping |
| Edge animation | Native Web Animations API | Manual SVG animate/CSS |
| Interaction | Built-in drag/zoom/pan/minimap | Must implement from scratch |
| Team familiarity | Already used in context-layer | New abstraction |
| Performance at 3-30 nodes | Trivial | Also trivial |

**Verdict: G6 v5 is the clear winner.** Already a dependency, established patterns, dagre is one config line. No reason to build separate SVG+dagre.

## Bottom line

G6 v5.1.1 natively supports everything needed: dagre layout (`type: 'antv-dagre'`), animated dashed edges (`lineDashOffset` via Web Animations API or rAF), incremental layout via preset mechanism, and all interaction primitives. The task DAG component can follow the same patterns as `ContextLayerGraph` with a layout config swap.
