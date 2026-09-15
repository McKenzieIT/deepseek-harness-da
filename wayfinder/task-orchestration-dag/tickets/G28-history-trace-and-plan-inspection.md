# G28 — History, trace, and plan inspection

**Type**: prototype
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G27 Execution Ledger extraction threshold](G27-execution-ledger-extraction.md)
**Blocks**: —

## Question

What UI should expose Plan revisions, replan diffs, Attempts, verification evidence, and linked executor traces without turning the current-state graph into a full trace explorer?

Prototype current versus history navigation, superseded branches, Attempt drill-down, evidence summaries, time filtering, large-history loading, privacy, and links to executor-owned detail views.

The first release stops at the current-state graph and latest RunStopRecord; it retains history in required Session events but provides no dedicated history/replan-diff/trace navigation. This follow-up owns that UI and must keep executor-owned traces linked rather than copied.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) requires history views to preserve the difference between causal `ExecutionBinding` records, authoritative late results, and non-authoritative `ExecutionObservation` records. The trace UI may correlate native spans, Sessions, and observations for diagnosis, but must not imply that observations or late results authorized work, consumed Task budget, satisfied acceptance criteria, reopened terminal state, or changed Task lifecycle. Attempt retry, Plan mutation provenance, Binding parentage, OutputRefs, EvidenceRecords, ExternalEffects, cancellation requests, and settlement remain separate navigable relations rather than one synthetic parent tree.
