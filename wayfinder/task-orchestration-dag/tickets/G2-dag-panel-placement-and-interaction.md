# G2 — DAG panel placement and interaction design

**Type**: prototype
**Status**: resolved 2026-09-02(D 融合方案,用户确认)
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

## Prototype(详见 ../prototype/README.md,含完整自验记录)

- **Round 1(A/B/C,用户已反馈 2026-09-02)**:C 的 minimap 遮挡图(已修:默认关+右上角);
  B 伸缩+dock 摘要条好,但展开太小、放大失全貌、浮出卡不美观;A 大屏兼顾单节点与全貌、
  详情落点合理,但小屏看不清字太小;C 弹窗可补小屏 → **指示融合**。
- **Round 2(D 融合方案,默认 variant,awaiting confirmation)**:dock 摘要条(含
  **"正在执行 「任务名」"点名**)+ 侧栏分区折叠迷你条;展开 420 限高 min(42vh,400px)
  作一瞥视图(40 会话压力实测:不限高会话列表仅剩 230px);节点点击 → 容器内底部详情卡;
  **⛶ 弹出大视图**(860×600,拖/缩/最大化,⤡ 收回);字号加大(134×38/13px);
  **自动演进**(⏸/⏵⏵,2.6s/步,6 步循环);**图例行**。
- **动效(2026-09-02 定稿,像素级验证)**:@antv/g WAAPI——实测 `update*Data` **不触发
  重绘**(rAF 循环无效),连续动画必须 `element.animate()`、离散切换补 `graph.draw()`。
  流动**节奏恒定**(派生边 2 周期/秒、包含边 1 周期/秒,与 zoom 无关;像素速度恒定
  在低 zoom 下会变 ~10 周期/秒 抖动);**活跃节点呼吸**(执行什么);
  **hover 上下游链路高亮+其余压暗**(上下游关联);变迁脉冲 750ms;完成路径转绿。
  → 上游图谱同病已开 [W12](../../data-agent/tickets/phase-misc/W12-contextlayer-node-click-dead.md)(点击失效,
  subagent 已修 test:gui 绿)/[W13](../../data-agent/tickets/phase-misc/W13-contextlayer-animations-no-repaint.md)(动画不重绘)。
- **事故记录**:2026-09-02 18:10 原型四个代码文件+本工单被外部批量回滚至 9/1 状态
  (疑似同步工具),同日已全部重建并重新像素级验证(点击/流动/自动演进/无错误)。
  全部工作已 commit(512b5e104b、bafa5414a8)。

## Resolution(用户确认 D,2026-09-02)

**决定:采用 D 融合方案。** 三层结构 + 详情卡:

1. **常驻层**——composer 上方 dock 摘要条(`conversation.input.dock` 席位,
   **TodoPanel 后继**):计数 chips + **点名"正在执行 「任务名」"**;侧栏「任务编排」
   分区折叠迷你进度条(点击/摘要条均可展开)。
2. **一瞥层**——侧栏分区展开(420px,**限高 min(42vh,400px)**):快速查看不动布局;
   大量会话下不挤压会话列表(40 会话实测)。
3. **深看层**——⛶ 弹出大视图(`shell.overlay`,860×600 默认,拖拽/缩放/最大化,
   ⤡ 收回):大屏小屏都读得清,兼顾单节点与全貌。
4. **节点交互**——点击 → **容器内底部详情卡**(点画布空白收起);hover → 上下游
   链路高亮、其余压暗;"在对话中定位"留给 G4。

子问题裁决:① 位置=sidebar 分区+overlay 弹窗,**否 details.aux**(G5 D2 +
aux 无页签机制、改上游有 merge 风险);② 折叠态=dock 摘要条+迷你进度条(点名当前
任务弥补信息量);③ 节点详情=容器内底部卡(浮出卡否);④ dock 摘要条即 TodoPanel 后继。
字号基线:任务节点 134×38/13px。动效基线(节奏恒定)与理解层(呼吸/链路高亮/图例)
为 **G4 的验收起点**。原型与完整自验:`../prototype/`。
