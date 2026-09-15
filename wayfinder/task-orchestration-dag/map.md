# wayfinder:map — task-orchestration-dag

> Local Markdown tracker. Tickets live in `tickets/`; research notes live in `research/`. This map indexes decisions and does not restate their detail.

## Destination

An implementation-ready specification for a community-installable DSH Cordis plugin suite that gives data-agent a writable, durable Plan DAG. The LLM can create and revise tasks and dependencies; an outer-loop policy advances ready work through the current Agent, skills, subagents, workflows, or tools; verification controls completion; and a UI shows current, subsequent, blocked, failed, and completed work.

The suite must mount beside upstream packages, use documented DSH services, events, projections, Remotes, and UI slots, and require no upstream source modification or replacement of `agent-loop`. The map is complete when the domain model, attempts and correlation, loop policy, persistence, tools and presets, executor adapters, UI, renderer, community package and bundle topology, compatibility policy, and first-release evaluation are specified for implementation, and every deliberately deferred full-version capability has a named follow-up ticket.

## Notes

- **Domain**: writable task planning, bounded outer-loop control, DSH plugin composition, session persistence and projections, executor adapters, and graph presentation.
- **Skills**: `/dsh-plugin-development`, `/domain-modeling`, `/grilling`, `/prototype`, and `/research`.
- **Planning only**: this map resolves decisions and produces implementation specifications; it does not implement product packages.
- **Grilling cadence**: discuss one genuine decision per round; eliminate dominated or constraint-violating options before presenting choices, and ask for human approval only when viable alternatives have material trade-offs or the choice sets a system architecture.
- **Discussion language and examples**: conduct decision rounds in Chinese and explain trade-offs with concrete data-agent scenarios such as natural-language analytics, data engineering, verification, and recovery.
- **Option quality**: present only independently viable strategies. Evaluate them by user benefit, implementation and maintenance cost, runtime and model overhead, feasibility in current DSH extension points, adoption breadth, and long-term dsh-data-agent value; never manufacture a preferred hybrid by combining labelled options.
- **Decision diagrams**: every architecture or process decision includes a Mermaid flow, sequence, state, or ownership diagram showing the relevant actors, transitions, decision points, and failure paths.
- **Deferred work is named**: every capability deferred from the current ticket must be linked to an explicit follow-up ticket with its trigger, dependencies, decision question, and scope boundary; accumulated evidence never silently enables deferred behavior.
- **ROI gate**: every proposed architecture states user benefit, implementation and maintenance cost, runtime/token/cost overhead, adoption breadth, evidence strength, opportunity cost, and the smallest useful release; unclear marginal ROI defaults to deferral.
- **Architecture-first release strategy**: use the long-term dsh-data-agent direction to choose stable domain ownership, identities, authority, durability, and extension seams; the first release implements the highest-ROI useful slice of that architecture rather than a cheaper design that must later be replaced.
- **Optimization follow-ups**: cost, latency, deduplication, adaptive routing, scheduling, caching, and other optimizations do not enlarge the initial core unless required for correctness. Record them as named follow-ups with evidence triggers and revisit them only when measured user or operating value justifies their complexity.
- **Alternative discipline**: compare complete independently viable strategies rather than manufacturing an `A + B = C` compromise; if one strategy dominates after evidence and ROI analysis, record it directly without an artificial approval choice.
- **Cumulative scope audit**: before the current outer-loop ticket resolves, re-review every accepted decision together, cut or defer low-ROI machinery, check total implementation and model-cost budgets, and attach each deferral to a named follow-up.
- **Upstream baseline**: `upstream/master@c291e7961a515f6d7af9304e7fd1d257929aef26` and `dsh-v0.1.5-rc.2@fb2c4b9e698e30edb738bca4cf0618587db7d203`, dated 2026-09-10.
- **Writable Plan DAG is required**: the feature is not a read-only graph. It owns Plan Runs, tasks, hard dependencies, revisions, readiness, task state, replanning, attempts, verification, budgets, holds, stop records, and explicit execution correlations.
- **Executor ownership remains separate**: workflow, subagent, skill, tool, phase, Goal, and trace capabilities retain their internal lifecycles. Adapters link them to task attempts without copying their state machines.
- **Cordis-only integration**: no upstream package source changes, no imports from `agent-loop` implementation files, and no fork UI/core patch retained solely for this feature. Contributions use reversible effects and public services, events, projections, Remotes, bundle or preset composition, and UI slots.
- **One outer-loop owner**: a Plan-DAG-enabled profile disables upstream `goal-round-driver` and mounts the Task DAG driver as the sole cross-turn continuation owner; phase and other inner policies operate only inside an admitted Attempt. Ordinary DSH profiles retain upstream Goal behavior.
- **Host/Client ownership**: Host services own validation, events, replay, verification, budgets, and projections. React owns only presentation state and renderer lifecycle.
- **Concurrency is preserved without first-release speculation**: independent Tasks may run concurrently without a plugin-wide subagent or workflow cap. The domain retains explicit same-Task Attempt Groups, but first-release runtime admission rejects them visibly; group execution, winner/quorum policy, loser cancellation, and group recovery belong to the advanced-routing follow-up.
- **Commitment policy**: a Plan may cover the full objective; each admission cycle selects a conflict-free set of independent ready Tasks, with at most one active Attempt per Task in the first release. Local retry or affected-subgraph repair precedes global replanning; same-Task groups are deferred.
- **Completion requires evidence**: model self-report is a completion proposal. Completion assurance distinguishes `verified` from `attested`; hard dependencies require `verified` by default.
- **Community distribution**: packages depend only on published DSH contracts and install through the normal DSH bundle/profile workflow. Experimental upstream capabilities remain behind optional adapters.
- **No forgotten full version**: a minimal first-release decision names the fuller capability it defers and links a follow-up ticket. Follow-ups cover advanced verification, multi-agent scheduling, recovery, routing and parallelism, phase and Goal integration, capability extraction, history inspection, typed dataflow ports, richer plan relations, risk-gated human-input auto-routing, and extensible Task Graph authorization.
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
