# G7 — writeScopes conflict detection for multi-agent parallel work

**Type**: task
**Status**: open
**Blocked by**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Question

Implement the `scopesOverlap` detection logic for `DagTask.writeScopes`, generating warnings when two `in_progress` tasks have overlapping file write scopes.

The field exists in the DagTask model (decided in G1) but detection is deferred to the multi-agent phase. When implemented:
- Reuse the path-prefix overlap algorithm from `agent-team/src/task-board.ts` (~10 lines pure function)
- Generate `writeScopeWarnings` in the task view
- In the DAG visualization, show overlapping tasks with a red warning edge or badge

## Upstream sync risk

**Medium** — if upstream graduates `agent-team` and its `writeScopes` detection becomes available as a stable service, evaluate adopting upstream's implementation rather than maintaining our own. The algorithm is simple enough that duplication is acceptable, but the warning UX should be consistent with whatever upstream provides.
