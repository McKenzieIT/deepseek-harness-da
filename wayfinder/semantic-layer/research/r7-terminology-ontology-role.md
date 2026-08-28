# R7 — Terminology 挂载点：前沿调研 + 代码分析

## 1. 2026 前沿调研：Context Layer 与 Terminology 的关系

### 1.1 Forrester "Context Layer" 定义（2026 年 6 月报告）

Forrester 于 2026 年 6 月正式提出 context layer 定义：

> "A context layer is the next evolution of semantic layers and knowledge graphs, providing the foundation for neurosymbolic AI context engineering and agentic AI."

> "The context layer represents **ALL enterprise knowledge** across data, metadata, **business concepts**, policies, and processes through **graph-based ontologies**."

关键洞察：context layer **不等于** semantic layer。它是 semantic layer + knowledge graph + business glossary + policies 的**统一图结构**。Business terminology/glossary 被明确纳入 graph-based ontology，而非独立的平面字典。

来源：[Forrester context layer definition](https://blog.getcollate.io/forrester-context-layer-definition-memory)、[LinkedIn 讨论](https://www.linkedin.com/posts/bevelson_the-next-evolution-of-ai-will-rely-on-context-activity-7496588332731232256-VKnJ)

### 1.2 OpenMetadata 2.0 — "The Open Context Layer for AI Agents"（2026 年 8 月）

OpenMetadata 2.0 三层架构：

| 层 | 职责 |
|---|---|
| **Context** | 定义什么数据存在（元数据目录） |
| **Ontology** | 定义数据意味着什么——通过**业务概念和类型化关系**（typed relationships）让 agent 理解数据 |
| **Glossary** | 业务术语定义——作为 ontology 的**一等组件** |

Breaking changes（1.13→2.0）显示 "Glossary/ontology, classification & tags" 作为核心架构组件统一重构。Glossary 不再是独立附属，而是 ontology 的有机组成部分。

来源：[OpenMetadata 2.0 公告](https://blog.open-metadata.org/announcing-openmetadata-2-0-the-open-context-layer-for-ai-agents-83b8ce8b9dde)、[Breaking Changes](https://openmetadatastandards.org/breaking-changes/)

### 1.3 Atlan Context Layer — "Certified Business Glossary as Ontology"

Atlan 的 context layer 架构：

> "Certified business glossary and ontology: shared definitions for terms like 'customer' or 'opportunity,' read the same way **regardless of which agent asks**."

> "Atlan unifies your data, business knowledge, and the **meaning behind your terms** into one **Enterprise Data Graph** that gives every team and every AI agent the same context."

Gartner 2026 Impact Radar 将 "AI context platforms" 列为一个品类——包含 ontology、glossary、lineage 的统一治理。

来源：[Enterprise Knowledge Layer](https://atlan.com/know/ai-agent/data-for-ai/enterprise-knowledge-layer-for-ai/)、[Agentforce vs Context Layer](https://atlan.com/know/ai-agent/ai-agent-applications/agentforce-vs-independent-context-layer/)、[Gartner AI Context Platform](https://atlan.com/know/ai-agent/context-layer/gartner-impact-radar-ai-context-platform/)

### 1.4 Jedify Context Graph — 实证：图编码 terminology 提升 SQL 精度（2026 年 8 月）

Jedify 的 benchmark 论证了将 terminology 编码进图的**实测收益**：

> "A context graph **pre-encodes your business logic, including definitions, relationships, and terminology**."

实测数据：
- **87% SQL 准确率**（200 次评分运行），使用 context graph
- **25,036 tokens/request**（vs CHESS 基线 339,965 tokens）——14x 压缩
- 核心机制：不把整个 schema 暴露给 LLM，而是用 context graph 预编码业务逻辑+术语+关系，只投射相关子图

关键洞察：terminology 编码进图不是架构纯洁性问题——它带来**可测量的准确率提升 + token 效率提升**。

来源：[Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/jedify-benchmark-shows-context-graphs-130000573.html)、[Blocks&Files](https://www.blocksandfiles.com/ai-ml/2026/08/27/context-grapher-jedify-cuts-ai-token-costs-75-percent/5293003)、[PureAI](https://pureai.com/articles/2026/08/26/enterprise-ai-has-a-token-problem.aspx)

### 1.5 Martin Fowler — "Making Data Ready for Agentic AI"（2026 年 8 月）

> "The Context Layer: Teaching Agents What Your Data Means. Semantic layers provide the explicit context AI agents need when they become the primary consumers of your data."

将 semantic layer、knowledge graph、GraphRAG、business meaning 统一为 agentic AI 的基础设施层。

来源：[martinfowler.com](https://martinfowler.com/articles/making-data-ready-for-agentic-ai.html)

### 1.6 Fluree — W3C 标准建模 Vocabulary（SKOS）

Fluree（2026 年 semantic layer 工具对比中的领先者）：

> "Entities, typed relationships, hierarchies, and **vocabulary**, modeled in W3C standards (**RDF, OWL, SKOS**, JSON-LD) on a knowledge graph."

SKOS（Simple Knowledge Organization System）专门用于建模术语/词汇/概念层级——这是 W3C 对"terminology 如何入图"的标准答案。

来源：[Fluree Semantic Layer Tools](https://flur.ee/compare/semantic-layer-tools)

---

## 2. 行业共识总结

| 维度 | 2024 年前（旧模式） | 2026 年共识（新模式） |
|------|-----|------|
| Terminology 定位 | 独立字典/glossary 服务 | Ontology/context graph 的一等组件 |
| 架构 | Semantic layer + 独立 glossary | Context layer = semantic + KG + glossary + policies（统一图） |
| 与 agent 的关系 | 检索增强（recall improvement） | 推理基础（reasoning foundation）——agent 通过图理解概念 |
| 收益 | 仅提升检索召回 | 准确率 + token 效率 + 可审计 + 跨 agent 一致性 |
| 标准 | 无 | SKOS（W3C 词汇建模）、OWL（ontology） |

**共识结论**：2026 年的前沿实践中，terminology/glossary **IS** ontology 的组成部分，不是独立系统。将其编码进知识图谱是行业方向，且有实证数据支持。

---

## 3. 当前 dsh-data-agent 代码分析（保留）

### 3.1 当前实现

- `terminology.yaml`：扁平字典（术语→事件名映射）
- 消费方式：`loadRetrievalCorpusAll()` → `eventKindPlugin.toCorpusItem(def, terminology)` → BM25 corpus enrichment
- 仅影响检索（recall），不影响 prompt context、critic、或 NL2SQL 推理

### 3.2 当前局限

- Terminology 仅丰富 event 检索 corpus——table/metric 完全不消费
- NL2SQL prompt (`nl2sql-engine/src/prompt.ts`) 有 `lookup_terminology` 引用但未统一接入
- 与 RelationGraph 完全割裂——图查询无法利用术语关系做推理扩展
- 不符合 context layer 的统一图模型

---

## 4. 修订后推荐方案

### 推荐：方案 D — Ontology 节点属性 + 图索引（对齐前沿，渐进实现）

基于 2026 前沿研究，推荐一个**对齐行业方向但匹配当前架构**的方案：

**核心设计**：Terminology 作为数据源节点的属性（`aliases: string[]`）存储在 definition 中，同时在 RelationGraph 中建立**反向索引**供图查询使用。

```typescript
// 1. Definition 层面：aliases 作为节点属性
interface EventDefinition {
  name: string
  // ... existing fields
  aliases?: string[]  // "dau", "登录", "日活" — 直接在定义中声明
}

// 2. Graph 层面：反向索引 (alias → source_id) 用于检索+推理
graph.resolveAlias('dau')        // → 'role.online'
graph.getAliases('role.online')  // → ['dau', '登录', '日活']

// 3. 消费层面：toCorpusItem 从定义自身读取 aliases，无需外部传参
toCorpusItem(def) {
  // def.aliases 已经在定义中，不需要 terminology? 参数
}
```

### 为什么不是之前的三个方案

| 方案 | 问题 |
|------|------|
| A (全局 service) | 与 context layer 统一图的方向背离——仍然是独立系统 |
| B (显式传参) | 当前可用但不符合前沿——无法支撑图查询/推理/跨 agent 一致性 |
| C (relation type) | 粒度对但实现过重——`alias_of` 作为独立边会膨胀图 |
| **D (节点属性+索引)** | 兼顾：定义内聚 + 图可查 + 不污染关系边 + 渐进实现 |

### 对齐 Jedify 模式

Jedify 的 context graph 核心是"pre-encode business logic"——在查询前就把术语关系编码进图，只投射相关子图给 LLM。方案 D 的 `graph.resolveAlias()` 实现了同样的效果：NL2SQL 引擎查询前先通过图解析术语 → 定位相关数据源 → 只投射该子图的 prompt context。

### 实现路径（渐进）

1. **Phase 1（低成本）**：在 `EventDefinition`/`TableDefinition` schema 中加 `aliases?: string[]` 字段；`toCorpusItem` 从 `def.aliases` 读取而非外部 `terminology?` 参数
2. **Phase 2**：RelationGraph 增加 alias 反向索引（`resolveAlias(term) → nodeId`）；NL2SQL 引擎查询前先 resolve 术语
3. **Phase 3**：迁移 `terminology.yaml` 数据到各 definition 的 `aliases` 字段（AI enrichment 可自动填充）

### 对 G2 Relations 体系的影响

**不新增 relation type**。Aliases 是**节点属性**（property of the node），不是节点间的边。这保持了 G2 三种 relation type（joins/derived_from/related_to）的语义纯度，同时让 terminology 成为 ontology 的有机部分。

类比 OpenMetadata 2.0 的模型：glossary term 是节点的一个 aspect（属性切面），不是独立的 relation edge。

---

## 5. 总结

| 维度 | 旧结论（纯代码视角） | 新结论（前沿对齐） |
|------|-----|------|
| Terminology 定位 | 检索增强，不纳入 ontology | Ontology 的有机组成（节点属性），兼做检索+推理 |
| 挂载方式 | 维持显式传参 | 迁入 definition schema（aliases 字段）+ 图索引 |
| 行业对齐 | — | Forrester context layer / OpenMetadata 2.0 / Atlan / Jedify / SKOS |
| 实测收益 | 仅 recall | Jedify 证明：图编码术语 → 87% SQL 准确率 + 14x token 压缩 |
| 实现成本 | 0 | Phase 1 低（加字段），Phase 2/3 中等 |
| G2 影响 | 无 | 无——节点属性，不动关系边 |
