# G17 — Executor adapters

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) ✅, [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G9 Optional Agent Teams adapter](G9-team-task-upstream-integration.md), [G10 Subagent execution adapter](G10-subagent-tree-upstream-integration.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

How does an Attempt execute through the current Agent, a skill, subagent, workflow, ordinary tools, manual work, or data-agent phase policy without copying those capabilities' state machines?

For each executor, define capability matching, concrete binding, native concurrency, Attempt Group participation, dispatch, causal correlation, cancellation, outcome settlement, named output and evidence mapping, recovery coverage, and missing-data behavior. Skills are execution methods, not Task instances. Native subagent catalogs and workflow events remain authoritative for their internal lifecycle.

Define a typed, versioned executor-adapter contribution registry so future query engines, workflows, subagent providers, and data pipelines join through ordinary Cordis `inject + register + effect`, never driver `if/else` branches. Descriptors declare capacity keys, cancellation/reconciliation/resume support, reserved future Attempt Group support, output/evidence projection, failure classification, retry safety, and compatibility. A missing or incompatible adapter fails loud. The first release keeps phase/inner policy behind its concrete executor adapter rather than publishing a one-provider Attempt-policy seam; G25 may promote a shared interface after a second independently evolving policy exists. No inner policy may become a second outer-loop owner.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) fixes the adapter contract: every ordinary Attempt has one primary Binding; nested tool, subagent, workflow, and external-effect work uses child Bindings; skill use is method metadata rather than a fabricated lifecycle. Adapters receive Host-created context and use the merge-extensible typed reference map. When native identity is unavailable before dispatch, the Host persists a `dispatching` Binding under its preallocated `ExecutionBindingId`, flushes the intent, starts the executor, and then attaches the native reference; ambiguous startup becomes `unknown`, not an assumed retry. Adapters submit idempotent Host commands for native outcomes, cancellation, external-effect certainty, outputs, evidence, and late results, never infer authority from trace or lineage, and preserve one causal owner per native execution.
