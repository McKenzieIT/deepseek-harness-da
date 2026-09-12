# wayfinder:map — task-orchestration-dag

> Local Markdown tracker. Tickets live in `tickets/`; research notes live in `research/`. This map indexes decisions and does not restate their detail.

## Destination

An implementation-ready specification for a community-installable DSH Cordis plugin suite that gives data-agent a writable, durable Plan DAG. The LLM can create and revise tasks and dependencies; an outer-loop policy advances ready work through the current Agent, skills, subagents, workflows, or tools; verification controls completion; and a UI shows current, subsequent, blocked, failed, and completed work.

The suite must mount beside upstream packages, use documented DSH services, events, projections, Remotes, and UI slots, and require no upstream source modification or replacement of `agent-loop`. The map is complete when the domain model, attempts and correlation, loop policy, persistence, tools and presets, executor adapters, UI, renderer, community package and bundle topology, compatibility policy, and first-release evaluation are specified for implementation, and every deliberately deferred full-version capability has a named follow-up ticket.

## Notes

- **Domain**: writable task planning, bounded outer-loop control, DSH plugin composition, session persistence and projections, executor adapters, and graph presentation.
- **Skills**: `/dsh-plugin-development`, `/domain-modeling`, `/grilling`, `/prototype`, and `/research`.
- **Planning only**: this map resolves decisions and produces implementation specifications; it does not implement product packages.
- **Upstream baseline**: `upstream/master@c291e7961a515f6d7af9304e7fd1d257929aef26` and `dsh-v0.1.5-rc.2@fb2c4b9e698e30edb738bca4cf0618587db7d203`, dated 2026-09-10.
- **Writable Plan DAG is required**: the feature is not a read-only graph. It owns Plan Runs, tasks, hard dependencies, revisions, readiness, task state, replanning, attempts, verification, budgets, holds, stop records, and explicit execution correlations.
- **Executor ownership remains separate**: workflow, subagent, skill, tool, phase, Goal, and trace capabilities retain their internal lifecycles. Adapters link them to task attempts without copying their state machines.
- **Cordis-only integration**: no upstream package source changes, no imports from `agent-loop` implementation files, and no fork UI/core patch retained solely for this feature. Contributions use reversible effects and public services, events, projections, Remotes, bundle or preset composition, and UI slots.
- **One outer-loop owner**: task-graph driver, goal-round-driver, and phase-gate cannot independently schedule continuation for the same Agent. Composition must choose an owner and define inner policies explicitly.
- **Host/Client ownership**: Host services own validation, events, replay, verification, budgets, and projections. React owns only presentation state and renderer lifecycle.
- **Concurrency is preserved**: the plugin does not impose a fixed subagent or workflow limit. Concurrent tasks and explicit same-task Attempt Groups are admitted when dependencies, claims, policy, resources, and installed DSH providers permit them.
- **Commitment policy**: a Plan may cover the full objective, while execution admits one task or one explicit bounded group at a time. Local retry or affected-subgraph repair precedes global replanning.
- **Completion requires evidence**: model self-report is a completion proposal. Completion assurance distinguishes `verified` from `attested`; hard dependencies require `verified` by default.
- **Community distribution**: packages depend only on published DSH contracts and install through the normal DSH bundle/profile workflow. Experimental upstream capabilities remain behind optional adapters.
- **No forgotten full version**: a minimal first-release decision names the fuller capability it defers and links a follow-up ticket. Follow-ups cover advanced verification, multi-agent scheduling, recovery, routing and parallelism, phase and Goal integration, capability extraction, history inspection, typed dataflow ports, and richer plan relations.
- **Retained UX**: compact progress near the conversation input, an on-demand graph, node detail, dependency highlighting, clear active/blocked/completed states, and reduced-motion behavior.

## Ticket frontier

```text
[✓] R6 Agent orchestration and loop-engineering research ─┐
[✓] R7 DSH Cordis plugin adaptation ─────────────────────┼──▶ [✓] G12 Plan DAG ownership boundary
                                                        └──▶ G13 ExecutionAttempt and correlation protocol
                                                               └──▶ G19 Cordis outer-loop driver
                                                                      ├──▶ G14 Durable events and projection
                                                                      ├──▶ G16 Model tools and preset composition
                                                                      ├──▶ G17 Executor adapters
                                                                      └──▶ G7 writeScopes conflict semantics
```

**Frontier:** [G13 ExecutionAttempt and correlation protocol](tickets/G13-task-work-correlation.md).

**Next session rule:** resolve one frontier ticket per session unless the user explicitly requests an exception.

## Decisions so far

- [R1 Agent Teams maturity audit](research/R1-agent-team-maturity-audit.md): Agent Teams supplied strong task-DAG prior art; its published experimental API is an optional adapter candidate, not the Plan DAG's permanent public contract.
- [R2 G6 dagre layout feasibility](research/R2-g6-dagre-layout-feasibility.md): G6 5.1.1 can render expected graph sizes; renderer-specific APIs still require an adapter.
- [R3 Subagent and workflow event surface](research/R3-subagent-workflow-event-surface.md): task-to-executor causality remains a gap, while current upstream subagent catalogs and workflow records own more lifecycle facts than the original research observed.
- [G1 DAG data model decision](tickets/G1-dag-data-model-decision.md): explicit task identity and relation semantics remain useful; terminal Todo replacement, all-ignorable events, client-owned replay, and heuristic task correlation are superseded.
- [G2 DAG panel placement and interaction](tickets/G2-dag-panel-placement-and-interaction.md): the accepted interaction goals and prototype evidence remain; current right-sidebar and global-panel contracts replace the original container decision.
- [G3 Preset universality strategy](tickets/G3-preset-universality-strategy.md): independent opt-in composition remains plausible; host-level `tools.restrict()` cannot implement task-tool replacement.
- [G5 Dynamic node insertion and real-time DAG updates](tickets/G5-dynamic-node-insertion-design.md): batching, stable layout, and view filtering remain inputs; Client state is not the durable authority.
- [G6 Infrastructure contracts for dynamic workflows](tickets/G6-infra-contracts-for-dynamic-workflows.md): explicit stable APIs remain necessary; event requiredness, task/attempt ownership, CAS, and loop policy are superseded by the current route.
- [R4 Upstream 0.1.5 architecture rebaseline](research/R4-upstream-0.1.5-architecture-rebaseline.md): current DSH projections, Agent Teams, subagent catalogs, workflow records, and UI seats supersede several historical assumptions; its tentative read-model preference is corrected by the restored product purpose.
- [R6 Agent orchestration and loop-engineering research](research/R6-agent-orchestration-and-loop-engineering.md): the feature requires a writable Plan DAG, separate attempts, evidence-based completion, bounded continuation, and local repair before global replanning.
- [R7 DSH Cordis plugin adaptation](research/R7-dsh-cordis-plugin-adaptation.md): the first release can use public Cordis extension points without changing `agent-loop`; capability, tools, driver, adapters, client, and installable bundle remain separate roles.
- [G12 Plan DAG ownership boundary](tickets/G12-task-graph-authority.md): the Plan DAG owns Plan Runs, Tasks, attempts, verification, execution references, holds, budgets, and stop records while executor internals remain separate; stable identities, layered revisions, hard dependencies, explicit concurrency, and evidence-based completion define the later protocol.

## Not yet specified

None. The currently visible first-release exclusions have been promoted to follow-up tickets; new fog discovered by later decisions returns here until its question becomes precise.

## Out of scope

- Modifying upstream DSH package source or replacing the default agent loop.
- Rewriting workflow as a declarative DAG engine.
- Owning workflow, subagent, skill, tool, phase, Goal, or trace internal lifecycles.
- Treating every tool call as a task node.
- Requiring cross-session scheduling, unrestricted multi-agent work stealing, a complete trace explorer, or a global progress-wavefront effect before the first useful release. These remain follow-up work, not discarded capabilities.
