# G26 — Goal and Plan DAG relationship

**Type**: grilling
**Status**: open
**Current standing**: [Model tools and cross-preset composition](G16-todo-coexistence-and-preset-composition.md#confirmed-first-release-planner-scope) limits the first release to a single selected planner in a fresh Session. [Native planner same-Session handoff](G40-native-planner-session-handoff.md) owns deferred control transfer; this ticket retains richer Goal objective and lifecycle integration and does not decide the handoff protocol.
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

What relationship should DSH Goal have to a writable Plan DAG while preserving one automatic continuation owner per Agent?

Compare Goal as the user objective referenced by Runs, Goal completion derived from required terminal Tasks, and independent lifecycles. Define activation, pause, cancellation, blockers, budgets, resume, replacement, and whether goal-round-driver delegates to or is replaced by the task-graph driver in composed profiles.

The first-release single-owner rule remains fixed: while Task DAG holds planning control, its driver is the sole cross-turn continuation owner and upstream `goal-round-driver` cannot concurrently advance work; any retained executor-local policy remains inside an Attempt; deployments without Task DAG retain the upstream Goal driver unchanged. Fresh-Session selection is the first-release scope; later reversible transfer belongs to [Native planner same-Session handoff](G40-native-planner-session-handoff.md). This ticket may reopen richer Goal/Plan integration only after first-release evidence identifies a real user benefit and second continuation-policy consumer. It must not silently remount two automatic drivers. Any coexistence requires an explicit ownership protocol, measured ROI, profile migration, and tests for inbox competition, pause/resume, revision fencing, budgets, Holds, and Stop Reasons.
