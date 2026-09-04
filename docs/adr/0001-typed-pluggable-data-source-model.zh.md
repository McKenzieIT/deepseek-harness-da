# ADR-0001:类型化可插拽数据源模型

[English](0001-typed-pluggable-data-source-model.md) | 中文

**状态**:Accepted(2026-08-21)
**上下文**:semantic-layer map,G1 ticket

## 决策

语义层采用**类型化可插拔(typed pluggable)**架构:每种数据源 kind(event、table、未来 kinds)是一个 `DataSourceKindPlugin<T>`,拥有自己的 zod schema,同时共享一个统一的、与 kind 无关的检索语料层。

## 上下文

语义层需支持多种数据源 kind(当前 events + tables,未来可能 Excel/API/stream)。两种可行方案:

- **A(统一抽象)**:一个 `DataSourceDefinition` + `kind` 判别字段 + 一个 `metadata: Record<string, unknown>` 袋,装 kind 特定字段。
- **B(类型化可插拔)**:每种 kind 有自己的完整 schema + 一个 plugin 接口,把它投影到共享抽象(corpus items、prompt text、critic fields)。

## 后果

### 选定:B(类型化可插拔)

- 每个 `DataSourceKindPlugin<T>` 拥有:`schema`(zod)、`toCorpusItem`、`toPromptContext`、`toCriticContext?`、`relations?`
- 检索层(BM25/hybrid)索引 `CorpusItem = { id, description, metrics, payload }` —— 与 kind 无关
- NL2SQL critic 接收从各 kind 的 `toCriticContext()` 聚合而来的 `CriticFields` —— 引擎代码无 per-kind 分支
- 新增 kind 成本约 50 行 plugin 代码;现有 kinds(event、table)包裹其现有 zod schema

### 为何不选 A

- TypeScript 安全性损失:`metadata: Record<string, unknown>` 无类型;每个消费者需 `kind`-switch + cast
- NL2SQL critic 已消费 type-specific 结构(event 的 `params_fields`、table 的 `partitions`)—— 强行塞进通用袋只增加间接层,无价值
- 检索层**已是**与 kind 无关(`EventCorpusItem`),所以 A 的"统一"收益已由共享 `CorpusItem` 投影实现

### 本体(ontology)集成

每个 plugin 可选暴露 `relations()` 返回 `RelationDef[]`。加载时把所有定义的所有 relation 收集进一个内存邻接表,提供 `findJoinPath` 和 `getRelated` API 供 NL2SQL join 推理。当前规模(数百定义、数千 relation)无需图数据库。
