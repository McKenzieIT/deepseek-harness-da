# G28 — History, trace, and plan inspection

**Type**: prototype
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G27 Execution Ledger extraction threshold](G27-execution-ledger-extraction.md)
**Blocks**: —

## Question

What UI should expose Plan revisions, replan diffs, Attempts, verification evidence, and linked executor traces without turning the current-state graph into a full trace explorer?

Prototype current versus history navigation, superseded branches, Attempt drill-down, evidence summaries, time filtering, large-history loading, privacy, and links to executor-owned detail views.

The first release stops at the current-state graph and latest RunStopRecord; the Task DAG journal retains history but provides no dedicated history, replan-diff, or trace navigation. This follow-up owns that UI and must keep executor-owned traces linked rather than copied.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) requires history views to preserve the difference between causal `ExecutionBinding` records, authoritative late results, and non-authoritative `ExecutionObservation` records. The trace UI may correlate native spans, Sessions, and observations for diagnosis, but must not imply that observations or late results authorized work, consumed Task budget, satisfied acceptance criteria, reopened terminal state, or changed Task lifecycle. Attempt retry, Plan mutation provenance, Binding parentage, OutputRefs, EvidenceRecords, ExternalEffects, cancellation requests, and settlement remain separate navigable relations rather than one synthetic parent tree.

## Inputs from the G15 resolution

The current Task DAG page has one stable identity per DSH Session and follows that Session's active `PlanRunId`. History must not overload that page's parameters or replace its current value. Prototype a separate resource-addressed tab type whose content identity includes `PlanRunId`, or a later aggregate view when several Runs must be compared; both consume Task DAG history without turning the current page into a trace explorer.

## Inputs from the G7 resolution

The current projection exposes only present write intent, reservation state, safe scope summaries, waiting owners, quarantine, and protection level. This ticket owns historical reservation timelines, contention analysis, manual-resolution evidence, and links to executor-native lock or job detail without copying provider traces or exposing canonical credentials and native references.
