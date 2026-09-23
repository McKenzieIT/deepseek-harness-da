# G34 — Renderer scaling and replacement threshold

**Type**: research
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

Do measured Task DAG Client latency, graph size, accessibility limits, or a concrete second-renderer requirement justify adding performance-specific renderer deltas, worker or off-main-thread layout, or another renderer behind the R5 adapter?

Start only after first-release browser measurements or a required alternate renderer exist. Compare each candidate against view simplification first; record interaction latency, layout and draw time, memory, hidden-tab work, upgrade effort, and maintenance cost. Keep `TaskGraphView`, `TaskGraphDisplayView`, and `TaskGraphScene` semantics stable, and do not add a generic renderer framework without a second implementation.
