# R7 — DSH Cordis plugin adaptation

## Question

Can a writable Plan DAG drive data-agent execution through public Cordis extension points without modifying upstream DSH packages or replacing the default Agent loop?

## Finding

Yes for the first release. DSH exposes the step-admission, tool-policy, continuation, session-event, projection, Remote, and UI composition points required by a Plan DAG driver. The implementation is a Cordis plugin suite mounted beside upstream packages. It does not import implementation files from `agent-loop`, patch upstream source packages, or preserve obsolete fork changes to upstream UI/core packages.

## Plugin roles

- A task-graph capability owns branded identities, commands, dependencies, revisions, readiness, attempts, verification, required events, projection, and durable commit.
- A tool consumer exposes the small model-facing planning and mutation API.
- An outer-loop consumer selects and claims ready work, submits task-scoped input, rejects stale work, binds calls to attempts, verifies evidence, and continues only while policy permits.
- A Client consumer reads the normal `taskGraph` session projection; React owns presentation state only.
- Optional executor adapters correlate attempts with current-Agent work, skills, subagents, workflows, tools, phase-gate, and Agent Teams without copying their lifecycles.

## Public extension points

- `agent/status` observes idle/running transitions.
- Agent inbox plus `Agent.followup()` and `Agent.steer()` submit task-scoped continuation.
- `agent/pre-step` rejects stale claims and revisions before admission.
- `agent/turn-stopping` continues, waits, or stops according to durable plan state.
- `ctx.tools.guard()` rejects protected execution without valid task admission.
- `tools/pre-execute` performs asynchronous checks and establishes causal correlation before dispatch.
- `tools/post-execute` and `tools/result` retain observations and verifier inputs.
- `Session.append()` plus `ctx.sessions.flush()` commits an authoritative mutation before success.
- `ctx.sessionProjections.register()` supplies Host and Client state.
- `ctx.slots.inject()` registers UI without modifying an upstream owner.

Prompt text, UI state, and tool visibility are not authorization mechanisms.

## Loop and composition

The driver follows the public-extension pattern demonstrated by `goal-round-driver`: observe quiescence, read projection and budgets, atomically admit work, queue a revision-fenced message, revalidate in `agent/pre-step`, associate calls, verify evidence, settle attempts, and decide continuation at the turn or idle boundary.

`goal-round-driver`, phase-gate, and task-graph driver cannot independently own continuation for the same Agent. A data-agent composition selects one outer-loop owner; phase and Goal contribute inner policy or objective state only after their relationship is decided.

## Persistence and community distribution

Authoritative Plan DAG events are required-on-read. A runtime without the plugin should reject such a session rather than resume without the authority that governed execution. Projection folds are synchronous, plain JSON, reference-stable for unrelated events, and versioned when semantics change. Successful mutations append and flush before returning.

Community delivery uses published DSH contracts and an installable bundle with `dsh.bundle.patch`. An example composition demonstrates the feature; it is not the distribution unit. Experimental upstream APIs remain behind optional adapters.
