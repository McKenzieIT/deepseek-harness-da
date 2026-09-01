# G1 — DAG data model decision

**Type**: grilling
**Status**: open
**Blocked by**: [R1 agent-team maturity audit](R1-agent-team-maturity-audit.md), [R3 subagent/workflow event surface](R3-subagent-workflow-event-surface.md)
**Blocks**: [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md), [G3 preset universality strategy](G3-preset-universality-strategy.md), [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)

## Question

What is the unified data model for the DAG visualization? The model must represent three node types (tasks, subagents, workflow runs) and their dependency/containment relationships. Key tensions:

**Option A: Extend TeamTaskBoard**
- Graduate `agent-team` from experimental, add a `nodeType: 'task' | 'subagent' | 'workflow'` discriminator to `TeamTaskSnapshot`.
- Subagent/workflow nodes are "synthetic tasks" injected by their respective lifecycle hooks.
- Pro: single DAG model, single persistence path, cycle detection works across all node types.
- Con: conflates supervision (subagent tree) with dependency (task blockedBy). Forces subagents into the task lifecycle (claim/release/complete).

**Option B: Composite projection**
- Keep `TeamTaskBoard` for task nodes only. Subagent nodes come from `subagent/start`+`subagent/end` events. Workflow nodes come from `workflow/start`+`workflow/end`.
- A new **client-side composite projection** merges the three event streams into a unified `DAGNode[]` for rendering.
- Pro: each domain stays clean. Subagents don't need fake "task" wrappers.
- Con: dependency edges between tasks and subagents require a new linkage mechanism. The "DAG" is partially task-dependency, partially containment — needs clear semantics.

**Option C: New lightweight DAG service**
- A new `ctx.taskGraph` service that aggregates events from todo, subagent, and workflow into a single event-sourced DAG model purpose-built for visualization.
- Pro: clean abstraction, no experimental package graduation needed, designed exactly for the visualization use case.
- Con: more new code, potential duplication with `TeamTaskBoard`.

Which option best serves the destination — and specifically, which prepares the best infrastructure for future dynamic workflows and multi-agent coordination?

## Sub-questions

- Should the DAG enforce that subagent nodes can only be children of the task that spawned them? Or can they be free-floating?
- How do workflow `phase` nodes relate to task nodes — are they children of a workflow run node?
- What happens when the model calls `todo_write` (the flat list tool) — does the DAG projection interpret it, or does a new tool replace `todo_write`?
