# G27 — Execution Ledger extraction threshold

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G21 Advanced verification and evidence providers](G21-advanced-verification-and-evidence.md), [G23 Automatic recovery and external-effect reconciliation](G23-recovery-and-external-effect-reconciliation.md)
**Blocks**: —

## Question

When should Attempt and evidence history be extracted from the Plan DAG into a separate Execution Ledger capability?

Require a second consumer, independent retention/query requirements, or projection scale. If triggered, define transaction ownership, consistency, event/projection migration, retention, indexing, API stability, and failure reconciliation without splitting one commit across two authorities.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) keeps Attempts, Bindings, Observations, OutputRefs, EvidenceRecords, ExternalEffects, command idempotency, and late-result records inside the Plan DAG authority for the first release. Their identities and relations must remain usable if this ticket later extracts storage or query ownership, but extraction must not split atomic admission or Attempt settlement across authorities. Flush batching is an internal optimization under the durability-watermark requirement and does not by itself justify an Execution Ledger.
