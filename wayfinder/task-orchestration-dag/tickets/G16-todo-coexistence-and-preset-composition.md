# G16 — Model tools and preset composition

**Type**: grilling
**Status**: open
**Blocked by**: [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

What model-facing task tools and Cordis composition give data-agent a writable Plan DAG without invalid host-level restrictions or ambiguous overlap with Todo?

Decide proposal, approval, query, Task/Attempt update, completion-proposal, and replan operations; which transitions remain service-owned; how Plan, Task, and Attempt revisions appear to each actor role; tool visibility before and during a committed Plan; and aligned prompt guidance.

Inspect each data-agent preset's actual Agent scope. Standard DSH presets remain unaffected unless a user installs and composes the community bundle.

Define the DSH-native tool-policy contribution contract for future tools without changing upstream `ToolDefinition`: ordinary Cordis tool registration remains on `ctx.tools`, while an optional Task-DAG companion contribution declares its L0–L2 effect class, resource and cost reservation, read/write scopes, external-effect and retry safety, cancellation/reconciliation coverage, and output/evidence mapping through a typed registry. Contributions use `inject + register + effect`; Host policy may only tighten them, and an unclassified tool fails loud only when used through a Plan-DAG Attempt.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) fixes the model-facing boundary: Task objective and acceptance criteria may be visible, but `ExecutionTicket`, Claim generation, revision fences, Binding identity, and authority are Host-injected rather than model-authored tool arguments. Ordinary turns may use native capabilities as non-Plan work; a `task-attempt` turn is bound to exactly one Attempt, and protected tools or executor launches without valid Host context fail closed. The preset and prompt design must teach this distinction without exposing infrastructure fields, command identifiers, or cancellation authority as model choices.

## Inputs from the G19 resolution

The Plan-DAG profile exposes configurable `onNoProgress: hold | replan` with `hold` as the default and keeps automatic-replan budget fields Host-owned rather than model-authored. Data-agent prompt and tool composition must perform semantic-layer and Ontology grounding before requesting clarification: a unique or declared-default metric meaning proceeds, residual ambiguity creates one correlated clarification request, and missing grounding declines honestly. The model sees the selected business definitions needed for the Task but never receives revision, Claim, Binding, or replan authority as editable tool arguments.

## Inputs from the G14 resolution

Model tools are DSH adapter Consumers that translate business inputs into Host-neutral Task DAG commands; they do not expose journal records, outbox fields, revisions, or Host Binding identities as model choices. Presets compose the independent core/store with Cordis Host, tool, executor, Remote, and Client adapters, and configure the plugin-owned SQLite path without modifying upstream bundles.

## Inputs from the G15 resolution

The current Task DAG Client reserves one concise additive row in the Session-scoped `conversation.input.dock`; the normal and fullscreen graph live in one right-Sidebar page tab. This ticket decides whether Task-DAG presets retain, suppress, or replace Todo content, but must not move the Task DAG summary or depend on Todo as its data source. Queue entries continue to coexist independently.
