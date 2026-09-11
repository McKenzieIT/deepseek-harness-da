# G14 — Adaptive Context snapshot 与 holdout policy

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G13 — Context evaluation protocol](G13-context-evaluation-protocol.md)、[G5 — Dynamic case pipeline](G5-dynamic-case-pipeline.md)
**Blocks**: [R27 — Context perturbation and leakage audit](R27-context-perturbation-leakage-audit.md)
**Mode**: HITL
**Branch**: `grilling/G14-adaptive-context-holdout-policy`

## Question

当 Context/ontology/retrieval 会根据 Agent、judge 或 verifier feedback 动态 enrichment 时，snapshot、train/heldout/fresh freeze、writeback、cohort eligibility 与 contamination accounting 应如何定义，才能避免当前 cohort 的 hidden evidence 回流到 production Context？

## Must decide

- Snapshot lineage and the point at which writeback creates a new Context identity.
- Which feedback may update train/development Context and which is forbidden for heldout/fresh.
- Cohort freeze/unblind order and when a new snapshot becomes eligible.
- Oracle/hidden-derived projection isolation and audit evidence.
- Cross-DataScope enrichment, alias/relation leakage and rollback semantics.
