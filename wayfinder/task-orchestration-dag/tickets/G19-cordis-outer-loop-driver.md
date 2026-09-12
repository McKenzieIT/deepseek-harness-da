# G19 — Cordis outer-loop driver, verification, and budgets

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md)
**Blocks**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G16 Model tools and preset composition](G16-todo-coexistence-and-preset-composition.md), [G17 Executor adapters](G17-native-source-adapters.md), [G7 writeScopes conflict semantics](G7-writescopes-conflict-detection.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

What bounded outer-loop policy advances the Plan DAG through public Cordis extension points without modifying `agent-loop`?

Define ready selection, atomic claim-and-Attempt admission, concurrent Tasks, explicit same-Task Attempt Groups, task-scoped input, layered-revision checks in `agent/pre-step`, actor permissions, protected-tool enforcement, verifier dispatch, hybrid mechanical/semantic recovery, local repair, replan escalation, human precedence, proposal approval, holds, no-progress detection, persisted budgets, and named Stop Reasons.

Resolve continuation ownership with `goal-round-driver` and phase-gate: one plugin owns automatic continuation, while others contribute inner policy or evidence.
