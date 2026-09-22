# G16 cross-preset and phase-gate consistency audit

**Date**: 2026-09-17

## Scope

This audit compares the current map, resolved Task DAG tickets, and the data-agent phase-gate experiment history after G16 repeated a question already resolved by G3 and incorrectly treated Task DAG as a possible preset.

Reviewed sources:

- [G3 Preset-orthogonal Task DAG distribution](../tickets/G3-preset-universality-strategy.md)
- [G12 Plan DAG ownership boundary](../tickets/G12-task-graph-authority.md)
- [G19 Cordis outer-loop driver](../tickets/G19-cordis-outer-loop-driver.md)
- [G16 Model tools and cross-preset composition](../tickets/G16-todo-coexistence-and-preset-composition.md)
- [G17 Executor adapters](../tickets/G17-native-source-adapters.md)
- [G25 Data-agent inner orchestration after Task DAG](../tickets/G25-phase-gate-integration.md)
- [Data-agent G1 pipeline versus planning experiment](../../data-agent/tickets/phase-misc/G1-pipeline-vs-goal-todo.md)
- [Data-agent G1b experiment execution](../../data-agent/tickets/phase-misc/G1b-experiment-execution.md)
- [P7 four-phase design](../../data-agent/tickets/phase-3/P7-four-phase-preset.md)
- [P7b phase-gate implementation](../../data-agent/tickets/phase-3/P7b-phase-gate-hardening.md)
- [PG1 phase-gate durable-state evaluation](../../data-agent/tickets/phase-misc/PG1-phase-gate-session-events.md)

## Findings

### Task DAG distribution was already decided

G3 resolved Task DAG as an independent Bundle-level capability available across presets with no derived presets and no preset patches. G16's abandoned Q9 repeated that decision and introduced an unsupported assumption that Task DAG might occupy a preset or require a separate orchestrator Agent.

The current model is preset-orthogonal: one Session still selects one business preset, while the installed Task DAG capability contributes Host services, Agent-scoped behavior, model tools, and Client UI across those presets.

### G3 retained obsolete mechanisms beside its valid decision

G3's Bundle and cross-preset conclusions remain valid. Its terminal-state tool, `dag/*` Session events, host-level `tools.restrict()`, and phase-node assumptions do not. G14 replaced Task DAG persistence with an independent SQLite journal, projection, outbox, and Host Bindings. G16 owns current planning-tool coexistence. G12 excludes phases from the Task model.

### No decision-quality evidence selects phase-gate as the long-term data-agent architecture

Data-agent G1 designed a 2×2 experiment comparing phase-gate on/off and Goal/Todo planning on/off. G1b completed the model-capability comparison and implemented the full Agent responder. Ignored A/B/D result files survive on the originating machine, but the arms use different tool catalogs and planning capabilities, the outer result records omit the Agent's real query outcome, and no reviewable Evidence Cut or ship-default verdict was committed. [G25a Phase-gate incremental-value experiment](../tickets/G25a-phase-gate-incremental-value-experiment.md) replaces that confounded comparison with equal tool catalogs and direct Session evidence.

P7 and P7b prove that the current phase-gate implementation works against its own protocol. They do not prove that its state machine remains necessary once Task DAG supplies planning, continuation, Holds, budgets, verification, and replanning.

### G12 and G19 made only a conditional compatibility decision

G12 establishes that phases are not Tasks and executor internals remain separately owned. G19 establishes one Task DAG outer-loop owner. Their useful first-release rule is conditional: if the existing phase-gated runtime is the cheapest data-agent executor, adapt one complete phase run as one opaque Attempt. Neither ticket needs phase-gate to remain permanently.

### G25 and PG1 had their dependency reversed

G25 previously assumed durable phase-gate integration and depended on PG1 phase events. That ordering spends design effort before deciding whether the state machine survives. G25 must first decide retention, decomposition, or retirement. PG1 becomes conditional work only if G25 retains durable phase state and proves its user value.

### Task DAG tool visibility is not owned by phase-gate

Task DAG orchestration tools are cross-preset capability tools. A data-agent inner policy may restrict data-execution tools for its current phase, but cannot hide or authorize Task DAG planning tools. G16 still needs a generic composition rule that preserves both constraints without copying presets or allowing one plugin to re-add tools another policy intentionally denied.

## Canonical current model

- Task DAG is a generic Cordis capability installed through a Bundle, not a preset.
- One Session selects one business preset; Task DAG applies orthogonally.
- Task DAG owns planning, cross-turn continuation, Attempts, Holds, budgets, verification, and replanning while active.
- Presets and executor adapters retain their business capabilities and internal lifecycles.
- Phase-gate is an existing data-agent implementation candidate, not a Task DAG dependency or accepted long-term requirement.
- The first release may wrap the current phase-gated runtime opaquely for compatibility, but phase records and phase UI are not Task DAG requirements.
- G25 owns the evidence-backed keep, decompose, or retire decision; PG1 is conditional on retaining durable phase state.

## Applied corrections

- Strengthened G3's current resolution and removed its obsolete implementation assumptions.
- Reframed G16 around generic cross-preset composition and coalesced repeated or corrected discussion into current decisions.
- Made G12, G19, G17, and the G19 ROI audit conditional about phase-gate.
- Reframed G25 around retention, decomposition, or retirement before integration design.
- Reversed the G25/PG1 dependency and removed Task DAG phase-node and tool-whitelist assumptions from PG1.
- Marked data-agent G1/G1b evidence as incomplete for the phase-gate decision.
