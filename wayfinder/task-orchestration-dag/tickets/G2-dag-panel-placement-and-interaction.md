# G2 — DAG panel placement and interaction design

**Type**: grilling (+ prototype candidate)
**Status**: open
**Blocked by**: [R2 G6 dagre layout feasibility](R2-g6-dagre-layout-feasibility.md), [G1 DAG data model decision](G1-dag-data-model-decision.md)
**Blocks**: [G4 animation and edge design](G4-animation-and-edge-design.md)

## Question

Where does the DAG panel live in the three-column AppFrame layout, and how does the user interact with it? The user's stated preference is: **"侧边点击可伸缩的图形式"** — a sidebar-positioned, click-to-expand/collapse graph.

Current AppFrame columns: `sidebar (264-420px) | center (min 640px) | details (300-520px)`.

**Sub-questions:**

1. **Which column?**
   - **Left sidebar extension**: Add a section below the session list. Pro: "sidebar" matches user intent. Con: sidebar is 264-420px and already holds navigation; a graph needs more space.
   - **Right details panel** (`details.aux` slot): Coexists with tool-call details and the EvidenceSidebar. Pro: proven pattern, 300-520px, session-scoped. Con: competes with existing details content.
   - **Floating overlay** (`shell.overlay`): A draggable/resizable panel that floats above all columns. Pro: doesn't steal column space; user positions it freely. Con: complex z-index management, may feel disconnected.
   - **Dedicated toggle panel**: A new fourth column or a panel that slides out from an edge (like a drawer). Requires AppFrame modification.

2. **Collapse/expand behavior**: When collapsed, what does the user see — an icon rail button? A thin vertical strip with a minimap? A status badge showing "3 tasks running"?

3. **Node interaction**: Clicking a task node should... scroll to its tool call in the conversation? Open its detail in the details panel? Show an inline popover?

4. **Relationship to existing TodoPanel**: The current `TodoPanel` is a dock strip above the message composer (`conversation.input.dock` slot). Does the DAG panel replace it entirely, or does the TodoPanel remain as a compact summary with the DAG panel as the expanded view?

## Prototype suggestion

This ticket is a strong candidate for a `/prototype` session — build a rough static mockup of the DAG panel in each placement option to react to visually.
