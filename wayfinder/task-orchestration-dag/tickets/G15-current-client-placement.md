# G15 — Current client placement for task orchestration

**Type**: prototype
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md)
**Blocks**: [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md), [G4 Animation and edge design](G4-animation-and-edge-design.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

Which public DSH client slots should host the compact summary, normal graph, and larger inspection view?

Prototype `conversation.input.dock` with a session-owned right-sidebar tab/fullscreen view, a global sidebar/main panel, and a deliberate hybrid. Retain G2 interaction goals without patching upstream layout or using a root overlay as a window system. Verify session ownership, focus, keyboard behavior, narrow layouts, remount recovery, and explanation of ready, blocked, attempts, verification, and replan states.

The first release is current-state only: current Tasks, Attempts, Holds, portable budgets, verification, and the latest RunStopRecord. It does not build Plan/replan/stop history navigation or a trace explorer; those remain in G28 even though the Task DAG journal retains the facts. Human controls reuse existing Queue/Steer/Cancel UI, and explicit BTW may ship only by reusing an existing one-shot fork with empty tool authority rather than adding a new Session subsystem.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) requires the Client to distinguish authoritative execution from observation: show one primary Binding per Attempt with expandable child Bindings, present OutputRefs separately from EvidenceRecords, expose Binding dispatch state, cancellation progress, late-result status, external-effect certainty, and reconciliation Holds, and render observational links with a visibly non-authoritative treatment. Client state must not promote an Observation, infer completion, or collapse cancellation requests, executor outcomes, verification, and Task lifecycle into one status. A late result may be offered for explicit reuse but never appears as automatic Task progress.

## Inputs from the G14 resolution

The Client resolves the active `PlanRunId` from the current DSH Session through the Host Binding adapter, then consumes the Task DAG package's own `snapshot + watch` Remote. It does not use `useProjection('taskGraph')`, replay Session events, or receive outbox payloads and secret-bearing native references. The view exposes safe renderer-neutral current values and an explicit unavailable state; React owns presentation state only.
