# PG1 — Phase-gate durable-state evaluation

**Type**: grilling
**Status**: resolved 2026-09-22
**Current standing**: [G25 Data-agent inner orchestration after Task DAG](../../../task-orchestration-dag/tickets/G25-phase-gate-integration.md) excludes the complete phase state machine from the target architecture. This ticket closes without adding durable phase events, a phase projection, phase resume state, phase nodes, or phase UI. The existing phase-gate may remain temporarily only inside an opaque v1 compatibility executor.
**Blocked by**: [G25 Data-agent inner orchestration after Task DAG](../../../task-orchestration-dag/tickets/G25-phase-gate-integration.md) ✅
**Blocks**: —

## Resolution

Task DAG owns durable Plan and execution-control state in its own journal. DSH Session records the exact model and tool transcript, while executor adapters correlate native execution with an Attempt. Neither store receives authoritative phase state.

The target data-agent executor uses the ordinary Agent loop with private grounding, query-admission, and evidence-validation contributions. Those contributions are stateless across Task DAG continuation except for the existing Session and adapter facts required by their own operations; they do not introduce phase identity or phase-owned resume.

The first release may wrap the current phase-gate behind an opaque compatibility executor, but its phase index, counters, fallback state, control markers, and tool whitelist remain adapter-private and non-authoritative. Removing that executor requires no Task DAG or Session format migration because no new durable phase records are introduced.

## Rejected additions

- `phase/advance`, `phase/fallback`, `phase/decline`, or `phase/clarify` Session events for Task DAG integration.
- A `phaseState` Session projection.
- Phase nodes or edges in the Task DAG.
- A dedicated phase progress UI.
- Replacement of preset-orthogonal Task DAG tools through a phase whitelist.
- Speculative support for nonlinear or resumable phase pipelines.

## Historical input

The original ticket assumed that phase-gate would remain, that Task DAG required phase nodes, and that the phase whitelist should replace Todo with `dag_task_*` tools. G12, G14, G19, G25, and G16 supersede those assumptions: phases are not Tasks, Task DAG uses its own journal, the target data-agent path uses split policy and validators, and Task DAG tools are preset-orthogonal.

The existing research remains an inventory of the current phase-gate's in-memory state and restart limitations: [Phase-gate session events research](../../research/phase-gate-session-events.md).
