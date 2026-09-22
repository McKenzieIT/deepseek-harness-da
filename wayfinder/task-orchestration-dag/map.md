# wayfinder:map — task-orchestration-dag

> Local Markdown tracker. Tickets live in `tickets/`; research notes live in `research/`. This map indexes decisions and does not restate their detail.

## Destination

An implementation-ready specification for a standalone-capable Task DAG core plus a community-installable, preset-orthogonal DSH Cordis adapter suite. The Task DAG owns a writable Plan DAG, execution attempts, verification, Holds, budgets, recovery, an append-only journal, current projections, and a transactional outbox. The LLM can create and revise tasks and dependencies; an outer-loop policy advances ready work through Host adapters; and Web or SDK clients show current, subsequent, blocked, failed, and completed work. Data-agent is the first proving integration, not the owner of the capability.

The core domain, store, projection, and execution ports must not import DSH or Cordis types. The DSH adapter suite mounts beside upstream packages, maps generic Host Bindings and executor ports to documented DSH services, events, Remotes, bundle composition, and UI slots, and requires no upstream source modification or replacement of `agent-loop`. The map is complete when the independent domain and persistence protocol, Host integration, attempts and correlation, loop policy, cross-preset tools, executor adapters, UI, renderer, community package topology, compatibility policy, and first-release evaluation are specified for implementation, and every deliberately deferred full-version capability has a named follow-up ticket.

## Notes

- **Domain**: Host-neutral writable task planning, bounded outer-loop control, append-only Task DAG persistence, projections, transactional delivery, executor ports, DSH Cordis adapters, and graph presentation.
- **Skills**: `/dsh-plugin-development`, `/domain-modeling`, `/grilling`, `/prototype`, and `/research`.
- **Planning only**: this map resolves decisions and produces implementation specifications; it does not implement product packages.
- **Grilling cadence**: discuss one genuine decision per round; eliminate dominated or constraint-violating options before presenting choices, and ask for human approval only when viable alternatives have material trade-offs or the choice sets a system architecture.
- **Discussion language and examples**: conduct decision rounds in Chinese and explain trade-offs with concrete data-agent scenarios such as natural-language analytics, data engineering, verification, and recovery.
- **Terminology explanations**: when a specialized term first appears in a decision round, define it in plain Chinese and show its role in one concrete data-agent flow before asking for approval.
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
- **Independent core and Cordis adapters**: Task DAG domain, journal, projection, commands, and ports import no DSH or Cordis types. DSH integration uses reversible effects and public Agent, Session, Tools, Remote, bundle, preset, and UI APIs; it makes no upstream source change, imports no `agent-loop` implementation file, and retains no fork UI/core patch solely for this feature.
- **Preset-orthogonal capability**: the installable Bundle exposes one Task DAG capability to Agents using any business preset. Task DAG is not a preset, does not copy or patch preset files, and does not require a second Agent merely to plan work.
- **Phase-gate is not selected by this map**: the first release may adapt the current data-agent runtime opaquely, but no completed experiment proves phase-gate should remain after Task DAG. [G25 Data-agent inner orchestration after Task DAG](tickets/G25-phase-gate-integration.md) owns retention, decomposition, or retirement; phase events and phase UI are conditional consequences.
- **One outer-loop owner**: while the generic Task DAG capability is active, its driver is the sole cross-turn continuation owner and Bundle composition disables upstream `goal-round-driver`; deployments without Task DAG retain upstream Goal behavior. Any retained executor-local policy operates only inside an admitted Attempt.
- **Authority and Host binding**: the Task DAG journal owns validation, replay, verification, budgets, Holds, deliveries, and projections. Generic Host Bindings attach a Run to DSH or another Host without making native conversation ids domain identities.
- **Dual durable records**: Task DAG storage owns plan and execution-control facts; a DSH Session records the exact messages, model responses, and tool events that occur in DSH. Adapters correlate the two stores with stable identities and digests and never infer one authority from the other.
- **Host/Client ownership**: Task DAG services produce renderer-neutral current values through their own snapshot/watch transport. React owns only presentation state and renderer lifecycle; it does not replay either Task DAG journal records or DSH Session events.
- **Concurrency is preserved without first-release speculation**: independent Tasks may run concurrently without a plugin-wide subagent or workflow cap. The domain retains explicit same-Task Attempt Groups, but first-release runtime admission rejects them visibly; group execution, winner/quorum policy, loser cancellation, and group recovery belong to the advanced-routing follow-up.
- **Commitment policy**: a Plan may cover the full objective; each admission cycle selects a conflict-free set of independent ready Tasks, with at most one active Attempt per Task in the first release. Local retry or affected-subgraph repair precedes global replanning; same-Task groups are deferred.
- **Completion requires evidence**: model self-report is a completion proposal. Completion assurance distinguishes `verified` from `attested`; hard dependencies require `verified` by default.
- **Community distribution**: the independent core and storage providers can ship without DSH; DSH adapter packages depend only on published contracts and install through the normal bundle/profile workflow. Experimental upstream capabilities remain behind optional adapters.
- **No forgotten full version**: a minimal first-release decision names the fuller capability it defers and links a follow-up ticket. Follow-ups cover advanced verification, multi-agent scheduling, recovery, routing and parallelism, data-agent inner orchestration and Goal integration, capability extraction, history inspection, typed dataflow ports, richer plan relations, risk-gated human-input auto-routing, extensible Task Graph authorization, and measured renderer scaling or replacement.
- **Retained UX**: compact progress near the conversation input, an on-demand graph, node detail, dependency highlighting, clear active/blocked/completed states, and reduced-motion behavior.

## Architecture

[G14 Durable events, projection, and Host/Client boundary](tickets/G14-task-graph-projection-boundary.md) owns the persistence and Host-integration detail. At map resolution, the Task DAG core is portable and DSH is one adapter target:

```mermaid
flowchart LR
    Domain[Task DAG domain] --> Store[Journal + projection + outbox]
    Store --> Ports[Host and executor ports]
    Ports --> DSH[DSH Cordis adapters]
    DSH --> Agent[Agent / Session / Tools]
    Store --> Remote[Task DAG snapshot + watch]
    Remote --> Clients[Web / TypeScript SDK / Python SDK]
    Agent --> Transcript[DSH Session transcript]
    Transcript -. stable references .-> Store
```

The Task DAG journal owns Plan and execution-control state. DSH records the exact model and tool transcript produced through its adapter. Host Bindings, delivery identities, native references, and digests correlate the stores without making either reconstruct the other's authority.

## Ticket frontier

```text
[✓] R6 Agent orchestration and loop-engineering research ─┐
[✓] R7 DSH Cordis plugin adaptation ─────────────────────┼──▶ [✓] G12 Plan DAG ownership boundary
                                                        └──▶ [✓] G13 ExecutionAttempt and correlation protocol
                                                               └──▶ [✓] G19 Cordis outer-loop driver
                                                                      ├──▶ [✓] G14 Durable storage and Host boundary ──▶ [✓] G15 Current client placement ──▶ [✓] R5 Renderer adapter stability ─┬──▶ [✓] G4 Animation and edge design ──▶ G8 Global progress wavefront
                                                                      │                                                                └──▶ G11 DAG view simplification
                                                                      ├──▶ [✓] G7 writeScopes conflict semantics
                                                                      └──▶ G25a Phase-gate incremental-value experiment ──▶ G25 Data-agent inner orchestration
                                                                                                                        ├──▶ G16 Model tools and cross-preset composition (also requires G7)
                                                                                                                        └──▶ G17 Executor adapters (also requires G7)
```

**Frontier:** [G11 DAG view simplification strategies](tickets/G11-dag-view-simplification-strategies.md), [G8 Global progress wavefront](tickets/G8-z-enhancement-global-progress-wavefront.md), and [G25a Phase-gate incremental-value experiment](tickets/G25a-phase-gate-incremental-value-experiment.md) are open, unblocked, and unclaimed. G25, G16, and G17 wait on the G25a evidence.

**Current checkpoint:** the [G16 cross-preset and phase-gate consistency audit](research/G16-preset-phase-gate-consistency-audit.md) found that phase-gate retention is a missing prerequisite rather than a post-release integration detail. The user chose an evidence-first decision on 2026-09-17 and approved the complete protocol in [G25a Phase-gate incremental-value experiment](tickets/G25a-phase-gate-incremental-value-experiment.md), which is now claimed and in implementation. G25a isolates the state machine's value from its deterministic checks before [G25 Data-agent inner orchestration after Task DAG](tickets/G25-phase-gate-integration.md) resumes. G16 retains its accepted generic tool decisions while the remaining G16 composition work, the data-agent portion of G17, and G20 wait on G25.

Implementation found the originally locked case set ungradeable before Stage 0 could be built, and the user approved two protocol amendments on 2026-09-17: the real-execution slice moved to the 12 `rbi-10000251-exec` cases whose oracle still reproduces, and the primary axis moved to the already-approved anti-fabrication rule because 8pp is below the metric's resolution at that sample size. Evidence is in [G25a preflight — the locked case oracle cannot grade the decision batch](research/G25a-oracle-validity-preflight.md); the amended protocol and a supersession table live on the ticket. No decision-run budget has been spent.

**Next session rule:** resolve one frontier ticket per session unless the user explicitly requests an exception.

## Decisions so far

- [G25a phase-gate incremental-value experiment](experiments/g25a-phase-gate/report.md): the locked run did not justify enlarging the full phase-gate; G25 remains open for the split policy/validator decision.
- [R1 Agent Teams maturity audit](research/R1-agent-team-maturity-audit.md): Agent Teams supplied strong task-DAG prior art; its published experimental API is an optional adapter candidate, not the Plan DAG's permanent public contract.
- [R2 G6 dagre layout feasibility](research/R2-g6-dagre-layout-feasibility.md): G6 5.1.1 can render expected graph sizes; renderer-specific APIs still require an adapter.
- [R3 Subagent and workflow event surface](research/R3-subagent-workflow-event-surface.md): task-to-executor causality remains a gap, while current upstream subagent catalogs and workflow records own more lifecycle facts than the original research observed.
- [G1 DAG data model decision](tickets/G1-dag-data-model-decision.md): stable Task identities and explicit relations remain useful; G14 supersedes terminal-state persistence and heuristic correlation, while G16 supersedes the original `dag_task_*` and Todo-replacement mechanism.
- [G2 DAG panel placement and interaction](tickets/G2-dag-panel-placement-and-interaction.md): the accepted interaction goals and prototype evidence remain; current right-sidebar and global-panel contracts replace the original container decision.
- [G3 Preset-orthogonal Task DAG distribution](tickets/G3-preset-universality-strategy.md): an independent Bundle exposes the generic Task DAG capability across business presets without creating or patching presets; later tickets replace the original Session-event, `tools.restrict()`, and phase-node mechanics.
- [G5 Dynamic node insertion and real-time DAG updates](tickets/G5-dynamic-node-insertion-design.md): execution-infrastructure intent, batching, stable layout, and view filtering remain inputs; the journal-backed core projection replaces direct Client or Session-event state.
- [G6 Infrastructure contracts for dynamic workflows](tickets/G6-infra-contracts-for-dynamic-workflows.md): explicit stable APIs remain necessary; the current contracts are Host-neutral commands, journal records, projections, outbox deliveries, and Host Bindings rather than `dag/*` Session events or a per-Session service.
- [R4 Upstream 0.1.5 architecture rebaseline](research/R4-upstream-0.1.5-architecture-rebaseline.md): current DSH Agent, Session, Remote, executor, and UI capabilities remain adapter inputs; Task DAG persistence and projection remain independent rather than adopting SessionProjection authority.
- [R6 Agent orchestration and loop-engineering research](research/R6-agent-orchestration-and-loop-engineering.md): the Host-neutral core requires writable plans, separate Attempts, evidence-based completion, bounded continuation, and local repair before global replanning.
- [R7 DSH Cordis plugin adaptation](research/R7-dsh-cordis-plugin-adaptation.md): public Cordis extension points support additive DSH adapters without changing `agent-loop`; the independent core/store/projection and DSH Host, executor, tool, Client, and bundle roles remain separate.
- [G12 Plan DAG ownership boundary](tickets/G12-task-graph-authority.md): the Task Graph owns Plan Runs, Tasks, Attempts, verification, execution references, Holds, budgets, and stop records while the Plan DAG remains the structural revision subset and executor internals remain separate.
- [G13 ExecutionAttempt and correlation protocol](tickets/G13-task-work-correlation.md): one causal Binding owner, journaled intents, command receipts, outbox delivery, Host Bindings, fenced commands, separate output/evidence, and immutable cancellation or late-result settlement define Task-to-executor correlation.
- [G19 Cordis outer-loop driver, verification, and budgets](tickets/G19-cordis-outer-loop-driver.md): one Host-neutral Task DAG service owns continuation policy; its DSH Cordis adapter supplies inbox, pre-step, tool, and checkpoint integration while semantic grounding, evidence, budgets, Holds, and bounded replan remain domain-owned.
- [G14 Durable events, projection, and Host/Client boundary](tickets/G14-task-graph-projection-boundary.md): an independent SQLite journal, complete-value commits, projections, outbox, Host Bindings, dual-store correlation, and Task DAG snapshot/watch provide durability without upstream DSH changes; Cordis adapters own all DSH-specific delivery and native references.
- [G15 Current client placement](tickets/G15-current-client-placement.md): one shared current-value source feeds a compact composer summary and one per-Session right-Sidebar tab; built-in fullscreen supplies large inspection while history and global aggregate views remain additive follow-ups.
- [R5 G6 renderer adapter stability](research/R5-g6-renderer-adapter-stability.md): one private G6 adapter accepts complete renderer-neutral scenes, separates topology renders from style draws, owns cancellable direct animations, and guards hidden, reduced-motion, remount, and upgrade lifecycles.
- [G4 Animation and edge design](tickets/G4-animation-and-edge-design.md): a Task-only graph separates lifecycle, assurance, and attention; dependency edges show prerequisite satisfaction; local replan differences preserve context; and bounded one-shot motion explains committed changes without continuous flow.
- [G7 writeScopes conflict semantics](tickets/G7-writescopes-conflict-detection.md): explicit read-only, scoped, and unbounded intents drive durable all-or-nothing admission; adapters normalize versioned hierarchical resources and report target or native enforcement without claiming control over external writers.

## Not yet specified

None. The currently visible first-release exclusions have been promoted to follow-up tickets; new fog discovered by later decisions returns here until its question becomes precise.

## Out of scope

- Modifying upstream DSH package source or replacing the default agent loop.
- Persisting authoritative Task DAG state in DSH Session events or treating `sessionProjections` as the Task Graph authority.
- Rewriting workflow as a declarative DAG engine.
- Owning workflow, subagent, skill, tool, phase, Goal, or trace internal lifecycles.
- Treating every tool call as a task node.
- Requiring cross-session scheduling, unrestricted multi-agent work stealing, a complete trace explorer, or a global progress-wavefront effect before the first useful release. These remain follow-up work, not discarded capabilities.
