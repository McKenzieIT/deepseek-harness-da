# R1 — agent-team package maturity audit

**Type**: research
**Status**: closed
**Blocked by**: —
**Blocks**: [G1 DAG data model decision](G1-dag-data-model-decision.md), [G3 preset universality strategy](G3-preset-universality-strategy.md)

## Question

The `packages/experimental/agent-team/` package contains a `TeamTaskBoard` with DAG semantics. Before adopting it as the foundation for the new orchestration system, assess its maturity, gaps, and graduation path.

## Resolution

See [research/R1-agent-team-maturity-audit.md](../research/R1-agent-team-maturity-audit.md).

**Summary**: The package is architecturally solid (CAS, cycle detection, authorization, persistence across restart). Key gaps for visualization: no node type discriminator, no timestamps, no display metadata — all solvable via the existing `TeamTaskView` enrichment pattern. Graduation requires renaming, moving out of experimental, accepting 4 event types as stable contracts, and establishing a Zod schema migration strategy. The member/subagent overlap is a deliberate layering, not duplication.
