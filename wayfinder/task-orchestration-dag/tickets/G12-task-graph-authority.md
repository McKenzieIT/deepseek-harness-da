# G12 — Plan DAG ownership boundary

**Type**: grilling
**Status**: resolved 2026-09-12
**Blocked by**: [R6 Agent orchestration and loop-engineering research](R6-agent-orchestration-and-loop-engineering.md) ✅, [R7 DSH Cordis plugin adaptation](R7-dsh-cordis-plugin-adaptation.md) ✅
**Blocks**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md), [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)

## Question

Where is the exact ownership boundary of the writable Plan DAG?

The product requirement establishes writable, durable tasks, dependencies, revisions, readiness, task state, acceptance criteria, and replanning. This ticket resolves ownership of attempts, claims, execution references, verification, failure recovery, run control, and lifecycle facts without absorbing workflow, subagent, skill, tool, phase, Goal, or trace internals.

## Resolution

The Plan DAG is the single writable authority for one Session's Plan Runs, Tasks, task-level execution history, verification state, and bounded run-control record. It coordinates existing DSH executors through explicit references and public Cordis extension points without owning their internal lifecycles.

### Decisions

1. **ExecutionAttempt ownership**: the Plan DAG owns Tasks, ExecutionAttempts, verification evidence, and task-level references to Agents, skills, subagent runs, workflow runs, and tool calls. Executor internals remain separately owned. A separate Execution Ledger is deferred until a second consumer or scale requirement exists.
2. **State ownership**: the Task Graph Service validates and commits all Task transitions. LLMs, drivers, adapters, and verifiers submit commands and evidence; none writes Task state directly. Lifecycle, readiness, holds, Attempt state, and acceptance verdict are orthogonal.
3. **Replanning**: Task IDs remain stable across Plan revisions. Replan uses an atomic patch against `baseRevision`, records reason and active-Attempt policy, preserves unaffected and completed work, and explicitly adds, updates, or supersedes Tasks and dependencies. Stale revisions are rejected.
4. **Minimal verification ownership**: the Plan DAG owns acceptance criteria, completion proposals, evidence references, and final verdicts. A small reusable criterion set and Cordis verifier registration cover the first release. Only the Task Graph Service commits completion. Advanced verification belongs to [G21 Advanced verification and evidence providers](G21-advanced-verification-and-evidence.md).
5. **Concurrency without capability reduction**: multiple Tasks and Attempts may run concurrently when dependencies, claims, policy, resources, and installed DSH executors permit it. The plugin imposes no fixed subagent or workflow limit. Excess ready Tasks remain ready rather than blocked.
6. **Tiered mutation authority**: users and the main orchestrating Agent may change Plan structure. Workers update only their claimed Attempts and submit progress, evidence, completion proposals, or replan proposals. Verifiers submit verdicts; adapters submit executor observations and references. The service authenticates roles and commits state.
7. **Hybrid failure recovery**: an Attempt failure does not automatically fail its Task. Harness policy handles bounded mechanical cases such as stale work, explicitly retryable faults, input or approval holds, interrupted recovery, and unknown-outcome reconciliation. The orchestrator proposes semantic retry, executor change, repair, replan, hold, cancellation, or terminal failure; the service validates it.
8. **Durable run control**: the Plan DAG persists Run phase, consumed budgets, holds, no-progress state, and stop reason. Deployment and driver policy provide limits. Resume does not reset usage. A reusable Run Controller is deferred to [G31 Run Controller extraction threshold](G31-run-controller-extraction.md).
9. **Session scope**: one Session may retain multiple Plan Runs for distinct objectives, but at most one is active. Replanning the same objective creates a revision within the Run; a distinct objective creates a new `PlanRunId`. Concurrent top-level Runs and cross-session scheduling belong to [G22 Cross-session and multi-agent scheduling](G22-cross-session-multi-agent-scheduling.md).
10. **Task meaning**: a Task is executable or manually completable work with a concrete objective and acceptance criteria. Phases, display groups, milestones, dependency waits, approval, and other holds are not Tasks. Verification is an acceptance criterion unless it is independently scheduled work with its own result.
11. **Hard dependencies**: scheduling edges are hard prerequisites. A downstream Task is ready only after every prerequisite reaches the permitted completion assurance. Preferred ordering and display relations are metadata. Richer relations belong to [G30 Conditional branches and richer plan relations](G30-conditional-branches-and-plan-relations.md).
12. **Lightweight data references**: Tasks may declare named outputs; Attempts bind them to artifact, result, tool, workflow, subagent, or small inline-JSON references and verification state. Downstream Tasks reference names rather than copying large values. Typed ports belong to [G29 Typed task dataflow ports](G29-typed-dataflow-ports.md).
13. **Layered revisions**: `PlanRun.planRevision` protects the Task set, dependencies, declared inputs/outputs, and replan patches. Each Task and Attempt has its own revision for local updates. Cross-level commands validate all relevant revisions and commit them atomically.
14. **No physical Task deletion**: persisted Task IDs are never removed or reused. Work ends as completed, failed, cancelled, or superseded with reason and revision provenance. Current views may filter terminal Tasks while history and references remain addressable.
15. **Explicit same-Task concurrency**: one active Attempt is the default. Multiple simultaneous Attempts require an Attempt Group with strategy, members, aggregation or winner rule, completion rule, budget, resource policy, and loser policy. Native executor parallelism remains available. Advanced optimization belongs to [G24 Advanced routing, parallelism, and optimization](G24-advanced-routing-and-parallelism.md).
16. **Completion assurance**: verdicts distinguish `verified` from `attested`. Hard dependencies require `verified` by default. A Task or profile may explicitly allow `attested` for low-risk work, while protected classes may prohibit it.
17. **Atomic execution admission**: admission atomically rechecks readiness and revisions, creates the execution claim, and creates the Attempt with executor identity. An active Attempt holds its claim. Durable assignment responsibility is a separate `assignee` and does not authorize execution.
18. **Separate execution and verification state**: Attempt phase is `prepared | running | settled`; a settled outcome is `succeeded | failed | cancelled | interrupted | unknown`. A successful outcome may produce a CompletionProposal but does not complete the Task. Acceptance verdict is `pending | verified | attested | rejected | inconclusive`.
19. **Proposed and committed revisions**: initial plans and replans begin as proposals. Approval policy decides automatic, orchestrator, or user approval. Only a committed revision admits execution. Ordinary Attempt and evidence updates do not reopen whole-plan approval.
20. **Abstract requirements, concrete executor binding**: Tasks record allowed executor kinds, required capabilities, optional preferred skill, concurrency strategy, and approval policy. Atomic admission selects an available concrete executor and records it on the Attempt. Executor changes create new Attempts.
21. **Task lifecycle**: `planned | active | completed | failed | cancelled | superseded`. Readiness, holds, Attempt state, and verdict are separate. Terminal lifecycle states do not reopen.
22. **Task and Run holds**: a Task Hold prevents one Task's admission; a Plan Run Hold prevents new Attempts across the Run. Holds are durable, separate from dependency blocking, and record reason, actor, time, and release authority or condition.
23. **Plan Run lifecycle**: `draft | active | completed | failed | cancelled`. Approval, input, authorization, pause, and reconciliation are Holds. Budget and no-progress explanations are Stop Reasons.
24. **Run completion**: a committed revision identifies required terminal Tasks and Run-level criteria. Completion requires their permitted assurance, no active Attempt or required verification, no completion-blocking Hold, and a passing Run verdict. Only the service commits `PlanRun.completed`.
25. **Failure containment**: failed, cancelled, or superseded prerequisites do not rewrite descendant lifecycles. Descendants derive dependency blocking; unaffected branches continue. With required work but no legal ready path, the Run records a blocked Stop Reason and requests repair, replan, cancellation, or terminal failure.

### Canonical terms

- **Plan Run**: one durable execution of a distinct objective within a Session.
- **Plan Revision**: a proposed or committed version of one Run's Task set, dependencies, declared inputs/outputs, and required terminal Tasks.
- **Task**: a unit of work with objective and acceptance criteria.
- **ExecutionAttempt**: one admitted execution of a Task through a concrete executor.
- **Attempt Group**: explicitly concurrent Attempts for one Task with aggregation and completion policy.
- **CompletionProposal**: executor outputs and evidence offered for Task acceptance.
- **Acceptance verdict**: the independent assurance result for Task acceptance.
- **Execution claim**: the reservation held by an active Attempt, distinct from `assignee` responsibility.
- **Task Hold / Plan Run Hold**: durable local or Run-wide admission suspension.
- **Stop Reason**: durable explanation for why an active Run is not continuing.

### Consequences

- [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) defines identifiers, causal bindings, admission, grouping, and settlement.
- [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md) defines scheduling, actor policy, verifier dispatch, budgets, continuation, and stop behavior without modifying `agent-loop`.
- [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md) defines required events and projections for these entities and revisions.
- Full-version follow-ups cover advanced verification, multi-agent scheduling, recovery, routing, phase and Goal integration, capability extraction, history inspection, typed ports, richer Plan relations, and reusable Run control.
