# G6 — infrastructure contracts for dynamic workflows and multi-agent coordination

**Type**: grilling
**Status**: open
**Blocked by**: [G1 DAG data model decision](G1-dag-data-model-decision.md) ✅, [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)
**Blocks**: [G7 writeScopes conflict detection](G7-writescopes-conflict-detection.md), [G9 team-task integration](G9-team-task-upstream-integration.md), [G10 subagent tree integration](G10-subagent-tree-upstream-integration.md)

## Context from G1

G1 decided: the plugin owns its own event vocabulary (`dag/*` events, `ignorable: true`), DagTask data model (with ID, revision, blockedBy, ownerId, writeScopes), and correlation mechanism (`tools/pre-execute` interception). The architecture is a terminal state plugin that survives upstream merges.

The infra contracts question shifts from "what API does TeamTaskBoard expose" to "what extension points does the DAG plugin expose for future consumers."

## Question

What concrete interfaces, events, and extension points must the DAG plugin expose so that future systems (multi-agent coordination, data-agent planning, dynamic workflow orchestration) can plug into it?

**Sub-questions (refined by G1):**

1. **Session event contracts**: The `dag/*` events are the plugin's public API. Which events should be considered stable contracts that future consumers can depend on?
   - `dag/task-create`, `dag/task-update` — task lifecycle (stable)
   - `dag/subagent-linked`, `dag/workflow-linked` — correlation (stable)
   - Internal events for visualization state — not stable, not for external consumption

2. **Tool API stability**: The `dag_task_create`, `dag_task_update` tool schemas are model-facing. They should be designed for stability since system prompts and agent behaviors will depend on them.

3. **Multi-agent extension point**: When multi-agent coordination arrives, agents need to:
   - Create tasks for each other (`ownerId` field is ready)
   - Declare file write scopes (`writeScopes` field is ready)
   - Detect conflicts (writeScopes overlap detection — separate ticket G7)
   - What additional contracts are needed? A cross-session event bus? A shared task store?

4. **Data-agent planning integration**: If a data-agent wants to emit a DAG of sub-tasks (e.g., "query A → join B → aggregate"), should it use the `dag_task_create` tool directly, or should there be a programmatic API (`ctx.dagTasks.create(...)`) for non-model callers?

5. **Visualization extension points**: Can future plugins add new node types without modifying the DAG plugin? A node-type registry with custom renderers registered via slots?

## Design principle

Minimal and stable — expose the smallest API that enables known future use cases. The `ignorable: true` constraint means all `dag/*` events are inherently non-breaking for older consumers. New event types can be added without versioning concerns.

## Upstream merge risk

Low for event contracts — they're our own namespace. Medium for tool API — if upstream introduces a competing structured task tool, we'll need to evaluate merging.
