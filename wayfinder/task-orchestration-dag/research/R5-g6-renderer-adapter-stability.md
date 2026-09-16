# R5 — G6 renderer adapter stability

## Question

What is the smallest renderer adapter that isolates `@antv/g6` and `@antv/g` while supporting layout, incremental updates, animation, cancellation, destruction, reduced motion, resize and hidden-tab handling, and deliberate dependency upgrades?

## Conclusion

Use one renderer-neutral `TaskGraphScene` value and one private `G6TaskGraphRenderer` implementation. The caller always supplies a complete current scene; the adapter computes whether the change is topology/layout-affecting or style-only, serializes asynchronous work with a generation token, and translates the scene to G6 data internally. Topology changes use `setData()` followed by `render()`; style-only changes use `updateData()` followed by `draw()`. The first release should disable G6-managed animation and own the small set of approved motion effects through `@antv/g` `IAnimation` handles so cancellation, reduced motion, hidden-tab suspension, and destruction remain deterministic.

This is the highest-ROI slice because it preserves the accepted Task DAG authority and current-state UI, uses the already installed G6 stack, and confines every unstable renderer API to one package without introducing a second renderer, a delta wire protocol, worker layout, or a general visualization framework. The adapter can support G6 upgrades through root-import type checks and a real-canvas lifecycle smoke suite rather than by exposing G6 types to callers.

## Scope and terminology

A **renderer adapter** is the private code that translates renderer-neutral Task DAG presentation values into G6 nodes, edges, calls, events, and animation handles. A **generation token** is a monotonically increasing number captured by each asynchronous update; when an older operation resolves after a newer one, it is treated as superseded and performs no follow-up work. A **logical cancellation** stops adapter-owned work and ignores stale completion when the underlying library operation cannot be interrupted.

The renderer consumes the safe current `TaskGraphView` selected by G14 and G15. It does not receive Task DAG journal records, outbox payloads, credentials, native executor references, DSH Session events, layout coordinates, colors, or G6 values. Tasks are graph nodes; Attempts, Bindings, assurance, Holds, budgets, outputs, evidence, external-effect certainty, late results, and the latest stop remain details or compact node annotations rather than independent first-release graph nodes. [F1]

## Evidence baseline

The inspected worktree is `/Users/mckenzie/workspace/deepseek-harness-da/.worktrees/task-orchestration-dag-baseline` on 2026-09-16.

- The lockfile resolves the existing `packages/client/ui-context-layer` declaration `"@antv/g6": "^5.0.0"` to exactly `@antv/g6@5.1.1`; that package resolves `@antv/g@6.3.1`, `@antv/g-lite@2.7.0`, `@antv/g-canvas@2.2.0`, and `@antv/layout@2.0.0`. [F2]
- The installed G6 package publishes `src`, `esm`, `lib`, and `dist`, declares `lib/index.d.ts` as its type entry, and depends on `@antv/g` through the range `^6.1.28`. The installed G package exports `types/index.d.ts` and re-exports `@antv/g-lite`; the actual `IAnimation`, `DisplayObject`, `Document`, and canvas declarations therefore remain public through the root `@antv/g` entry. [F3]
- The current `ui-context-layer` package declares only `@antv/g6`, so a direct `import type { DisplayObject } from '@antv/g'` does not resolve from that package today. A Task DAG renderer that directly uses G display objects must declare `@antv/g` as its own dependency instead of relying on G6's transitive dependency. An in-memory strict TypeScript probe against the installed root declarations successfully type-checked the G6 and G calls listed below once both package paths were resolvable. [F4]

No external documentation was required: the installed package source, declarations, lockfile, and existing browser prototype answer the ticket's API questions directly.

## Verified facts: public typed API

### Root exports and data mutation

`Graph`, `GraphEvent`, `NodeEvent`, `CanvasEvent`, `GraphData`, `LayoutOptions`, `IElementEvent`, and the relevant graph data types are exported from the `@antv/g6` root. The adapter does not need a G6 deep import. `DisplayObject` and `IAnimation` are exported through the `@antv/g` root via its `@antv/g-lite` re-export. [F5]

`GraphData` contains optional `nodes`, `edges`, and `combos`; `NodeData` requires `id`, while `EdgeData` requires `source` and `target` and permits an explicit `id`. Both carry custom `data`, renderer style, and states. `PartialGraphData` requires node/combo IDs and permits an edge update by ID or by source/target. [F6]

The public mutation methods are synchronous model writes: `setData`, `addData`, `updateData`, and `removeData` return `void`. The declarations explicitly state that `setData` replaces the full data value while G6 calculates the difference, and `updateData` accepts partial values. Their implementation delegates to the internal model and does not draw. A visible update therefore requires a subsequent `draw()` or `render()`. [F7]

### Draw, render, and layout ordering

`Graph.render(): Promise<void>` performs preparation, emits `BEFORE_RENDER`, and then chooses one of three paths. With no layout it draws and waits for the draw animation and auto-fit. On the first render with a pre-layout it calculates layout before creating elements. Otherwise it starts the element draw and post-layout together with `Promise.all`, then awaits auto-fit, marks the graph rendered, and emits `AFTER_RENDER`. [F8]

`Graph.draw(): Promise<void>` draws changed elements and waits for the G6 draw animation, but it does not rerun layout. `Graph.layout(layoutOptions?): Promise<void>` invokes post-layout directly. `Graph.stopLayout(): void` delegates to `LayoutController.stopLayout()`. The controller can call `stop()` only for iterative layouts; for a non-iterative layout such as dagre there is no public preemptive cancellation path. The source also declares an `animationResult` field but does not assign the local layout animation to it in this release, so `stopLayout()` cannot be relied upon to cancel a dagre position animation. [F9]

`GraphEvent` exposes `BEFORE/AFTER_DRAW`, `BEFORE/AFTER_RENDER`, `BEFORE/AFTER_ANIMATE`, `BEFORE/AFTER_LAYOUT`, per-stage layout events, size-change events, transform events, and destroy events. `Graph.on`, `once`, and `off` are public, but event names remain plain strings with a caller-selected generic event type rather than an event-name-to-payload map. Awaiting `render()`, `draw()`, or `layout()` is therefore the stronger completion primitive; events are appropriate for interaction and diagnostics, not orchestration correctness. [F10]

### Display-object lookup and direct animation

G6 does not expose a public `Graph#getElement()` that returns its rendered object. Its public `getElementRenderStyle(id)` returns only a style record. The typed lower-level lookup is `graph.getCanvas().document.getElementById<DisplayObject>(id)`: G6's public `Canvas` exposes `document`, `@antv/g` `Document#getElementById` is public and generic, and G6 creates each rendered element with the domain datum ID as the display object's `id`. [F11]

A looked-up `DisplayObject` has `animate(keyframes, options): IAnimation | null`. `IAnimation` exposes `playState`, `ready`, `finished`, `onfinish`, `oncancel`, `play`, `pause`, `finish`, `cancel`, and playback-rate control. In the installed implementation, `cancel()` removes the effect and transitions the animation to idle; `updatePromises()` rejects an already-created `finished` promise when that transition occurs. Adapter-owned finite animations must therefore attach a rejection handler before they can be cancelled, and infinite animations should be tracked as handles rather than awaited. [F12]

G6 creates a new display object when an element's G6 type changes, destroying the old object first. Any stored display-object or animation handle can therefore become stale across a render. The adapter must reacquire display objects after the successful completion of the current render generation and must cancel old animation handles before topology or type changes. [F13]

### Resize, hidden containers, and cleanup

`Graph` defaults `autoResize` to `false`. When enabled, it listens to the global `resize` event; this is not container-aware observation. `Graph.resize(width, height)` resizes the canvas and emits before/after size events but does not rerun layout. The internal size helper reads container dimensions and substitutes `640 × 480` when a hidden or zero-sized container reports no usable dimensions. Passing zero also falls through because the implementation uses `width || containerWidth`. The adapter must therefore ignore zero-sized observations rather than resize or render a hidden panel at the fallback size. [F14]

`Graph.setOptions()` documents that changing `container` or `devicePixelRatio` requires destruction and recreation. `Graph.destroy()` destroys plugins, behaviors, layout, G6-managed animations, elements, the model, and canvas; clears graph listeners; removes the global resize listener; and sets `destroyed = true`. The implementation removes listeners before emitting `AFTER_DESTROY`, so adapter cleanup must not depend on observing that event. The method is not safe as an unguarded repeated call because internal context is cleared on the first destruction. [F15]

The existing Task DAG prototype independently exercises the same installed API: it looks up display objects through `graph.getCanvas().document`, calls `DisplayObject.animate`, retains and cancels handles, reinstalls animations after rendering, observes container resize, guards asynchronous render completion with a destroyed flag, and disconnects timers, observers, animations, and the graph on teardown. The current `ContextLayerGraph` also documents and tests the render/unmount race and uses `ResizeObserver` rather than G6 `autoResize`. These are local implementation observations, not substitutes for the installed package declarations above. [F16]

## Recommendation: smallest stable adapter

### Package boundary

Create one renderer package or leaf module in which all imports from `@antv/g6` and `@antv/g` live. Its exported values contain no AntV types. Declare both libraries as direct dependencies, lock the repository to the tested pair `@antv/g6@5.1.1` and `@antv/g@6.3.1`, and import only from package roots. Keep the pure `TaskGraphView`-to-scene mapper outside or beside the imperative driver so most tests run without canvas.

```mermaid
flowchart LR
  View[TaskGraphView current value] --> Mapper[Pure scene mapper]
  Mapper --> Scene[TaskGraphScene]
  Scene --> Port[TaskGraphRenderer port]
  Port --> G6[G6TaskGraphRenderer private adapter]
  G6 --> G6Graph[@antv/g6 Graph]
  G6 --> GDisplay[@antv/g DisplayObject and IAnimation]
  G6 --> Events[Renderer-neutral callbacks]
```

The minimal public port is:

```ts
export interface TaskGraphRenderer {
  update(scene: TaskGraphScene, options?: { signal?: AbortSignal }): Promise<RenderDisposition>
  resize(size: { width: number; height: number }): void
  setEnvironment(environment: { visible: boolean; reducedMotion: boolean }): void
  focusTask(taskId: string): Promise<void>
  destroy(): void
}

export type RenderDisposition = 'applied' | 'superseded' | 'deferred' | 'cancelled'

export interface TaskGraphRendererCallbacks {
  onTaskActivate(taskId: string): void
  onCanvasActivate(): void
  onViewportChange(viewport: { x: number; y: number; zoom: number }): void
}

export function createTaskGraphRenderer(
  container: HTMLElement,
  callbacks: TaskGraphRendererCallbacks,
): TaskGraphRenderer
```

`update` accepts a full immutable scene rather than renderer deltas. This matches G14's first-release whole-value transport, keeps reconnection and sequence-gap recovery simple, and lets the adapter choose the cheapest correct G6 operation. `deferred` means the adapter accepted the scene as its latest desired value but did not draw because the container is hidden or has no usable size; `cancelled` means caller cancellation or destruction prevents that update from performing further work. `resize`, environment changes, focus, and destruction are the only imperative concerns that cannot be represented by the scene itself.

### Renderer-neutral scene

The scene should preserve Task DAG meanings but not reproduce every detail record. Details remain owned by the surrounding current-state panel.

```ts
export interface TaskGraphScene {
  key: {
    planRunId: string
    journalSeq: number
    planRevision: number
  }
  tasks: readonly TaskVisual[]
  relations: readonly TaskRelationVisual[]
  selectedTaskId?: string
}

export interface TaskVisual {
  id: string
  label: string
  lifecycle: 'proposed' | 'active' | 'completed' | 'failed' | 'cancelled' | 'superseded'
  readiness: 'not-ready' | 'ready' | 'claimed' | 'running' | 'verifying' | 'terminal'
  attempt: {
    count: number
    current?: {
      phase: 'prepared' | 'running' | 'settling' | 'settled'
      outcome?: 'succeeded' | 'failed' | 'cancelled' | 'interrupted' | 'unknown'
      cancellation: 'none' | 'requested' | 'confirmed' | 'late-result'
    }
  }
  assurance: {
    state: 'not-requested' | 'pending' | 'satisfied' | 'rejected' | 'inconclusive'
    evidenceCount: number
    unmetCriterionCount: number
  }
  hold?: {
    count: number
    primaryReason: string
    resume: 'automatic' | 'explicit'
  }
  replan: {
    state: 'unchanged' | 'added' | 'revised' | 'superseded'
    revision: number
  }
}

export interface TaskRelationVisual {
  id: string
  sourceTaskId: string
  targetTaskId: string
  kind: 'hard-dependency' | 'declared-order'
  state: 'pending' | 'satisfied' | 'blocking' | 'superseded'
}
```

The mapper derives these compact values from the authoritative `TaskGraphView`; it does not infer completion from an Attempt, Binding, output, observation, or late result. `assurance` is the user-facing summary of acceptance criteria, evidence, and verdicts. A `hold` means an authoritative admission barrier, not merely a blocked dependency. `replan` describes how the current Plan revision treats the Task; it is not a history timeline. This keeps the node useful in a data-agent flow: a natural-language analytics Task can separately show that execution is running, its metric-definition evidence is still pending assurance, and a clarification Hold requires the user to select one of several valid business definitions.

Use stable namespaced G6 IDs such as `task:${taskId}` and `relation:${relationId}`. Keep the original Task and relation IDs in the custom `data` object. Do not derive identity from array position, label, status, Attempt number, or current Plan revision.

### Update policy and ordering

The adapter stores the latest scene, a destroyed flag, an incrementing generation, the current visible/nonzero size, a dirty-while-hidden flag, and a set of adapter-owned `IAnimation` handles.

1. Validate that every relation endpoint exists and that renderer IDs are unique before touching G6.
2. Increment the generation, attach the optional abort signal, and cancel adapter-owned animations from the previous generation.
3. If the adapter is hidden or has no nonzero size, retain only the latest scene, mark it dirty, return `deferred`, and do not call G6.
4. Compare the latest applied scene by stable IDs, endpoints, labels, node-size-affecting fields, and layout policy. For a topology/layout change, call `graph.setData(fullG6Data)` and `await graph.render()`.
5. For a style-only change, call `graph.updateData(partialG6Data)` and `await graph.draw()`; do not call `layout()`.
6. After each await, check the abort signal, generation, and destroyed flag. A stale operation returns `superseded` and installs no animations, focus, or callbacks.
7. Reacquire display objects from `graph.getCanvas().document` and install only the motion effects permitted by the current environment.

Use one serialized latest-wins queue rather than allowing overlapping `render`, `draw`, and `layout` calls. G6 does not expose transaction or cancellation semantics for overlapping graph renders, and its normal post-layout render path already coordinates drawing and layout internally. Calling `draw()` and `layout()` separately for the same topology update would duplicate ordering responsibility without adding user value.

### Animation and cancellation

Set G6 global animation and layout animation to `false` in the first release. Implement only approved semantic motion through direct `DisplayObject.animate()` calls inside the adapter. This gives the adapter concrete handles for completion, pause/play if later required, and cancellation. It also avoids depending on the incomplete public cancellation story for G6-managed non-iterative layout animations.

For every finite animation, register the handle before observing completion and consume cancellation rejection:

```ts
const animation = display.animate(keyframes, timing)
if (animation) {
  animations.add(animation)
  void animation.finished
    .catch(() => undefined)
    .finally(() => animations.delete(animation))
}
```

For every continuous animation, retain the handle without awaiting `finished`. Cancel and clear all handles before topology replacement, when reduced motion becomes active, when the document becomes hidden, and during destruction. On visibility restoration, reacquire current display objects and reinstall effects from the latest scene; do not resume stale objects.

Cancellation has three levels: abort pending adapter work with `AbortSignal`; call `stopLayout()` as a best effort for iterative layouts; and cancel every adapter-owned `IAnimation`. A non-iterative dagre calculation or an already-running G6 `render()` is only logically cancellable, so generation checks are mandatory. `destroy()` is the final physical cancellation and must run once.

### Reduced motion

Treat reduced motion as an explicit environment input, normally derived by the Client owner from `matchMedia('(prefers-reduced-motion: reduce)')`. When true, cancel existing handles, skip all direct animation installation, use non-animated focus/fit operations, and keep G6 and layout animation disabled. State, assurance, Hold, and replan meaning must remain visible through shape, stroke, label, icon, or static pattern; motion cannot be the only carrier of information.

A runtime preference change applies immediately. Turning motion off cancels handles before any redraw. Turning it back on reinstalls only effects justified by the latest applied scene and only while visible.

### Resize, hidden tabs, and remount

Use a `ResizeObserver` owned by the React integration or adapter and keep G6 `autoResize` disabled. Coalesce observations to one animation frame. Ignore widths or heights below one pixel, record the scene as dirty, and avoid G6's hidden-container fallback size. On the first subsequent visible nonzero observation, call `graph.resize(width, height)` and render the latest scene if dirty.

Listen to document visibility through the owner and call `setEnvironment`. While hidden, stop layout best-effort, cancel direct animations, and coalesce all incoming scenes to the latest value. On visibility restoration, resize first, then apply the latest scene, then reinstall motion. Do not run background continuous animation for a hidden data-agent Session tab.

A normal resize changes the canvas size but should not relayout on every pixel. Relayout only when topology changes or when a named layout breakpoint changes, such as switching the Task DAG between top-to-bottom and left-to-right presentation. Fullscreen can resize and then explicitly fit once; ordinary watched updates should preserve user zoom and pan because G15 assigns viewport state to React presentation.

On remount, create a new adapter and Graph instance. Never carry G6 display objects, animation handles, event subscriptions, or generation promises across instances. A container or device-pixel-ratio change also uses destroy/recreate because G6 documents those options as non-dynamic.

### Events and interaction

Subscribe with exported constants where available and translate immediately to renderer-neutral callbacks. A node event becomes `{ taskId }`; a canvas event becomes a background activation; viewport events become plain zoom/pan values. Do not expose `IElementEvent`, `DisplayObject`, event names, or G6 coordinates outside the adapter.

Use `event.target.id` only to recover the namespaced renderer ID and then map it through the adapter's ID table. The current prototype and `ContextLayerGraph` confirm that `target.id`, not a legacy `itemId`, is the installed 5.1.1 event path. Listener cleanup should call `off(event, callback)` for owned callbacks before the guarded single `destroy()` call, even though G6 also clears listeners during destruction.

## Focused test matrix

| Area | Required cases | Assertions |
|---|---|---|
| Pure mapping | Task in ready, running, verifying, completed, failed, cancelled, and superseded states | Stable IDs; lifecycle and readiness stay separate; no AntV values in output |
| Attempts | No Attempt, prepared, running, settled success/failure, cancellation requested/confirmed, interrupted, unknown outcome, late result | Attempt state never directly marks Task complete; cancellation and late result remain distinguishable |
| Assurance | Not requested, pending, satisfied, rejected, inconclusive; zero and multiple evidence records | Static visual token exists even with reduced motion; evidence count and unmet criteria survive mapping |
| Holds | No Hold, clarification Hold, approval Hold, reconciliation Hold, automatic and explicit resume | Hold remains distinct from dependency blocking; primary reason and resume mode are retained |
| Replans | Unchanged retained Task, added Task, revised Task, superseded Task; relation added or superseded | Stable Task identity across revision; no history inferred beyond supplied current markers |
| Relations | Hard dependency and declared order; pending, satisfied, blocking, superseded | Endpoints validated; deterministic relation IDs; no edge generated for missing endpoint |
| Initial render | Empty, one Task, small branch, 30-Task expected graph | `setData` precedes one awaited `render`; display lookup and callbacks install only afterward |
| Incremental style update | Attempt, assurance, Hold, selection, or status changes without topology/size change | `updateData` then awaited `draw`; no `render` or `layout` call |
| Topology update | Add/remove Task, add/remove/repoint relation, label/size change, layout-breakpoint change | Full scene passed to `setData`; one awaited `render`; stale animations cancelled and reacquired |
| Ordering | Slow render A followed by update B; abort A; unmount while A is pending | A resolves as superseded/cancelled and performs no post-render work; only B installs effects |
| Direct animation | Finite completion, infinite effect, lookup miss, null `animate`, element type replacement | Handles are registered, cancellation rejection is consumed, infinite effects are never awaited, lookup miss is safe |
| Reduced motion | Reduced at mount; preference toggled during animation; restored while hidden | No new animation under reduction; existing handles cancelled; static meaning unchanged; restore uses latest scene only |
| Resize | Repeated observer bursts; unchanged size; zero-sized hidden panel; normal-to-fullscreen breakpoint | Coalesced calls; no zero resize; resize before visible render; relayout only at named breakpoint |
| Hidden tab | Updates while hidden, resize while hidden, restore visible | No draw/render/animation while hidden; only latest scene applied after resize on restore |
| Destruction | Destroy before first render resolves, destroy during draw, repeated destroy, remount | Graph destroyed once; observers/listeners/signals/animations cleared; no call reaches old Graph after teardown |
| Events | Node click, keyboard activation supplied by UI owner, canvas click, viewport change | Only renderer-neutral IDs and values escape; callbacks removed on teardown |
| Scale | 1, 30, and 100 Tasks with representative edges and annotations | 30-Task first-release case stays responsive; 100-Task case records evidence for G11 simplification rather than silently changing semantics |
| Upgrade gate | Current locked pair and proposed dependency pair | Root imports compile; real browser mounts, renders, updates, cancels, hides/restores, resizes, and destroys without console errors or unhandled rejections |

Use a fake internal `G6Driver` for deterministic unit tests of call ordering and cancellation, plus a small real-browser suite against the installed Canvas renderer. JSDOM alone cannot validate G scene lookup, animation effects, or canvas cleanup. The real suite should assert `document.getElementById<DisplayObject>` after render, observe one direct animation through completion and cancellation, and check that destruction leaves no active adapter handles or post-destroy calls.

## Upgrade policy

Treat `@antv/g6` and `@antv/g` as a tested pair. The repository lockfile records the exact pair; the renderer package declares both direct dependencies; no caller imports either package. Upgrade them in one change and run the focused type and browser contract suite before accepting the new lockfile.

The compatibility gate checks exact root symbols: `Graph`, `GraphEvent`, `NodeEvent`, `CanvasEvent`, `GraphData`, `IElementEvent`, `Graph#setData`, `Graph#updateData`, `Graph#render`, `Graph#draw`, `Graph#layout`, `Graph#stopLayout`, `Graph#getCanvas`, `Graph#resize`, `Graph#destroy`, `Canvas#document`, `Document#getElementById`, `DisplayObject#animate`, and `IAnimation#finished/#cancel`. It also checks behavior that types cannot guarantee: mutation requires draw/render, stale completion is ignored, display IDs equal translated renderer IDs, cancellation does not create an unhandled rejection, zero-size containers are deferred, and destroy/remount is clean.

Do not depend on `Graph.context`, `LayoutController`, `ElementController#getElement`, internal animation-manager methods, deep package paths, or source-only classes. They were inspected to explain current behavior but are not part of the adapter's supported dependency surface.

If a future G6 release removes the typed `Canvas#document` lookup or changes display-object identity, only the private lookup/animation implementation changes. The renderer-neutral scene and port remain stable; G4 can choose a different motion implementation without changing Task DAG projection or Client ownership.

## First-release ROI

| Dimension | Assessment |
|---|---|
| User benefit | High: the current Task DAG remains understandable during watched updates, Holds, verification, and replans; reduced-motion and hidden-tab behavior avoid distracting or wasteful rendering |
| Implementation cost | Moderate and localized: one pure mapper, one imperative adapter, one lifecycle hook, and focused tests reuse the installed graph stack |
| Maintenance cost | Low-to-moderate: AntV APIs are contained, exact versions are locked, and upgrades have an explicit contract suite |
| Runtime and model overhead | Low: rendering stays in the Client; whole current values already exist; the adapter performs local diffing and no additional model calls |
| Adoption breadth | High for dsh-data-agent: the same scene supports the compact-to-fullscreen current view and future renderer replacement without changing Task DAG authority |
| Evidence strength | High for API availability and lifecycle behavior because the installed source and declarations are present; moderate for scale beyond the expected 3–30 Task range until browser measurements exist |
| Opportunity cost | Small if the first release avoids a generic renderer SPI, worker layout, delta transport, and continuous motion system |
| Smallest useful release | Full-scene input, topology/style diff, dagre render, stable events, direct cancellable motion hooks, reduced motion, zero-size/hidden deferral, resize, and guarded destruction |

The first release should implement that smallest useful slice. [G11 DAG view simplification strategies](../tickets/G11-dag-view-simplification-strategies.md) owns semantic zoom and graph simplification beyond the 30-Task baseline; [G28 History, trace, and plan inspection](../tickets/G28-history-trace-and-plan-inspection.md) owns persistent inspection state; [G8 Global progress wavefront](../tickets/G8-z-enhancement-global-progress-wavefront.md) owns continuous progress motion; and [G34 Renderer scaling and replacement threshold](../tickets/G34-renderer-scaling-and-replacement-threshold.md) owns performance-specific deltas, worker layout, and alternate-renderer adoption after measurements justify them.

## Facts versus recommendations

The installed versions, public declarations, source ordering, event constants, display lookup route, animation handle API, resize fallback, and destruction behavior above are facts from the cited primary sources. The renderer-neutral scene, full-scene update port, latest-wins queue, disabled G6-managed animation, direct-handle motion ownership, hidden-tab policy, test matrix, and ROI slice are recommendations derived from those facts and the resolved G14/G15 product constraints.

## Primary-source citations

- **[F1] Accepted Task DAG and Client inputs:** `wayfinder/task-orchestration-dag/tickets/G14-task-graph-projection-boundary.md`, symbols/sections `TaskGraphView`, “Projection, Remote transport, and Client ownership”; `wayfinder/task-orchestration-dag/tickets/G15-current-client-placement.md`, sections “Client ownership” and “Information hierarchy”.
- **[F2] Exact installed dependency graph:** `pnpm-lock.yaml:2812-2816` (`packages/client/ui-context-layer` importer), `pnpm-lock.yaml:13475-13500` (resolved package versions), `pnpm-lock.yaml:20550-20566` (`@antv/g6@5.1.1` and `@antv/g@6.3.1` dependency entries); `packages/client/ui-context-layer/package.json:47-49`.
- **[F3] Package entry points and published source:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/package.json`, fields `version`, `main`, `module`, `types`, `files`, `dependencies.@antv/g`; `node_modules/.pnpm/@antv+g@6.3.1/node_modules/@antv/g/package.json`, fields `version`, `exports`, `types`, `dependencies.@antv/g-lite`; `node_modules/.pnpm/@antv+g@6.3.1/node_modules/@antv/g/types/index.d.ts:1`; `node_modules/.pnpm/@antv+g-lite@2.7.0/node_modules/@antv/g-lite/types/index.d.ts:1-12`.
- **[F4] Direct dependency requirement and type probe:** `packages/client/ui-context-layer/package.json:47-49` declares `@antv/g6` but not `@antv/g`; Node resolution from that package returned `MODULE_NOT_FOUND` for `@antv/g`; an in-memory TypeScript 5 strict probe against the installed root declarations compiled `Graph`, `GraphData`, `GraphEvent`, `IElementEvent`, `DisplayObject`, `IAnimation`, data mutation, render/draw/layout, display lookup, animation cancellation, event subscription, resize, and destroy with no diagnostics.
- **[F5] Root exports:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/exports.ts`, symbols `GraphEvent`, `NodeEvent`, `CanvasEvent`, `Graph`, `GraphData`, `LayoutOptions`, `IElementEvent`; `node_modules/.pnpm/@antv+g@6.3.1/node_modules/@antv/g/types/index.d.ts:1`; `node_modules/.pnpm/@antv+g-lite@2.7.0/node_modules/@antv/g-lite/types/index.d.ts:7-8`.
- **[F6] Renderer data declarations:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/spec/data.d.ts`, symbols `GraphData`, `NodeData`, `EdgeData`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/types/data.d.ts`, symbols `PartialNodeLikeData`, `PartialEdgeData`, `PartialGraphData`.
- **[F7] Mutation methods:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/runtime/graph.d.ts:487-643`, symbols `Graph#setData`, `Graph#addData`, `Graph#updateData`, `Graph#removeData`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts`, implementations of the same symbols.
- **[F8] Render ordering:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts:1182-1214`, symbol `Graph#render`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/element.ts:308-365`, symbols `ElementController#preLayoutDraw` and `ElementController#setAnimationTask`.
- **[F9] Draw/layout/cancellation:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts:1216-1259`, symbols `Graph#draw`, `Graph#layout`, `Graph#stopLayout`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/layout.ts:150-187,275-285`, symbols `LayoutController#graphLayout`, `LayoutController#stopLayout`; the same file's `animationResult` declaration and assignments search shows no assignment to the field in 5.1.1.
- **[F10] Events:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/constants/events/graph.ts`, enum `GraphEvent`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/constants/events/node.ts`, enum `NodeEvent`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/constants/events/canvas.ts`, enum `CanvasEvent`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/runtime/graph.d.ts:1294-1331`, symbols `Graph#on`, `Graph#once`, `Graph#off`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/types/event.d.ts`, interfaces `IElementEvent`, `IGraphLifeCycleEvent`, `IAnimateEvent`.
- **[F11] Display lookup:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/runtime/graph.d.ts:1070-1079`, symbols `Graph#getElementPosition`, `Graph#getElementRenderStyle`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/lib/runtime/canvas.d.ts:50-114`, symbols `Canvas#document`, `Canvas#getRoot`; `node_modules/.pnpm/@antv+g-lite@2.7.0/node_modules/@antv/g-lite/types/dom/Document.d.ts:66-75`, symbol `Document#getElementById`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/element.ts:442-464`, symbol `ElementController#createElement` assigning `id` to the created display object.
- **[F12] Animation API and cancellation:** `node_modules/.pnpm/@antv+g-lite@2.7.0/node_modules/@antv/g-lite/types/display-objects/DisplayObject.d.ts:145`, symbol `DisplayObject#animate`; `node_modules/.pnpm/@antv+g-lite@2.7.0/node_modules/@antv/g-lite/types/dom/interfaces.d.ts:332-360`, interfaces `IAnimationTimeline`, `IAnimation`; `node_modules/.pnpm/@antv+g@6.3.1/node_modules/@antv/g/dist/index.esm.js.map`, source `../src/plugins/web-animations-api/dom/Animation.ts`, symbols `Animation#cancel`, `Animation#updatePromises`.
- **[F13] Element replacement:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/element.ts:513-533`, symbol `ElementController#updateElement`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/elements/base-element.ts:24-32`, symbol `BaseElement#animate`.
- **[F14] Resize behavior:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts:72-78,99-106,1318-1346`, symbols `Graph.defaultOptions`, `Graph#resize`, `Graph#onResize`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/spec/canvas.ts:18-57`, interface `CanvasOptions`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/utils/dom.ts:10-45`, functions `getContainerSize`, `sizeOf`.
- **[F15] Cleanup and remount constraints:** `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts:119-152`, symbol `Graph#setOptions`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/graph.ts:1274-1305`, symbol `Graph#destroy`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/layout.ts:390-399`, symbol `LayoutController#destroy`; `node_modules/.pnpm/@antv+g6@5.1.1/node_modules/@antv/g6/src/runtime/animation.ts:152-183`, symbols `Animation#stop`, `Animation#destroy`.
- **[F16] Existing worktree evidence:** `wayfinder/task-orchestration-dag/prototype/dag-graph.js:133-224,260-329`, symbols `createDagGraph`, `findEl`, `installAnimations`, returned `destroy`; `packages/client/ui-context-layer/src/client/ContextLayerGraph.tsx:226-301`, graph event, render-race, destruction, and `ResizeObserver` lifecycle; `packages/client/ui-context-layer/tests/ContextLayerGraph.spec.tsx`, render/unmount race tests.
