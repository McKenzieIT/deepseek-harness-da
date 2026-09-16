# G17 — Executor adapters

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) ✅, [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md), [G7 writeScopes conflict semantics](G7-writescopes-conflict-detection.md) ✅
**Blocks**: [G9 Optional Agent Teams adapter](G9-team-task-upstream-integration.md), [G10 Subagent execution adapter](G10-subagent-tree-upstream-integration.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

How does an Attempt execute through the current Agent, a skill, subagent, workflow, ordinary tools, manual work, or data-agent phase policy without copying those capabilities' state machines?

For each executor, define capability matching, concrete binding, native concurrency, Attempt Group participation, dispatch, causal correlation, cancellation, outcome settlement, named output and evidence mapping, recovery coverage, and missing-data behavior. Skills are execution methods, not Task instances. Native subagent catalogs and workflow events remain authoritative for their internal lifecycle.

Define a typed, versioned executor-adapter contribution interface so future query engines, workflows, subagent providers, and data pipelines join without driver `if/else` branches. This ticket must decide the smallest Cordis mechanism that satisfies that interface and prove registration ownership, disposal, scoped visibility, and failure behavior through an existing or minimal prototype; it must not assume `inject + register + effect` before that proof. Descriptors declare capacity keys, cancellation/reconciliation/resume support, reserved future Attempt Group support, output/evidence projection, failure classification, retry safety, and compatibility. A missing or incompatible adapter fails loud. The first release keeps phase/inner policy behind its concrete executor adapter rather than publishing a one-provider Attempt-policy seam; G25 may promote a shared interface after a second independently evolving policy exists. No inner policy may become a second outer-loop owner.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) fixes the adapter contract: every ordinary Attempt has one primary Binding; nested tool, subagent, workflow, and external-effect work uses child Bindings; skill use is method metadata rather than a fabricated lifecycle. Adapters receive Host-created context and use the merge-extensible typed reference map. When native identity is unavailable before dispatch, the Host persists a `dispatching` Binding under its preallocated `ExecutionBindingId`, flushes the intent, starts the executor, and then attaches the native reference; ambiguous startup becomes `unknown`, not an assumed retry. Adapters submit idempotent Host commands for native outcomes, cancellation, external-effect certainty, outputs, evidence, and late results, never infer authority from trace or lineage, and preserve one causal owner per native execution.

## Inputs from the G19 resolution

The data-agent adapter consumes the selected data scope, metric and concept definitions, labels, default caliber, and Ontology relations before reporting ambiguity. It records stable semantic references or definition digests with the Attempt's model-visible input, maps residual ambiguity to a Task-scoped clarification request, maps absent grounding to decline, and never transfers semantic-layer or phase lifecycle ownership into the Task DAG. The adapter also exposes enough structured failure and changed-premise facts for bounded local repair and configured affected-subgraph replan.

## Inputs from the G14 resolution

Executor adapters implement Host-neutral Task DAG ports. Core `ExecutionBinding` records contain `HostBindingId`, purpose, parentage, generation, and opaque adapter-owned native references rather than DSH identifier unions. Task DAG SQLite commit is the intent durability barrier; current-Agent delivery additionally uses the outbox, source-owned `deliveryId`, Session flush and correlation verification, acknowledgement, and pre-step fencing.

## Inputs from the G7 resolution

Each write-capable executor adapter resolves one complete `read-only | scoped-write | unbounded-write` intent before admission. Scoped resources use versioned `scheme`, `authority`, hierarchical `segments`, and `exact | subtree`; the adapter owns provider normalization, safe labels, actual-target checks, and optional native enforcement. Every adapter consumes the immutable Attempt ExecutionTicket, child Bindings may only narrow its scopes, and unavailable required protection rejects dispatch rather than silently downgrading. The adapter reports `admission-only | target-validated | native-enforced` without changing the core overlap rule.
