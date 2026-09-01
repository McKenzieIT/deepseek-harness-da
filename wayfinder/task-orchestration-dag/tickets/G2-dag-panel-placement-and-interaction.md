# G2 — DAG panel placement and interaction design

**Type**: prototype
**Status**: in-progress (claimed)
**Blocked by**: [R2 G6 dagre layout feasibility](R2-g6-dagre-layout-feasibility.md) ✅, [G1 DAG data model decision](G1-dag-data-model-decision.md) ✅
**Blocks**: [G4 animation and edge design](G4-animation-and-edge-design.md)

## Context from G1 + G5

G1 decided: the DAG is a **terminal state plugin** with structured `dag_task_*` tools and `dag/*` session events.

G5 D1 decided: the DAG panel is driven by a **Cordis service (`DagModelService`) + `useDagModel()` React Hook**, NOT by ConversationNodeDefinition. The DAG panel is a standalone sidebar component, not a conversation node. This means `ctx.slots.inject('conversation.chat.node', ...)` is NOT the registration path — the panel registers through a sidebar-appropriate slot.

G5 D2 decided: the DAG is **execution infrastructure**, not just visualization. This affects placement — the panel needs to be accessible at a glance during active orchestration, not buried in a details tab.

The current `TodoPanel` (dock strip above composer, `conversation.input.dock` slot) is rendered from `todo/write` events. Since the plugin **disables `tool-todo`** and replaces it with `dag_task_*` tools, the `TodoPanel` will have no data to render. The DAG panel is its successor.

## Question

Where does the DAG panel live in the three-column AppFrame layout, and how does the user interact with it? The user's stated preference is: **"侧边点击可伸缩的图形式"** — a sidebar-positioned, click-to-expand/collapse graph.

Current AppFrame columns: `sidebar (264-420px) | center (min 640px) | details (300-520px)`.

**Sub-questions:**

1. **Which column?**
   - **Left sidebar extension**: Add a section below the session list. Pro: "sidebar" matches user intent. Con: sidebar is 264-420px and already holds navigation; a graph needs more space.
   - **Right details panel** (`details.aux` slot): Coexists with tool-call details and the EvidenceSidebar. Pro: proven pattern, 300-520px, session-scoped. Con: competes with existing details content.
   - **Floating overlay** (`shell.overlay`): A draggable/resizable panel that floats above all columns. Pro: doesn't steal column space; user positions it freely. Con: complex z-index management, may feel disconnected.
   - **Dedicated toggle panel**: A new fourth column or a panel that slides out from an edge (like a drawer). Requires AppFrame modification — **upstream merge risk**.

2. **Collapse/expand behavior**: When collapsed, what does the user see — an icon rail button? A thin vertical strip with a minimap? A status badge showing "3 tasks running"?

3. **Node interaction**: Clicking a task node should... scroll to its tool call in the conversation? Open its detail in the details panel? Show an inline popover?

4. **Relationship to TodoPanel**: Since `tool-todo` is disabled, TodoPanel has no data source. Should the DAG plugin also register a compact dock-strip summary (reusing the `conversation.input.dock` slot) as a collapsed view, with the full graph in the sidebar?

## Upstream merge risk

- Using existing slots (`details.aux`, `shell.overlay`, `conversation.input.dock`) = **low risk** — these are documented extension points.
- Adding a new AppFrame column or modifying AppFrame layout = **high risk** — upstream may restructure the layout.

## Prototype deliverable

Build rough mockups of the DAG panel in each placement option (left sidebar, right details, floating overlay) using the G6 v5 dagre layout with sample DagTask nodes. The prototype should be reactive — click-to-expand/collapse, node status colors, basic edge rendering. The decision comes from reacting to the prototype, not from discussion alone.
