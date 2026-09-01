# R3 — subagent and workflow event surface for DAG integration

**Type**: research
**Status**: closed
**Blocked by**: —
**Blocks**: [G1 DAG data model decision](G1-dag-data-model-decision.md), [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)

## Question

What events are available for integrating subagent and workflow nodes into a DAG visualization?

## Resolution

See [research/R3-subagent-workflow-event-surface.md](../research/R3-subagent-workflow-event-surface.md).

**Summary**: Workflow events are well-persisted in the parent session (4 `tool-workflow/*` event types) — excellent for DAG visualization. Subagent events are ephemeral in the parent (`subagent/start`/`subagent/end` are Cordis-only) but durable in the child (`subagent/descriptor`). The primary gap: **no task↔subagent linkage exists** — `SubagentStartRequest` has no `taskId` field, workflow `agent()` calls carry no task context. A unified DAG must construct this linkage by correlation (e.g., matching subagent spawns to the turn/step that was working on a task).
