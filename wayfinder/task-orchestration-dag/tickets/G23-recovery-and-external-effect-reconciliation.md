# G23 — Automatic recovery and external-effect reconciliation

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

How should interrupted Attempts resume automatically, and how should the Plan DAG reconcile external effects whose outcome is unknown after a crash, timeout, or lost response?

Define prepared and settled durability, leases, idempotency, target-side CAS or transactions, premise revalidation, approval freshness, executor resume support, reconciliation, operator intervention, and when automatic retry is forbidden.

## Inputs from the G13 checkpoint

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) establishes a first-class `ExternalEffectId` that remains stable only while target, canonical request digest, write scope, approval scope, and provider idempotency scope remain unchanged. Each concrete dispatch is still owned by one Attempt Binding. The first release records `pending | confirmed | rejected | unknown`, creates a reconciliation Hold for unknown outcomes, and forbids automatic replay; this ticket owns automated lookup, webhook reconciliation, safe idempotent replay, compensation, target-side fencing, and cross-process recovery.
