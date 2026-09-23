# R4 — Upstream 0.1.5 architecture rebaseline

**Type**: research
**Status**: resolved 2026-09-12
**Current standing**: the upstream capability inventory remains valid as DSH adapter input. [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md) supersedes Task Graph authority in DSH Session events or `sessionProjections`; the journal-backed Task DAG core and projection are independent of DSH.
**Blocked by**: —
**Blocks**: —

## Question

Against current upstream DSH, which assumptions in the historical map remain valid and which must be reopened?

## Resolution

See [R4 Upstream 0.1.5 architecture rebaseline](../research/R4-upstream-0.1.5-architecture-rebaseline.md).

Current upstream supplies Host session projections, published experimental Team tasks, durable subagent catalogs, durable workflow records, and current Client panel contracts. Historical client replay, all-ignorable events, host-level Todo restriction, heuristic task correlation, and custom layout ownership are not implementation-ready.
