# V3 — 细粒度 auto-revert

**Type**: grilling (HITL)
**Phase**: post-G6, ③-gated
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [V2 — eval run changeset 标注](V2-eval-run-changeset-annotation.md)、[Evaluation G14 — Adaptive Context snapshot 与 holdout policy](../../evaluation/tickets/G14-adaptive-context-holdout-policy.md)、[Evaluation R25 — New Evaluation stack baseline re-anchor](../../evaluation/tickets/R25-evaluation-rebaseline.md)
**Related**: G6（audit/version）、G3（confidence gate）、[Evaluation T13](../../evaluation/tickets/T13-context-projection-service.md)、[Evaluation T9](../../evaluation/tickets/T9-evaluation-foundations.md)

## Question

在 canonical Evaluation baseline、Context identity、holdout contamination policy 和 V2 changeset attribution 都可用后，哪些语义定义变更可以被自动回滚，回滚粒度、触发阈值和确认性 re-evaluation 应如何定义？

## Must decide

1. 只有被 sealed evidence 关联到受影响 assets、Context projection 和 regression slice 的变更，是否才具备自动回滚资格。
2. Per-asset、per-field 和 relation edit 的最小安全回滚单位，以及并发后续编辑存在时的冲突语义。
3. Overall、per-category、protected slice 和 per-asset 信号如何组合；不得沿用旧 `>5pp` 单阈值而忽略置信区间与 coverage。
4. Train/development、heldout 和 fresh cohort 的反馈能否写回，如何执行 G14 的 freeze/unblind 与 contamination accounting。
5. 回滚后的确认性 run、失败恢复和人工接管条件。

## Scope

本票只做 HITL 决策并毕业实现票。在 V2、Evaluation G14 和 Evaluation R25 关闭前保持 blocked；不得基于 legacy JSONL 或旧 K11 baseline 实施 auto-revert。
