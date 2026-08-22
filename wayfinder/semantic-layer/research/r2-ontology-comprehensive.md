# R2 — Ontology / 知识图谱全面调研

## 1. 基本概念

### 什么是 Ontology（本体）

Ontology 是对某个领域中的**概念、属性和关系**的形式化、显式的规范说明。它回答：「这个领域里有哪些东西？它们之间怎么关联？」

与传统数据模型的区别：
- **ER 模型**：描述数据怎么存（schema for storage）
- **语义层**：描述数据是什么含义（schema for understanding）
- **Ontology**：描述概念间的关系和推理规则（schema for reasoning）

### 什么是知识图谱（Knowledge Graph）

知识图谱 = Ontology（schema 层）+ 实例数据（instance 层）。

- **Ontology**：定义「有哪些类型的实体、它们之间有什么关系」（如：User →plays→ Game，Event →belongs_to→ Domain）
- **Knowledge Graph**：在 ontology 基础上填入具体实例（如：user_123 plays K11，role.online belongs_to 用户活跃域）

### 核心概念

| 概念 | 含义 | 数据分析中的映射 |
|------|------|-----------------|
| **Class/Entity** | 实体类型 | 表、事件、指标、维度 |
| **Property/Attribute** | 实体的属性 | 列、字段、参数 |
| **Relation/Edge** | 实体间的关系 | join key、派生关系、belongs_to |
| **Instance** | 实体的具体实例 | dws_pay_order_di、role.online |
| **Inference/推理** | 从已知关系推导新知识 | 通过 join path 推导两表可关联 |

### 常见表达形式

| 形式 | 特点 | 适用场景 |
|------|------|---------|
| **RDF/OWL** | W3C 标准，三元组（主-谓-宾），强推理 | 学术/医药/政府大型知识库 |
| **Property Graph** | 节点+边+属性，Neo4j 原生 | 社交网络、欺诈检测 |
| **JSON-LD** | JSON 兼容的 linked data | Web API、轻量集成 |
| **YAML/JSON 声明式** | 简单键值对声明关系 | 应用内轻量 ontology |

## 2. 与语义层的关系

### 两者的职责对比

| 维度 | 语义层 (Semantic Layer) | Ontology/知识图谱 |
|------|------------------------|-------------------|
| 核心问题 | 「有什么数据？每个字段什么含义？」 | 「数据之间怎么关联？概念怎么推导？」 |
| 数据结构 | 扁平目录（per-table/event 独立描述） | 图结构（节点 + 边） |
| 用途 | 检索/发现、schema grounding | 关系推理、join 发现、指标溯源 |
| 举例 | "dws_pay_order_di 有 user_id, pay_amt, ds 列" | "dws_pay_order_di.user_id JOIN ods_login.user_id" |
| 维护方式 | per-entity YAML | 关系声明（可在 YAML 中附加） |

### 结论：互补的两层，可融合

- 语义层 = 图的**节点属性**（每个数据源的描述）
- Ontology = 图的**边**（数据源之间的关系）
- **融合路径**：在现有语义层 definition 中增加 `relations` 声明 → 构建轻量知识图谱

这不是二选一，而是**语义层 + 关系声明 = 轻量应用级 ontology**。

## 3. 业界实践

### Palantir Foundry — 操作性 Ontology

Palantir 的核心差异化是其 Ontology Layer：
- **Object Type**：类似 Class（如 Aircraft、Mission、Supply）
- **Link Type**：Object 之间的关系（如 Aircraft →assigned_to→ Mission）
- **Action Type**：可在 Object 上执行的操作（不只描述，还驱动行动）
- **特点**：不是纯描述性——ontology 直接绑定到操作（批准、调度、分配），是「from describing to driving execution」
- **代价**：学习曲线陡峭，需要 Forward Deployed Engineer 驻场建模

**对 dsh-data-agent 的启示**：Ontology 不应只是被动描述，可以绑定到 agent 的行为（如：知道 DAU 的计算公式 → 直接生成对应 SQL）。

### DataHub (LinkedIn) — Metadata Graph

- **模型**：统一的 Entity + Aspect + Relationship
- **Entity**：任何数据资产（dataset、dashboard、pipeline、user）
- **Aspect**：entity 的属性切面（schema、ownership、lineage、glossary terms）
- **Relationship**：entity 间的边（produces、consumes、downstream_of）
- **实现**：基于图存储（originally Neo4j → 迁移到自研），支持 lineage 推理
- **特点**：metadata-first，关系是 first-class citizen

**对 dsh-data-agent 的启示**：Relationship 作为一等公民存储；lineage 自动发现有价值。

### Apache Atlas — Type System

- **核心**：TypeDef 体系（ClassificationType、EntityType、RelationshipType）
- **EntityType**：定义实体结构（hive_table、hive_column、sqoop_process）
- **RelationshipType**：定义实体间关系（table_columns、process_inputs/outputs）
- **特点**：静态类型系统，通过 Kafka hook 自动采集元数据
- **局限**：过重（需要 Atlas server + Kafka + Solr），设计偏 Hadoop 生态

**对 dsh-data-agent 的启示**：Type System 思路可借鉴（plugin 注册新 type），但不需要 Atlas 的重型基础设施。

### Atlan — Active Metadata

- **理念**：metadata 不是静态文档，而是活跃的、可驱动行为的
- **特点**：自动 lineage、business glossary、data quality signals、AI-driven discovery
- **Agentic Data Catalog**：告诉 AI agent「哪个表是认证的、多新鲜、谁负责、最佳分析师怎么查」

**对 dsh-data-agent 的启示**：metadata 应该是 agent 的 context——不只是 schema，还包括信任度、使用频率、所有者。

### dbt — 纯 Semantic Layer（无 Ontology）

- **模型**：Metric + Dimension + Entity，强 YAML schema
- **关系**：仅通过 SQL join 隐式表达，无显式关系图谱
- **局限**：
  - 无法直接表达「表 A 和表 B 通过 user_id 关联」
  - 无指标派生链的形式化表达
  - NL2SQL agent 需要自己推断 join path（容易 hallucinate）

**对 dsh-data-agent 的启示**：dbt 证明纯 semantic layer 不够——需要显式关系才能支持复杂查询。

## 4. 对 NL2SQL 的具体价值

### 4.1 Join Path 推理（最高价值）

**问题**：用户问「付费用户的次日留存率」→ 需要 join pay_order 和 login 两张表。LLM 如果不知道 join key 是什么，会 hallucinate。

**Ontology 解法**：声明 `dws_pay_order.user_id →joins→ ods_login.user_id`，NL2SQL 引擎查询关系图获取合法 join path。

**价值量化**：业界报告 Text-to-SQL 在多表 join 场景准确率下降 30-50%，知识图谱辅助可恢复大部分。

### 4.2 指标派生链

**问题**：用户问「DAU」，但语义层里可能没有叫「DAU」的表——它是一个**计算指标**。

**Ontology 解法**：声明 `DAU = COUNT(DISTINCT user_id) FROM ods_login WHERE ds = '{date}'`，ontology 编码计算规则 → agent 直接生成 SQL。

### 4.3 检索增强（Schema Linking 扩展）

**问题**：BM25 只能匹配关键词。用户问「收入」，BM25 找到 pay_order，但找不到 refund_order（退款也影响收入）。

**Ontology 解法**：声明 `revenue →derived_from→ [pay_order, refund_order]`，检索时通过关系图扩展召回。

### 4.4 多步推理

**问题**：「K11 鲸鱼用户（充值 > 1000）的社交行为分析」→ 需要先在 pay_order 筛选大R用户，再关联 social_event 表。

**Ontology 解法**：关系图知道 pay_order 和 social_event 都有 user_id，且 pay_order 有 pay_amt 可做筛选。

## 5. 技术选型

### 评估矩阵

| 方案 | 适用规模 | 推理能力 | 实现复杂度 | dsh-data-agent 适用度 |
|------|---------|---------|-----------|---------------------|
| **Neo4j/ArangoDB** | 百万+节点 | 强（Cypher 查询、路径算法） | 高（需独立服务） | ❌ 过重 |
| **RDF + SPARQL** | 任意 | 最强（OWL 推理） | 极高 | ❌ 学术级 |
| **In-memory adjacency** | 千级节点 | 中（BFS/DFS 路径） | 低 | ✅ 完美匹配 |
| **YAML 声明 + 构建时编译** | 千级节点 | 中 | 低 | ✅ 完美匹配 |

### 推荐：YAML 声明 + In-memory Graph

dsh-data-agent 的数据量级（百级表/事件、千级关系）**完全不需要图数据库**。

```yaml
# 在 table definition 中增加 relations
relations:
  - type: joins
    target: ods_login
    on: user_id = user_id
  - type: derived_from
    target: ods_pay_event
    description: "DWS 汇总自 ODS 支付事件"
```

运行时加载所有 definitions 的 relations → 构建 in-memory adjacency list → 提供 `findJoinPath(tableA, tableB)` 和 `getRelated(table)` API。

## 6. 在 dsh-data-agent 中的推荐路径

### 定位

**轻量应用级 Ontology = 语义层 + 关系声明 + in-memory 图**

不引入新的独立系统，而是在现有语义层架构上叠加关系能力：

### 实施路径（按优先级）

#### Phase 1：关系声明 + 基础图
- 在 DataSource definition 中增加 `relations` 字段
- 支持 3 种关系类型：`joins`（join key）、`derived_from`（派生）、`related_to`（业务关联）
- 构建 in-memory 关系图（adjacency list）
- 暴露 API：`findJoinPath(a, b)`、`getRelated(source)`

#### Phase 2：NL2SQL 集成
- Schema linking 后查询关系图确认 join 合理性
- 多表查询时自动注入 join condition
- Critic 检查 SQL 的 join 是否在关系图中有声明

#### Phase 3：指标计算规则
- 支持 `metric_definition` 关系类型：`DAU = {sql: "COUNT(DISTINCT user_id)", from: "ods_login", filter: "..."}`
- Agent 遇到纯指标查询时直接使用计算规则

#### Phase 4：可视化 + 自动发现
- Web UI 展示关系图谱（DAG view）
- 基于 ODPS 外键/命名约定自动推荐关系

### 成本 vs 收益

| 成本 | 收益 |
|------|------|
| Phase 1：~200 行代码 + 运维零成本 | Join path 推理，减少 hallucination |
| Phase 2：~100 行引擎适配 | 多表查询准确率显著提升 |
| Phase 3：~150 行指标引擎 | 支持计算指标查询（DAU/MAU/留存） |
| 关系维护：per-scope 几十条 | 比维护图数据库简单几个数量级 |

### 核心结论

> Ontology 在 dsh-data-agent 中不需要重型基础设施。它是语义层的自然延伸——在已有的 definition YAML 中增加关系声明，构建 in-memory 图，为 NL2SQL 提供 join path 推理和指标派生能力。这是 Palantir Foundry "operational ontology" 的轻量版：不只描述数据，还驱动 agent 的行为（生成更准确的 SQL）。
