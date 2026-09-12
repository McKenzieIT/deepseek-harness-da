# G23 — Automatic recovery and external-effect reconciliation

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

How should interrupted Attempts resume automatically, and how should the Plan DAG reconcile external effects whose outcome is unknown after a crash, timeout, or lost response?

Define prepared and settled durability, leases, idempotency, target-side CAS or transactions, premise revalidation, approval freshness, executor resume support, reconciliation, operator intervention, and when automatic retry is forbidden.
