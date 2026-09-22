---
type: grilling
status: open
assignee: null
blocked_by: []
---

# G8: Ontology 执行约束与可审计关系模型

## Question

当前 RelationGraph 主要用于候选扩展、prompt join constraints 和 warning 级 undeclared-JOIN 检查。应如何演进为方向保真、可审计且能约束执行的 ontology 关系模型？

需决定：

1. `joins`、`derived_from`、`related_to` 是否继续共用双向 adjacency，或拆分 traversal 与语义方向。
2. relation 需要哪些 predicate、source evidence、confidence、actor、version 和 validation record。
3. 哪些约束应在执行前 fail-closed，哪些因图覆盖不足只能 warning/fallback。
4. 如何与 Evaluation T13 的 `ContextProjectionEvidence`、G13 的 attribution 和 V2/V3 的 changeset/revert 对接。
5. 表级和列级 lineage 的最小首版范围。
