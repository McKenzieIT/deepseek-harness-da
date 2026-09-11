# G13 — Context evaluation protocol 与 attribution

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G10 — Harness Benchmark/Harness/Environment 拆分](G10-harness-bhe-split.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)、[T13 — Production Context Projection capability](T13-context-projection-service.md)
**Blocks**: [G14 — Adaptive Context snapshot/holdout policy](G14-adaptive-context-holdout-policy.md)、[R26 — Context counterfactual matrix](R26-context-counterfactual-matrix.md)、[R27 — Context perturbation and leakage audit](R27-context-perturbation-leakage-audit.md)
**Mode**: HITL
**Branch**: `grilling/G13-context-evaluation-protocol`

## Question

Data-domain Evaluation 应如何把 Context availability、grounding、relation/composition retrieval、projection provenance、model utilization 与最终 outcome 分成可归因的 component/counterfactual/perturbation/end-to-end protocol，并定义可比较的 Context identity、metrics、failures 和 evidence requirements？

## Must decide

- Component measurements and standard projections for source、retrieval、projection、utilization and outcome stages.
- `none | schema-only | relations-only | production | oracle` profile semantics and headline isolation.
- Context-specific failure attribution and unknown/required evidence handling.
- Paired identity controls, budget matching, replicate/CI and metric/estimand declarations.
- Production Context Projection evidence required for offline audit without re-running retrieval.

## Out of scope

- Retrieval/ranking algorithm selection.
- Dynamic writeback/holdout lifecycle ([G14](G14-adaptive-context-holdout-policy.md)).
- Executing the counterfactual or perturbation experiments ([R26](R26-context-counterfactual-matrix.md)、[R27](R27-context-perturbation-leakage-audit.md)).
