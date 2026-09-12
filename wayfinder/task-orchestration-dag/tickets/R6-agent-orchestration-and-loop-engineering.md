# R6 — Agent orchestration and loop-engineering research

**Type**: research
**Status**: resolved 2026-09-12
**Blocked by**: —
**Blocks**: [G12 Plan DAG ownership boundary](G12-task-graph-authority.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

What should a writable task-orchestration DAG own after comparing current industry practice and relevant 2026 H2 research?

## Resolution

See [R6 Agent orchestration and loop-engineering research](../research/R6-agent-orchestration-and-loop-engineering.md).

The data-agent requires a writable Plan DAG, separate ExecutionAttempts, evidence-based completion, bounded continuation, explicit stop and budget state, and local repair before global replanning. Workflow, subagent, skill, tool, and trace lifecycles remain separately owned.
