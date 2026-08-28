# R7 — Terminology 挂载点：是否作为知识图谱 ontology 存储和消费

**Type**: research
**Phase**: post-W14
**Status**: closed
**Assignee**: claude
**Blocked by**: 无（独立）
**Related**: [G2](G2-ontology-role-decision.md)（ontology = 语义层 + relations）、[P2](P2-ontology-relations-graph.md)（RelationGraph + kind plugins）、`packages/data/semantic-layer/src/kinds/event.ts`（当前 `terminology?` 参数模式）

## Question

术语表（terminology）为字段/表/指标提供业务名称映射（如 "dau" → "日活跃用户"）。当前 event kind plugin 的 `toCorpusItem()` 通过显式参数 `terminology?` 接收术语数据（方案 B），但未统一为全局模式。

需要调研：

1. **Terminology 的本质定位**：它是一个独立的数据结构（全局字典），还是应该作为知识图谱 ontology 的一部分（节点属性 / 边类型）？
   - 若属于 ontology：terminology mapping = 一种 relation type（`alias_of` / `display_name_of`），存储在 RelationGraph 中，kind plugin 通过图查询获取
   - 若独立：维持为 plain key-value dict，由 registry 层注入
2. **消费模式**：
   - 方案 A：全局注入 `ctx.terminology`（Cordis service），所有 kind plugin 自动可用
   - 方案 B：每次 `toCorpusItem()` 显式传参（当前 event kind 的做法）
   - 方案 C：ontology 图内查询（`graph.getRelated(fieldId, 'alias_of')`）
3. **与 G2 ontology 决策的一致性**：G2 确定了 relations 三类型（joins/derived_from/related_to）。terminology 映射是否应成为第四种 relation type？还是 related_to 的子类型？
4. **实际影响**：terminology 数据当前从哪里来？（seed 脚本 / YAML / AI enrichment？）改变挂载点对上游填充流程有何影响？

## Scope

Research only。调研 terminology 在 ontology 体系中的最佳位置，为后续 grilling 决策（统一挂载点）提供依据。
