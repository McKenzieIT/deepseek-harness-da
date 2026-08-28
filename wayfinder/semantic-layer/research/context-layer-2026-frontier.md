# Context Layer 2026 前沿参考文档

> 本文档沉淀 2026 年 6-8 月关于 Context Layer 的行业研究成果，作为 dsh-data-agent 语义层架构决策的长期参考。

---

## 1. 定义：什么是 Context Layer

### Forrester 正式定义（2026 年 6 月报告）

> "A context layer is **the next evolution of semantic layers and knowledge graphs**, providing the foundation for **neurosymbolic AI** context engineering and agentic AI applications."

> "The context layer represents **all enterprise knowledge** across data, metadata, business concepts, policies, and processes through **graph-based ontologies** and dynamic semantic representations."

### Gartner 定义（2026 Impact Radar）

Gartner 将 "AI Context Platforms" 列为 2026 Impact Radar 品类：

> 为 AI agent 提供治理的含义和信任信号（governed meaning and trust signals），在 agent 行动的那一刻交付 context。

### 与 Semantic Layer 的关系

| 层 | 回答的问题 | 包含内容 |
|---|---|---|
| **Semantic Layer**（2020-2024） | "数据的业务含义是什么？" | 指标定义、维度、join 规则 |
| **Knowledge Graph**（传统） | "实体间如何关联？" | 节点、边、推理规则 |
| **Context Layer**（2026） | "AI agent 做决策需要知道什么？" | 上述全部 + glossary + policies + trust + lineage + memory |

Context Layer **不取代** semantic layer 或 knowledge graph——它**统一**两者，并增加治理/信任/记忆维度。

---

## 2. 核心组件

基于 OpenMetadata 2.0 / Atlan / Forrester 的综合，一个完整 context layer 包含：

| 组件 | 职责 | dsh-data-agent 对应 |
|------|------|-----|
| **Metadata Catalog** | 什么数据存在（schema、表、列） | ✅ SemanticLayerService + definitions |
| **Ontology / Typed Relationships** | 数据意味着什么（概念、关系） | ✅ RelationGraph (joins/derived_from/related_to) |
| **Business Glossary / Terminology** | 业务词汇→系统标识符映射 | ⚠️ 扁平 terminology.yaml → 待迁入 definition aliases |
| **Metrics Layer** | 标准化指标计算 | ✅ MetricKindPlugin + execute_metric |
| **Trust Signals** | 认证状态、数据新鲜度、质量分 | ⚠️ eval evidence（pass_rate）覆盖质量；缺认证/新鲜度 |
| **Lineage** | 数据血缘（表→表、列→列） | ✅ derived_from relations（表级）；缺列级 |
| **Policies / Governance** | 访问控制、使用建议 | ✅ dsh-admin（访问控制）；缺使用建议 |
| **Organizational Memory** | 跨 session 的累积知识 | ⚠️ goal 机制（session 内）；缺跨 session 记忆 |

---

## 3. 关键产品/框架（2026.08）

### 3.1 OpenMetadata 2.0 — "The Open Context Layer for AI Agents"

- **发布**：2026 年 8 月 25 日
- **架构**：Context（元数据）+ Ontology（业务概念+关系）+ Glossary（统一到 ontology 组件中）
- **新增**：Organizational Memory（Apache 2.0 开源）
- **核心主张**：Agent is only as reliable as the context it's built on
- **URL**: https://blog.open-metadata.org/announcing-openmetadata-2-0-the-open-context-layer-for-ai-agents-83b8ce8b9dde

### 3.2 Atlan — "Context Layer for AI"

- **定位**：独立 context layer（非特定 agent 框架绑定）
- **核心能力**：Context Agents 自动从现有系统 bootstrap context；Enterprise Data Graph 统一 data + meaning + terms
- **Business glossary 定位**：certified glossary 是 ontology 的一部分，所有 agent 读取同一定义
- **Gartner 认可**：AI Context Platform category
- **URL**: https://atlan.com/know/ai-agent/data-for-ai/enterprise-knowledge-layer-for-ai/

### 3.3 Jedify — Context Graph（实证 benchmark）

- **发布**：2026 年 8 月 26-27 日 benchmark 报告
- **核心创新**：context graph pre-encodes business logic (definitions + terminology + relationships)，替代暴露全量 schema 给 LLM
- **实测结果**：
  - 87% SQL 准确率（200 次评分运行）
  - 25,036 tokens/request vs CHESS 基线 339,965 tokens = **14x 压缩**
  - 75% token 成本降低
- **机制**：图中存储 terminology + joins + business logic → 每次查询只投射相关子图
- **对 dsh-data-agent 的启示**：RelationGraph + terminology 统一编码 → NL2SQL 前先 graph-resolve → 只投射子图
- **URL**: https://finance.yahoo.com/technology/ai/articles/jedify-benchmark-shows-context-graphs-130000573.html

### 3.4 Fluree — W3C 标准 Knowledge Graph for AI

- **定位**：用 W3C 标准（RDF/OWL/SKOS/JSON-LD）建模 semantic layer
- **Vocabulary 处理**：SKOS（Simple Knowledge Organization System）建模术语/概念层级
- **核心主张**：Semantic layer tools must govern MEANING, not just metrics
- **URL**: https://flur.ee/compare/semantic-layer-tools

### 3.5 Forrester 2026.06 报告 "Make Data AI Ready Via Semantic Layer Platforms"

- **核心论点**：Strong semantic layer 是 GenAI enterprise-ready 的必要条件
- **对 context layer 的定位**：Standardizes metrics + accelerates queries + enforces governance + makes GenAI enterprise-ready
- **URL**: https://www.facebook.com/StrategySoftware/posts/forresters-june-2026-report-make-data-ai-ready-via-semantic-layer-platforms-give/1518509406984761/

### 3.6 Martin Fowler — "Making Data Ready for Agentic AI"（2026.08）

- **核心章节**："The Context Layer: Teaching Agents What Your Data Means"
- **GraphRAG 提及**：Microsoft GraphRAG（community detection for abstract queries）+ Graphiti（temporally aware KG）
- **论点**：Semantic layers provide explicit context AI agents need as PRIMARY consumers
- **URL**: https://martinfowler.com/articles/making-data-ready-for-agentic-ai.html

---

## 4. 行业趋势总结

### 4.1 融合趋势：从分离到统一

```
2020-2024:  Semantic Layer ←→ Knowledge Graph ←→ Glossary ←→ Catalog（各自独立）
2025:       Semantic Layer + KG 开始融合（如 dbt + Atlan integration）
2026:       Context Layer = 全部统一为一个 graph-based platform
```

### 4.2 Terminology/Glossary 的演进

```
旧：扁平字典 / 独立 glossary service（如 DataHub glossary、Alation glossary）
新：Ontology 的一等组件（节点属性或 SKOS concept hierarchy），图可查
```

### 4.3 核心设计原则（从多个来源提炼）

1. **Graph-native**：所有 context（schema + relations + terminology + policies）存储为统一图
2. **Projection-based**：不暴露全量，按需投射相关子图给消费者（Jedify 的 14x token 压缩）
3. **Active, not passive**：context 不是静态文档，而是 AI agent 自动发现/丰富/维护
4. **Governed**：trust signals / certification / access control 是 context 的一部分
5. **Memory-enabled**：跨 session 的 organizational memory（OpenMetadata 2.0 的核心新增）

### 4.4 对 NL2SQL 的具体影响

| 方法 | Tokens/query | SQL 准确率 | 来源 |
|------|---|---|---|
| 全量 schema dump（CHESS baseline） | 339,965 | ~60-70% | PureAI 2026.08 |
| Context graph + terminology pre-encoded | 25,036 | 87% | Jedify 2026.08 |
| Semantic layer + graph-expanded recall | - | 100%（结构性） | dsh P3（K11） |

---

## 5. 对 dsh-data-agent 的架构启示

### 已做对的

1. **RelationGraph + graph-expanded recall**（P3）= Jedify 思路的早期版本
2. **AI-native enrichment**（G3/F1）= Atlan "Context Agents" 方向
3. **管理 agent + eval 自驱循环**（W6/W13）= "Active metadata" 方向
4. **不引入独立图数据库**（R2/G2）= context layer 集成式方向

### 需要演进的

1. **Terminology 统一到 ontology**（R7 方案 D）— 最直接的对齐动作
2. **Context projection 统一**（未来）— 当前 toCorpusItem/toPromptContext/toCriticContext 分离 → 未来考虑 unified `project(viewConfig)`
3. **Domain/Concept 作为图节点**（Not yet specified）— 当前 domains 是 definition 的 string[] 属性，未来可提升为图节点（concept → assets 关系）
4. **Trust signals 丰富**（Not yet specified）— 认证状态、数据新鲜度、使用频率（eval evidence 覆盖质量分）
5. **Organizational memory**（v2+）— 跨 session 的管理 agent 累积知识

### 优先级建议

| 项 | 紧迫性 | 理由 |
|---|---|---|
| R7 方案 D（terminology aliases） | **高** | 直接提升检索+NL2SQL 质量；低成本 Phase 1 |
| R8 push subscription | **中** | UX 改善；与 ③ 自驱循环配合 |
| Domain 作为图节点 | **低** | v2 方向；当前 string[] 够用 |
| Context projection 统一 | **低** | 架构演进方向；当前三接口不阻塞功能 |
| Organizational memory | **低** | v2+；当前 goal 机制够用 |

---

## 6. 术语对照表

| 2026 前沿术语 | dsh-data-agent 对应 | 备注 |
|---|---|---|
| Context Layer | SemanticLayerService + RelationGraph + EvalEvidence | 部分覆盖 |
| AI Context Platform | dsh-data-agent 整体 | 定位对齐 |
| Context Graph | RelationGraph | 需扩展（加 terminology） |
| Business Glossary | terminology.yaml | 待迁入 definition schema |
| Context Agents | 管理 agent（semantic-layer-management preset） | 对齐 |
| Organizational Memory | goal + eval evidence（session 内） | 跨 session 缺失 |
| Trust Signals | eval pass_rate / delta | 缺认证、新鲜度 |
| Context Projection | toCorpusItem / toPromptContext / toCriticContext | 分离→未来统一 |
| SKOS (vocabulary) | terminology aliases | 不需要完整 SKOS；aliases 足够 |
