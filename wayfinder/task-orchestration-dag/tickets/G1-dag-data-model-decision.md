# G1 — DAG data model decision

**Type**: grilling
**Status**: resolved
**Blocked by**: [R1 agent-team maturity audit](R1-agent-team-maturity-audit.md), [R3 subagent/workflow event surface](R3-subagent-workflow-event-surface.md)
**Blocks**: [G2 DAG panel placement and interaction](G2-dag-panel-placement-and-interaction.md), [G3 preset universality strategy](G3-preset-universality-strategy.md), [G5 dynamic node insertion design](G5-dynamic-node-insertion-design.md)

## Question

What is the unified data model for the DAG visualization? The model must represent three node types (tasks, subagents, workflow runs) and their dependency/containment relationships. Key tensions:

**Option A: Extend TeamTaskBoard**
- Graduate `agent-team` from experimental, add a `nodeType: 'task' | 'subagent' | 'workflow'` discriminator to `TeamTaskSnapshot`.
- Subagent/workflow nodes are "synthetic tasks" injected by their respective lifecycle hooks.
- Pro: single DAG model, single persistence path, cycle detection works across all node types.
- Con: conflates supervision (subagent tree) with dependency (task blockedBy). Forces subagents into the task lifecycle (claim/release/complete).

**Option B: Composite projection**
- Keep `TeamTaskBoard` for task nodes only. Subagent nodes come from `subagent/start`+`subagent/end` events. Workflow nodes come from `workflow/start`+`workflow/end`.
- A new **client-side composite projection** merges the three event streams into a unified `DAGNode[]` for rendering.
- Pro: each domain stays clean. Subagents don't need fake "task" wrappers.
- Con: dependency edges between tasks and subagents require a new linkage mechanism. The "DAG" is partially task-dependency, partially containment — needs clear semantics.

**Option C: New lightweight DAG service**
- A new `ctx.taskGraph` service that aggregates events from todo, subagent, and workflow into a single event-sourced DAG model purpose-built for visualization.
- Pro: clean abstraction, no experimental package graduation needed, designed exactly for the visualization use case.
- Con: more new code, potential duplication with `TeamTaskBoard`.

Which option best serves the destination — and specifically, which prepares the best infrastructure for future dynamic workflows and multi-agent coordination?

## Sub-questions

- Should the DAG enforce that subagent nodes can only be children of the task that spawned them? Or can they be free-floating?
- How do workflow `phase` nodes relate to task nodes — are they children of a workflow run node?
- What happens when the model calls `todo_write` (the flat list tool) — does the DAG projection interpret it, or does a new tool replace `todo_write`?

## Resolution

### Answer: Option B-prime — Terminal state plugin with composite projection

**Neither A, B, nor C as originally stated.** The upstream merge constraint (DSH is in developer preview with frequent upstream merges) eliminates Option A (cannot modify experimental packages) and reframes the entire approach.

The chosen architecture is a **terminal state plugin** that:
1. **Disables `tool-todo`** via `cordis.patch.yml` (`disabled: true`) — proven pattern, used by data-agent and web-app bundles
2. **Registers replacement tools** (`dag_task_create`, `dag_task_update`, `dag_task_get`, `dag_task_list`) via `ctx.tools.register(defineTool({...}))` — identical mechanism to how `tool-todo` works
3. **Defines new session events** (`dag/task-create`, `dag/task-update`, `dag/task-link`, `dag/subagent-linked`, `dag/workflow-linked`) via `declare module` augmentation of `SessionEventMap`, all marked `ignorable: true`
4. **Solves the task↔subagent linkage gap** (R3's key finding) by intercepting `tools/pre-execute` when `exec.name === 'subagent'` or `'workflow'`, correlating with the currently active task
5. **Renders via `ConversationNodeDefinition`** + G6 v5 dagre layout, registered through `ctx.slots.inject('conversation.chat.node', ...)`

**Zero upstream modifications. Fully survivable across upstream merges.**

### Data Model

```typescript
interface DagTask {
  id: string                            // auto-generated stable ID
  revision: number                      // CAS revision for concurrent write safety
  subject: string                       // task title
  description?: string                  // detailed description
  status: 'pending' | 'in_progress' | 'completed'
  blockedBy: string[]                   // dependency task IDs (with cycle detection via DFS)
  ownerId?: string                      // owning session ID (multi-agent ready)
  createdBy?: string                    // creator session ID
  writeScopes?: string[]                // file write scopes (multi-agent conflict detection ready)
  metadata?: Record<string, unknown>    // extensible metadata
}
```

Cycle detection included from day one — reuses the DFS algorithm logic from `agent-team/src/task-graph.ts` (pure function, no external dependencies).

### Node Taxonomy (5 types)

| Node type | Event source | Lifecycle | Phase |
|---|---|---|---|
| **task** | `dag/task-create` + `dag/task-update` | pending → in_progress → completed | Core |
| **team-task** | `team/task` events | pending → in_progress → completed | Future (replaces task when agent-team is composed) |
| **workflow-run** | `tool-workflow/run-start` + `run-end` | running → completed/failed/cancelled | Core |
| **workflow-agent** | `tool-workflow/agent-start` + `agent-end` | running → completed/failed/cancelled | Core |
| **subagent** | `dag/subagent-linked` + `subagent/start`/`end` (Cordis) | running → ended | Core |

### Edge Taxonomy (4 types)

| Edge type | Semantic | Source | Visual |
|---|---|---|---|
| **dependency** | A must complete before B can start | `DagTask.blockedBy[]` | Solid arrow |
| **sequence** | A is ordered before B (intent, not hard constraint) | Task list order | Light thin line |
| **containment** | X contains Y as a component | workflow-run → workflow-agent (`runId`) | Dashed grouping box |
| **spawning** | Parent created child during execution | `dag/subagent-linked`, `dag/workflow-linked` (from `tools/pre-execute` interception) | Animated flowing dashed line |

### State Change Display

**Option Y (node + edge animation)**: Node state changes trigger color transitions + related edges animate (completed path turns green). G6 v5 state styles + `lineDashOffset` marching ants.

**Option Z (global progress wavefront)**: Enhancement ticket, unlocked after Y. Adds `classifyEdge(sourceState, targetState)` returning `completed-path | active-inflow | pending`. ~120-200 lines incremental. Best value in multi-agent parallel scenarios. Y→Z upgrade cost: 1-2 days.

### Correlation Mechanism

The plugin uses **step-level temporal tracking** — within each step, it tracks the sequence of tool calls to correlate subagent/workflow spawns with tasks:

1. When `tools/pre-execute` fires for `dag_task_update` with `status: 'in_progress'` → record `lastActivatedTaskId`
2. When `tools/pre-execute` fires for `exec.name === 'subagent'` → persist `dag/subagent-linked { taskId: lastActivatedTaskId, childId }`
3. When `tools/pre-execute` fires for `exec.name === 'workflow'` → persist `dag/workflow-linked { taskId: lastActivatedTaskId, runId }`
4. On `step/end` → reset `lastActivatedTaskId`
5. Fallback: if no task was recently activated, link to all `in_progress` tasks owned by the agent

Multiple tasks can be `in_progress` simultaneously — this is essential for subagent-driven parallelism. The step-level temporal heuristic ("which task was most recently activated before this subagent spawn") resolves the ambiguity in the vast majority of cases.

**To revisit**: Evaluate correlation accuracy based on real-world usage. If the temporal heuristic proves insufficient, consider explicit task-subagent declaration or richer context tracking.

This solves R3's "no task↔subagent linkage" gap without modifying `SubagentStartRequest`.

### Upstream Relationship

- `tool-todo` is disabled, not deleted — upstream changes to it don't conflict
- New events are `ignorable: true` — older harness versions skip them gracefully
- If upstream evolves `todo_write` to have IDs/dependencies, evaluate and either adopt upstream or continue with plugin
- If upstream graduates `agent-team`, evaluate merging `team/task` events into the projection layer
- All three futures require zero architectural rework — switching is a `cordis.patch.yml` change

### Key Risks

- **`ignorable: true` constraint**: New events must be marked ignorable for persistence compatibility. Safe for task tracking but means these events cannot affect message history reconstruction.
- **content-based diff is temporary**: If the plugin needs to interop with legacy `todo/write` events (during migration), `content` string serves as implicit ID. Risk: model renaming a task text = delete + create. Acceptable short-term, replaced by ID-based model in terminal state.
- **Upstream `todo_write` evolution**: Claude Code has already evolved from flat TodoWrite to structured TaskCreate/TaskUpdate with IDs and dependencies. DSH upstream will likely follow. The plugin architecture accommodates this — tool swap is a patch-layer change.

### Research Context

- **2026 Graph Engineering paper** (arXiv:2608.21156): Supports multi-layer graph model (task organization, agent coordination, runtime state as separate concerns)
- **Industry consensus**: Static skeleton + dynamic routing is the production pattern. LangGraph, Microsoft Conductor, Google ADK 2.0 all converge on explicit graph-based orchestration.
- **No production tool implements Z-level progress wavefront** as of 2026 — Y is industry standard, Z is differentiation opportunity.
- **Microsoft Conductor** is the most complete reference for agent DAG visualization (interactive DAG, animated edges, three-pane layout, sub-workflow breadcrumbs).
