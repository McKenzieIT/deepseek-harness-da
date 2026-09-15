# G14 — Durable events, projection, and Host/Client boundary

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) ✅, [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G15 Current client placement](G15-current-client-placement.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md), [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md)

## Question

What required session events and Host projection preserve the Plan DAG without client-side replay or duplicate authorities?

Define event granularity, complete post-change values, schemas, projection key and `stateVersion`, mutation serialization, append-and-flush commit, and replay for Plan Runs, proposed and committed revisions, Tasks, Attempts and groups, layered revisions, holds, budgets, Stop Reasons, completion proposals, assurance verdicts, output references, and interrupted attempts. Also define bounded history, renderer-neutral wire values, SDK projection, and snapshot coverage.

React reads the normal projection and owns only selection, zoom, filters, disclosure, and renderer lifecycle. Authoritative events are required-on-read.

Holds remain the authoritative admission barriers and carry release condition, release authority, and automatic/explicit resume mode. The driver records each transition from runnable to quiescent as an append-only `RunStopRecord` with one core stop code plus references to every contributing Hold, Task, or Attempt; it does not create a second active blocker state. Resume appends a record linked to the stop record after all current blockers and revisions are rechecked. Define the minimal closed first-release stop-code taxonomy, projection of the current stop and history, client localization, and replay behavior without allowing plugin-specific opaque codes to bypass compatibility.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) requires the projection to keep `ExecutionAttempt`, authoritative `ExecutionBinding`, non-authoritative `ExecutionObservation`, `OutputRef`, `EvidenceRecord`, control requests, late results, and `ExternalEffect` as distinguishable values. Each ordinary Attempt has one primary Binding; Binding phase is `dispatching | running | settled`, while Attempt phase and outcome remain separate. The projection preserves branded identities, Task-level `attemptNo`, `retryOfAttemptId`, Claim generation, Plan mutation provenance, reserved Attempt Group identity, Binding parentage, typed native references, command idempotency, and durability watermarks. Attempt settlement atomically releases the Claim and creates completion or failure facts; observations and late results cannot authorize settlement, and external-effect certainty may converge after settlement without reopening terminal Task state.

## Inputs from the G19 resolution

The event and projection design must distinguish executor-owned semantic grounding from Task Graph authority. For a data-agent Attempt it records the selected data scope and stable metric/concept definition references or content digests that affected model input, plus a correlated clarification request when multiple valid meanings remain; it does not copy the semantic layer or Ontology graph. It also persists `onNoProgress`, replan-budget reservation and consumption, the Run-scoped context reference for an automatic affected-subgraph replan, and the resulting Hold or Plan revision.
