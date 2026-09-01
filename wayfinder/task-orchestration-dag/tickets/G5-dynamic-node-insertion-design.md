# G5 — dynamic node insertion and subagent/workflow integration

**Type**: grilling
**Status**: open
**Blocked by**: [R3 subagent/workflow event surface](R3-subagent-workflow-event-surface.md), [G1 DAG data model decision](G1-dag-data-model-decision.md)
**Blocks**: —

## Question

When a subagent is spawned or a new task is created mid-session, the corresponding node must appear in the DAG in real time. How should dynamic insertion work?

**Sub-questions:**

1. **Event-driven insertion**: Which events trigger node creation?
   - `todo/write` with a new item → task node
   - `subagent/start` → subagent node
   - `workflow/start` → workflow run node
   - `workflow/agent-start` → child agent node under workflow
   - Should there also be events for `goal/change` (goal created/activated)?

2. **Automatic edge creation**: When a subagent is spawned by a tool call within a turn that's working on task X, should the DAG automatically create an edge from task X to the subagent node? What heuristic establishes which task "owns" a subagent?

3. **Layout recomputation**: Inserting a node into a dagre layout changes the positions of existing nodes. How should this animate?
   - Option A: Full re-layout with smooth position transitions for all nodes.
   - Option B: Insert new node at the bottom/edge with a local layout adjustment.
   - Option C: Batch insertions — accumulate events during a turn, re-layout once at turn end.

4. **Node removal/completion**: When a task completes or a subagent finishes, should its node stay in the graph (dimmed) or be removed? Keeping it shows history; removing it keeps the graph clean.

5. **Scale concern**: A workflow with `parallel(items.map(...))` over 20 items would create 20 subagent nodes simultaneously. How does the graph handle a burst of 20 insertions without visual chaos?

## Infrastructure implication

This ticket directly affects the "infra preparation for dynamic workflows" part of the destination. The event subscription patterns and projection mechanisms designed here become the foundation for any future system that needs to render a live, evolving agent execution graph.
