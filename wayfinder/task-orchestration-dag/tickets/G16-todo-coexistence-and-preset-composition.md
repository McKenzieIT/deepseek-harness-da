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

## Inputs from the G13 checkpoint

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) fixes the model-facing boundary: Task objective and acceptance criteria may be visible, but `ExecutionTicket`, Claim, revision fences, and authority are Host-injected rather than model-authored tool arguments. Ordinary turns may use native capabilities as non-Plan work; a `task-attempt` turn is bound to exactly one Attempt, and protected tools or executor launches without a valid Host context fail closed. The preset and prompt design must teach this distinction without exposing infrastructure fields as model choices.
