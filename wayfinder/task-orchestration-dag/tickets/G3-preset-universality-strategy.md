# G3 — preset universality strategy

**Type**: grilling
**Status**: open
**Blocked by**: [R1 agent-team maturity audit](R1-agent-team-maturity-audit.md), [G1 DAG data model decision](G1-dag-data-model-decision.md)
**Blocks**: —

## Question

How does the DAG visualization become available across all presets without forcing every preset to adopt the full `agent-team` stack?

**Current preset landscape:**

| Preset | todo | goal | subagents | workflows | phase-gate |
|--------|------|------|-----------|-----------|------------|
| standard | ✓ | ✓ | ✓ | ✓ | — |
| code | ✓ | ✓ | ✓ | ✓ | — |
| minimal | — | — | — | — | — |
| cordis | ✓ | ✓ | ✓ | ✓ | — |
| data-agent (A) | — | — | — | — | ✓ |
| data-agent (B/C) | ✓ | ✓ | — | — | ✓/— |
| semantic-layer-mgmt | — | ✓ | — | — | — |

**Sub-questions:**

1. **Composition granularity**: Should the DAG visualization be a single plugin row (e.g., `dsh-task-dag`) that auto-discovers whatever orchestration plugins are present? Or should it be a family of composable rows (dag-core + dag-todo-adapter + dag-subagent-adapter + dag-workflow-adapter)?

2. **Data-agent phase-gate**: The data-agent's four-phase pipeline is implicitly a DAG (Understanding → Generation → Execution → Interpretation). Should `dsh-phase-gate` emit events that the DAG visualization can consume? This would let data-agent sessions show their phase progression as a graph.

3. **Minimal preset**: The minimal preset has no orchestration at all. Should it be excluded from DAG visualization, or should even a minimal session show its tool calls as a simple timeline graph?

4. **Client-side vs. server-side composition**: The DAG panel is a client UI component. Should it register conditionally based on which server-side services are available? Or always register and gracefully show nothing when there's no task data?

5. **Backward compatibility**: The `todo_write` tool is used by many LLM system prompts. If the data model changes, what adapter ensures old-style `todo_write` calls still work?
