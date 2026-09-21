---
type: grilling
status: open
assignee: null
blocked_by:
  - ../../evaluation/tickets/T13-context-projection-service.md
---

# CL-32: concept formula 的生产 grounding

## Question

在 [Evaluation T13](../../evaluation/tickets/T13-context-projection-service.md) 建立唯一生产 Context Projection 后，concept 的计算口径、阈值、来源字段和版本信息应如何进入有界的生产 grounding，并让 evaluation 观察同一投影？

必须决定：

- formula 属于 concept definition、metric definition 还是独立 rule 类型。
- 投影包含哪些 source fields、units、thresholds、validity interval、provenance 和 token budget。
- 缺失或冲突 formula 时的失败语义，禁止模型自行发明阈值。
- 与虚拟 metric 的分工；不得恢复已删除的 `execute_metric` 或 Level 2.5 确定性路径。
