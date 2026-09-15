# G25 — Data-agent phase-gate integration

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [PG1 Phase-gate session events](../../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)
**Blocks**: —

## Question

How should durable data-agent phases operate as an inner policy of the active Task without competing for outer-loop continuation ownership?

Define Task-to-phase scope, reset, evidence and completion mapping, allowed tools, fallback, clarification, resume, UI projection, and how a phase-terminal result settles or replans the Task.

The first-release baseline is intentionally opaque: one phase-gated execution is one executor-bound Task Attempt that returns a structured clarification request, final outputs/evidence, decline, or failure, while the Task DAG owns none of the phase nodes, counters, timeline, or resume state. The adapter may map a residual ambiguity to a Task Hold without exposing phase-local state. This follow-up must justify the ROI of durable phase events and a reusable inner-policy interface before expanding that boundary.
