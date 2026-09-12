# G13 — ExecutionAttempt and correlation protocol

**Type**: grilling
**Status**: open
**Blocked by**: [G12 Plan DAG ownership boundary](G12-task-graph-authority.md) ✅
**Blocks**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G17 Executor adapters](G17-native-source-adapters.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)

## Question

How does one Task ExecutionAttempt bind durably to the current Agent, tool calls, skills, subagent runs, workflow runs, output references, verification evidence, and external effects?

Under G12, admission atomically creates a claim and Attempt; Task, Attempt, and Plan revisions are layered; a Task defaults to one active Attempt but may declare an Attempt Group. Define branded identities, admission and settlement commit points, concrete executor binding, actor authority, parent/child Attempts, group membership, retry numbering, output and evidence references, cancellation, interruption, unknown external outcomes, and the difference between causal correlation and observational inference.

Native subagent lineage and workflow membership do not prove Task causality. A heuristic may enrich display only when marked non-authoritative; it must never authorize execution or completion.
