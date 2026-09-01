# wayfinder:map — task-orchestration-dag

> local markdown tracker (wayfinder skill default). Sub-tickets in `tickets/`, research notes in `research/`. This map is an **index**, not storage — decision details live in their ticket / research note.

## Destination

A DAG-based task orchestration visualization system that upgrades the current flat `TodoItem` list into a rich, interactive graph. The system:

1. **Replaces the flat TodoPanel** with a collapsible sidebar DAG graph showing task nodes, their dependencies, and execution flow with animated flowing dashed lines between nodes.
2. **Integrates subagent and workflow nodes** into the same DAG — when subagents are spawned or new tasks are added mid-session, their nodes animate into the graph in real time.
3. **Works across all presets** — available wherever task orchestration is composed (standard, code, cordis, data-agent variants B/C, and future presets).
4. **Builds on the experimental agent-team DAG backend** (`TeamTaskBoard` with `blockedBy[]`, cycle detection, ownership) as the data model foundation, graduating it from experimental status.
5. **Prepares infrastructure** for dynamic multi-agent workflows — the DAG model and visualization provide the substrate on which future workflow DAGs, multi-agent coordination graphs, and dsh-data-agent's phase-aware planning can render.

The map is done when: every architectural decision is locked (data model, UI placement, rendering approach, preset integration, infra contracts), a spec exists for each component, and the work is ready to hand off to implementation sessions.

## Notes

- **Domain**: DSH plugin architecture (Cordis services, tools, session projections, slot-based UI)
- **Skills to consult**: `/dsh-plugin-development`, `/domain-modeling`, `/grilling`, `/prototype`
- **Key packages**:
  - `packages/todo/tool-todo/` — current flat todo system (`TodoItem { content, status }`)
  - `packages/experimental/agent-team/` — DAG backend (`TeamTaskBoard`, `TeamTaskSnapshot` with `blockedBy[]`)
  - `packages/client/ui-context-layer/` — existing G6 v5 graph component with animations
  - `packages/client/ui-conversation/src/client/skeleton/TodoPanel.tsx` — current flat TodoPanel/TodoDock
  - `packages/client/ui-workflow-run/` — current workflow run panel (linear list, not DAG)
  - `packages/client/ui-layout/src/client/AppFrame.tsx` — three-column layout with sidebar/center/details
  - `packages/client/ui-slots/` — slot registry framework
  - `packages/preset/agent-presets/` — preset discovery and composition
  - `packages/subagent/subagent/` — `ctx.subagents` service with `listDescendants()`
  - `packages/workflow/workflow/` — `ctx.workflowEngine` service with lifecycle events
- **Standing principles**:
  - The DAG visualization is a **client-side rendering concern** backed by session projections — the server-side data model emits events, the client folds and renders.
  - Backward compatibility: the `todo_write` tool must remain functional for presets/models that don't compose the DAG UI.
  - The `agent-team` package's `TeamTaskBoard` is the most mature DAG model in the codebase — evaluate adoption before designing from scratch.
  - G6 v5 is already a project dependency with proven animation support — strongly prefer it over introducing a new graph library.
  - The user wants the panel to be **sidebar-positioned, click-to-expand/collapse** (not inline in the conversation or in the details column).

## Ticket frontier

```
[✓] R1 agent-team maturity audit ──────┐
[✓] R3 subagent/workflow event surface ─┤
                                        ├──▶ G1 DAG data model decision ──┬──▶ G3 preset universality
                                        │                                 │
[✓] R2 G6 dagre layout feasibility ────┼──▶ G2 DAG panel placement ──────┼──▶ G4 animation & edge design
                                        │                                 │
                                        └─────────────────────────────────┼──▶ G5 dynamic node insertion
                                                                          │
                                                                          └──▶ G6 infra contracts
```

**Frontier (unblocked, open):** G1 (all blockers resolved), G2 (R2 resolved, still blocked by G1)
**Blocked:** G2 (by G1), G3 (by G1), G4 (by G2), G5 (by G1), G6 (by G1, G5)
**Next ticket to resolve:** G1 — the keystone decision that unblocks 4 downstream tickets.

## Decisions so far

- [R1 agent-team maturity audit](research/R1-agent-team-maturity-audit.md) — package is architecturally solid (CAS, cycle detection, persistence); gaps for visualization (no node type, no timestamps, no display metadata) are solvable via `TeamTaskView` enrichment pattern; graduation requires accepting 4 event types as stable contracts.
- [R2 G6 dagre layout feasibility](research/R2-g6-dagre-layout-feasibility.md) — G6 v5.1.1 natively supports `antv-dagre` layout, `lineDashOffset` animation, and incremental layout via preset mechanism; no reason to build separate SVG+dagre stack.
- [R3 subagent/workflow event surface](research/R3-subagent-workflow-event-surface.md) — workflow events are well-persisted (4 `tool-workflow/*` types); subagent events are ephemeral in parent; **no task↔subagent linkage exists** — primary gap requiring a new correlation mechanism.

## Not yet specified

- **Data-agent phase-gate integration**: The data-agent's four-phase pipeline (`dsh-phase-gate`) is an implicit DAG (Understanding → Generation → Execution → Interpretation). How/whether to surface phase-gate progression as DAG nodes is unclear until the core DAG model and visualization are decided.
- **Goal-round-driver integration**: Goals have a linear phase state machine. Whether goal progression should appear in the DAG, and how, depends on the node taxonomy decision.
- **Cross-session DAG persistence**: Whether the DAG state survives session boundaries (e.g., for durable goals that span sessions) depends on the data model decision and agent-team's persistence story.
- **dsh-data-agent DAG-aware planning**: The idea that data-agent can follow DAG task planning to generate Agents is downstream of the data model and preset integration decisions — can't specify until those are locked.

## Out of scope

- **Implementing the full multi-agent coordination protocol** — this map delivers the DAG visualization and data model infrastructure; the actual multi-agent negotiation, consensus, and dynamic workflow execution are future work that builds on what this map produces.
- **Rewriting the workflow engine** — the imperative `parallel()`/`pipeline()` JS script model stays; we add DAG visualization of its execution, not a declarative DAG-first workflow engine.
- **Mobile / responsive layout** — the three-column AppFrame's existing concession chain handles narrow viewports; the DAG panel follows the same rules, but mobile-specific optimization is out of scope.
