# G2 — Ontology 在 data-agent 中的角色决策

**Type**: grilling
**Status**: Closed
**Blocked by**: R2

## Question

基于 R2 的全面调研结论，决定 ontology/知识图谱在 dsh-data-agent 中的角色和实现方式。

## 决策要素

- Ontology 与语义层的关系（合并 vs 独立层）
- 技术选型（图数据库 vs 轻量方案）
- 实现优先级（是否在本 map 范围内实现，还是作为后续 map）
- 对现有架构的影响范围

## Resolution

### 核心定位

Ontology 不是独立系统——它是语义层 DataSource plugin 体系的关系维度。通过 `plugin.relations()` 接口将每个 plugin 的关系声明汇聚为 in-memory 知识图谱，为 NL2SQL 提供 join path 推理和确定性指标执行两条路径。

### 5 项决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | Ontology 定位 | 语义层的关系扩展（非独立系统）。架构同时支持 Level 2（ontology 作为 LLM context）和 Level 2.5（已注册指标走确定性执行路径），实际路由由实验数据决定 |
| 2 | Relations 类型 | `joins`（join key）/ `derived_from`（派生/溯源）/ `related_to`（业务关联）三种基础类型，kind-specific 可扩展 |
| 3 | 实施范围 | Phase 1-3 在本 map（关系声明+图 / NL2SQL集成 / 指标引擎），Phase 4（可视化+自动发现）后续 map |
| 4 | 计算规则格式 | Option C 混合：`sql` 字段提供可执行逻辑（Level 2.5 路径），`metadata` 字段提供结构化描述（Level 2 路径给 LLM） |
| 5 | 与 R1 融合 | `DataSourceKindPlugin.relations()` 接口暴露关系；MetricPlugin 新增 `toExecutableRule()` 返回可执行 SQL 模板 |

### 技术选型

- **In-memory adjacency list**（非图数据库）：百级节点规模完全不需要 Neo4j/RDF
- **YAML 关系声明**：在 DataSource definition 中增加 `relations` 字段
- **Metric = kind plugin**：计算指标是一等公民（图节点），通过 `derived_from` 边连接源表

### 架构影响

```typescript
interface DataSourceKindPlugin<T> {
  kind: string
  schema: ZodSchema<T>
  toCorpusItem(def: T): CorpusItem
  toPromptContext(def: T): string
  toCriticContext?(def: T): CriticFields
  relations(def: T): RelationDef[]       // ← ontology 融合点
  toExecutableRule?(def: T): string|null // ← Level 2.5（仅 MetricPlugin）
}
```

### 2026 前沿依据

- Cube.dev (2026): "agent selects from governed set" — governed selection 模式
- Palantir AIP (2026): "Ontology as Runtime — Object is live, property is computed"
- 业界共识：2025-2026 是 metric-governance wave，metrics 为一等公民实体
- 架构支持两条路径符合"实验驱动"原则，不提前押注
