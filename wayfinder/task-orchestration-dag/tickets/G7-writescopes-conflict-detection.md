# G7 — writeScopes conflict semantics

**Type**: grilling
**Status**: open
**Blocked by**: [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: —

## Question

What guarantee does `writeScopes` provide to the scheduler: advisory warning, admission rule for known executors, or separate filesystem enforcement?

Define normalization, overlap, unknown scopes, concurrent Attempts, current-Agent versus delegated execution, and UI wording. Do not imply protection against uninstrumented writers unless a real enforcement provider owns that path.

## Inputs from the G14 resolution

`writeScopes` belongs to the Host-neutral Task DAG Task/Attempt protocol. DSH-specific path, tool, workflow, or external-system enforcement is supplied by executor adapters; the core stores normalized declared scopes and admission facts without importing DSH types. SQLite commit serializes admission decisions, while native enforcement and observations remain adapter-owned.
