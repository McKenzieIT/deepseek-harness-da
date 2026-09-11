# R27 — Context perturbation 与 leakage audit

**Type**: research（experiment，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G13 — Context evaluation protocol](G13-context-evaluation-protocol.md)、[G14 — Adaptive Context snapshot/holdout policy](G14-adaptive-context-holdout-policy.md)、[T12 — Final Evaluation package graph 与 legacy cutover](T12-eval-package-consolidation.md)、[R25 — New Evaluation stack baseline re-anchor](R25-evaluation-rebaseline.md)
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R27-context-perturbation-leakage-audit`

## Question

Context Projection 在 synonym/restructure、distractor、wrong/stale edge、generic alias collision、budget truncation、ordering、cross-entity evidence 与 hidden-derived enrichment 下是否保持必要 invariance 和 construct sensitivity；错误可归因到 source、retrieval、projection、utilization、Environment 还是 grading 吗？

## Recording contract

Use predeclared semantic-preserving and fact-changing perturbations, preserve stage-linked evidence, and run the full batch. After every run, compare with the prior baseline and append Setup → Data verbatim → Verdict → Ticket Pointer to [`experiment-audit-log.md`](../research/experiment-audit-log.md). Hidden-derived or oracle Context cannot enter production score.
