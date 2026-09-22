---
type: grilling
status: open
assignee: null
blocked_by:
  - ../../evaluation/tickets/T12-eval-package-consolidation.md
---

# CL-26: decline evidence 与用户可见 synthesis 统一决策

## Question

在 [Evaluation T12](../../evaluation/tickets/T12-eval-package-consolidation.md) 完成旧 evaluation runner cutover 后，生产响应与 evaluation 应如何从同一份结构化 decline evidence 生成用户可见回复，同时保持 evidence、synthesis 和 grading 的职责分离？

必须决定：

1. 哪个生产组件拥有 decline evidence，包括缺失字段、候选资产、可用指标、不可验证阶段和来源引用。
2. 用户可见 synthesis 如何消费该 evidence，且不得从 evaluation-only prompt 或旧 runner 私有上下文重建事实。
3. Evaluation 如何记录并评分同一生产回复，而不复制另一套 decline 合成器。
4. 无可靠候选、部分 evidence、parser failure 和 provider failure 的明确结果与可发布性。
5. 哪些 keyless snapshot、sealed evidence 和 product-path tests 证明生产与 evaluation 观察同一路径。

## Scope

本票合并并取代旧 [CL-28](CL28-contextprefetched-decline-synthesis-entrypoint.md)。不修补 `eval-runner-service` 或 `contextPrefetched` 的旧入口；Evaluation T12 删除旧路径后再决定和实现唯一 owner。
