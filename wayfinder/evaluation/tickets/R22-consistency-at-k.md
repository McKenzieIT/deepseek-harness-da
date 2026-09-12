# R22 — Consistency at k 与 strict reliability 实验

**Type**: research  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R4 — Estimand 与重复可靠性论文认读](R4-significance-papers.md)；T1-exec-grader-impl
**Mode**: ML-eval experiment（按 [playbook](../playbook.md) 走 SPEC→rubric→另一环境）
**Branch**: `research/R22-consistency-at-k`

## Question

同一 case 在固定模型、Harness、Environment、policy 与采样参数下重复运行时，standard `pass@n`、strict `pass^k`、per-case success count、variance 与 failure correlation 如何变化？单次 accuracy 是否高估 retry-free reliability，模型排名是否发生反转？

## 必须记录

- 完整 attempt vector，不只保存聚合 verdict。
- Model、prompt、Harness、adapter、environment、policy、seed 与预算。
- Standard `pass@n`、strict `pass^k`、per-attempt rate 和 confidence interval。
- Train/heldout/fresh 分层及难度分层。

每次完整运行写入 `../research/experiment-audit-log.md`。
