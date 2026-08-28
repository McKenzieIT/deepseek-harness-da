# CL-2 — Domain/Concept 作为图节点（ConceptKindPlugin）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [CL-1](CL1-terminology-aliases-migration.md)（CL-1 验证图扩展模式）
**Blocks**: 无
**Related**: [G2](G2-ontology-role-decision.md)（relation types）、[R9](../research/r9-context-layer-frontier-audit.md)（审计：G2 偏窄）、[context-layer-2026-frontier](../research/context-layer-2026-frontier.md)（前沿参考）

## Question

当前 `domains: string[]` 是 definition 的扁平标签。前沿 context layer 将 domain/concept 视为**图中的一等节点**（OpenMetadata 2.0 的 ontology 层）。

是否应引入 `ConceptKindPlugin`，将业务概念（如"用户活跃"、"付费"、"留存"）建模为图节点，通过 `related_to` 边连接到数据源节点？

需要讨论：

1. **Concept 的定义格式**：
   - 独立 YAML 文件（`concepts/` 目录）？
   - 还是从现有 definitions 的 `domains` 字段自动提取？
   - 还是 AI enrichment 自动发现？

2. **与现有 domains 的关系**：
   - `domains: string[]` 迁移为 `related_to` 边指向 concept 节点？
   - 还是 domains 保留为快捷标签，concept 节点额外存在？

3. **Concept 节点的 KindPlugin 接口**：
   - `toCorpusItem(concept)`：是否需要被检索？（"有哪些付费相关的表？"）
   - `toPromptContext(concept)`：是否需要注入 NL2SQL prompt？
   - `relations(concept)`：concept → assets 的 `related_to` 边

4. **收益验证**：
   - 对 NL2SQL 的具体帮助是什么？（graph-expanded recall 已经用 1-hop DIM 提升到 100%）
   - 对管理 agent 的帮助？（"帮我看看付费域的覆盖率"→ 通过 concept 节点聚合）
   - 是否有 eval case 可验证收益？

5. **不新增 relation type 的确认**：
   - concept → asset 使用现有 `related_to`（"业务语义关联"）
   - 是否需要区分 concept→asset 和 asset→asset 的 `related_to`？（子类型？label？）

## Scope

Grilling 讨论并锁定设计方案。若决策为引入，毕业为实现票。
