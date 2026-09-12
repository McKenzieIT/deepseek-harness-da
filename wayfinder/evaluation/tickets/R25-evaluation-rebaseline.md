# R25 — New Evaluation stack baseline re-anchor

**Type**: research（experiment，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [T12 — Final Evaluation package graph 与 legacy cutover](T12-eval-package-consolidation.md)、[G1b — Ground-truth lifecycle](G1b-ground-truth-lifecycle.md)、[GA-EVAL-CASESET-EVENT-ANCHOR](../../data-agent/tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)
**Blocks**: [R21 — 跨 slice 与跨时间 Goodhart audit](R21-goodhart-audit.md)、[R26 — Context counterfactual matrix](R26-context-counterfactual-matrix.md)、[R27 — Context perturbation and leakage audit](R27-context-perturbation-leakage-audit.md)
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R25-evaluation-rebaseline`

## Question

在新 Protocol、canonical Pack、production Agent path、Environment assurance、Context identity、sealed EvidenceCut 与 grading semantics 下，首个可复现 data-analysis baseline 是什么；哪些 cases/attempts 因 invalid、unresolved、observational 或 ground-truth defect 被排除？

## Required run

- Full declared Pack/cohort only; single-case debug probes do not count.
- Frozen Run Identity Graph, ComparisonPlan/estimand, standard `pass@n` and strict `pass^k`, raw attempt vectors and uncertainty.
- Per-case publication eligibility, Environment assurance, execution/judge dimensions, failure attribution and coverage accounting.
- No comparison claiming continuity with invalid historical percentages.

## Recording contract

After every full run, compare with the prior new-stack baseline using the canonical compare path, then append Setup → Data verbatim → Verdict → Ticket Pointer to [`experiment-audit-log.md`](../research/experiment-audit-log.md). Preserve all run/evidence/grade/artifact references.

## Success criteria

- Establish one named baseline anchor over validated cases with complete coverage accounting and CIs.
- Publish excluded/incomplete/unresolved/invalid counts separately from correctness.
- Verify offline rescore from the sealed EvidenceCut without model or Environment re-execution.
- Record old K11-v2/RBI percentages as non-comparable historical results, not predecessor measurements.
