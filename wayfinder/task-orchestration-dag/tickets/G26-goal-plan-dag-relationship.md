# G26 — Goal and Plan DAG relationship

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

What relationship should DSH Goal have to a writable Plan DAG while preserving one automatic continuation owner per Agent?

Compare Goal as the user objective referenced by Runs, Goal completion derived from required terminal Tasks, and independent lifecycles. Define activation, pause, cancellation, blockers, budgets, resume, replacement, and whether goal-round-driver delegates to or is replaced by the task-graph driver in composed profiles.

The first-release baseline from the outer-loop decision is fixed: while the generic Task DAG capability is active, Bundle composition disables upstream `goal-round-driver`; the Task DAG driver is the sole cross-turn continuation owner; any retained executor-local policy remains inside an Attempt; deployments without Task DAG retain the upstream Goal driver unchanged. This follow-up may reopen Goal/Plan integration only after first-release evidence identifies a real user benefit and second continuation-policy consumer. It must not silently remount two automatic drivers. Any coexistence requires an explicit ownership protocol, measured ROI, profile migration, and tests for inbox competition, pause/resume, revision fencing, budgets, Holds, and Stop Reasons.
