# R26 — Context counterfactual matrix

**Type**: research（experiment，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G13 — Context evaluation protocol](G13-context-evaluation-protocol.md)、[T12 — Final Evaluation package graph 与 legacy cutover](T12-eval-package-consolidation.md)、[R25 — New Evaluation stack baseline re-anchor](R25-evaluation-rebaseline.md)
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R26-context-counterfactual-matrix`

## Question

在 Benchmark、case、model、Harness、Environment、seed/sampling、grounding instruction、tool schema 与 grader policy 固定时，`none | schema-only | relations-only | production | oracle` Context profiles 对 component evidence、trajectory、execution outcome、provenance、cost 与 latency 的配对影响是什么？

## Recording contract

Run the full predeclared matrix with matched budgets or an explicit budget-response curve. After every full run, compare against the new-stack baseline and append Setup → Data verbatim → Verdict → Ticket Pointer to [`experiment-audit-log.md`](../research/experiment-audit-log.md). Oracle is an upper bound and never enters production headline.
