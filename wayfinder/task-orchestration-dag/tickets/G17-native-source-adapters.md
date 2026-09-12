# G17 — Executor adapters

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G9 Optional Agent Teams adapter](G9-team-task-upstream-integration.md), [G10 Subagent execution adapter](G10-subagent-tree-upstream-integration.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

How does an Attempt execute through the current Agent, a skill, subagent, workflow, ordinary tools, manual work, or data-agent phase policy without copying those capabilities' state machines?

For each executor, define capability matching, concrete binding, native concurrency, Attempt Group participation, dispatch, causal correlation, cancellation, outcome settlement, named output and evidence mapping, recovery coverage, and missing-data behavior. Skills are execution methods, not Task instances. Native subagent catalogs and workflow events remain authoritative for their internal lifecycle.
