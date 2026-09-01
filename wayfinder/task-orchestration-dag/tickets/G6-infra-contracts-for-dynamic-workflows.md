# G6 — infrastructure contracts for dynamic workflows and multi-agent coordination

**Type**: grilling
**Status**: open
**Blocked by**: [G1 DAG data model decision](G1-dag-data-model-decision.md), [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)
**Blocks**: —

## Question

The destination explicitly calls for "preparing infrastructure for dynamic workflows and multi-agent coordination." What concrete interfaces, events, and service contracts must the DAG system expose so that future systems can plug into it?

**Sub-questions:**

1. **DAG mutation API**: What public API does the DAG service expose for future consumers?
   - A future "dynamic workflow engine" that declares a DAG of tasks and expects the system to execute them in dependency order.
   - A future "multi-agent coordinator" that assigns tasks to agents and needs to update task ownership and status.
   - Should this API be the same `TeamTaskBoard` API (create/update/claim/complete), or a higher-level orchestration API?

2. **Event bus contracts**: What events should the DAG system emit that future consumers can subscribe to?
   - `dag/node-added`, `dag/node-status-changed`, `dag/edge-added`?
   - Should these be session-persisted events (durable, replayable) or runtime-only (ephemeral)?

3. **Visualization extension points**: How can future plugins add new node types to the DAG graph without modifying the core visualization?
   - A node-type registry with custom renderers?
   - A slot-like system for graph node shapes?

4. **dsh-data-agent planning integration**: The data-agent's phase-gate currently controls tool access per phase. If a future version wants the data-agent to plan its own DAG of sub-tasks (e.g., "query table A, then join with B, then aggregate"), what interface would it use to emit that plan into the DAG visualization?

5. **Cross-agent DAG visibility**: In a multi-agent team, should each agent see only its own tasks, or the full team DAG? What access control model applies?

## Design principle

The contracts should be **minimal and stable** — expose the smallest API that enables the known future use cases without over-engineering. Better to add a method later than to ship a bloated contract that creates coupling.
