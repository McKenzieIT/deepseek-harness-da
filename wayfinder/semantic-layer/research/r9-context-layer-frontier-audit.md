# R9 — 2026 Context Layer 前沿审计：现有决策一致性检查

## 审计背景

2026 年 6-8 月，Forrester / Gartner / OpenMetadata / Atlan / Jedify / Martin Fowler 等形成了 **context layer** 共识：

> Context Layer = Semantic Layer + Knowledge Graph + Business Glossary + Policies + Trust Signals + Organizational Memory — 统一为 graph-based ontology，服务于 agentic AI。

本审计将 map 中已落地的决策逐条对照该共识，识别**方向性偏差**（非实现细节差异）。

---

## 1. 对齐的决策（无需调整）

### ✅ R2/G2: "Ontology = 语义层 + relations + in-memory 图，非独立系统"

**前沿对齐**：Forrester 定义 context layer 不是独立图数据库，而是集成在数据基础设施中的统一图。G2 的"非独立系统"方向正确。

### ✅ P3: "Graph-expanded recall（+1-hop DIM，100% vs 20%）"

**前沿对齐**：Jedify benchmark 证明 context graph 提升 SQL 准确率（87%）。P3 的 graph-expanded recall 是同一思路的早期实现，+80pp 提升与 Jedify 结论一致。

### ✅ G3: "AI-Native Enrichment + eval-based confidence gate"

**前沿对齐**：Atlan 的 "Context Agents" 自动从现有系统 bootstrap context。G3 的两轮 AI 发现 + eval gate 是同一方向（AI 驱动的 context 自动丰富 + 质量闭环）。

### ✅ G4/G5/W6: "管理 agent + goal + eval evidence 自驱循环"

**前沿对齐**：OpenMetadata 2.0 引入 "Organizational Memory"，Atlan 有 "Context Agents"。管理 agent 的 goal-driven self-improvement 对齐了 "active metadata"（非被动目录）方向。

### ✅ W1/W11: "SchemaGateway + EvidenceQuery RPC bridge"

**前沿对齐**：Context layer 需要对外投射——让 agent 和 UI 能消费 context。Gateway 模式正确。

---

## 2. 部分偏差的决策（方向对但范围窄）

### ⚠️ G2: "Relations 三类型（joins / derived_from / related_to）"

**当前决策**：三种 relation type 覆盖结构性数据关系。

**前沿对比**：2026 context layer 的 "typed relationships" 不限于结构性数据关系，还包括：
- **语义关系**：business concept → data source（"revenue" 概念 → `dws_pay_order_di` 表）
- **别名关系**：terminology → data source（通过 R7 方案 D 解决——节点属性而非边）
- **信任/治理关系**：owner → asset，certification_status → asset
- **血缘粒度**：column-level lineage（当前仅 table-level）

**评估**：三种 type 作为**结构性关系**是充分的。但 context layer 的 "typed relationships" 范围更广——语义概念映射（domain/concept → assets）目前没有建模路径。

**建议**：不需要现在扩展 relation types，但应在 Not yet specified 中记录"语义概念映射"作为未来方向。当前 `domains` 字段（已在 definition schema 中）已部分覆盖，但作为扁平数组而非图边。

### ⚠️ G1: "DataSourceKindPlugin 接口分离 toCorpusItem / toPromptContext / toCriticContext"

**当前决策**：每个 kind plugin 提供三个独立投射方法，各消费者独立调用。

**前沿对比**：Jedify 的 context graph 是**统一投射**——一个图，按需投射相关子图。不是"检索用一个接口，prompt 用一个接口，critic 用一个接口"，而是"统一 context，消费者按需切片"。

**评估**：这是实现模式差异而非架构错误。三个方法本质上是同一数据源的三种投射视角——它们共享同一个 definition 数据。接口分离保持了类型安全和关注点分离。但未来 context layer 演进时，可能需要一个统一的 `project(def, viewConfig)` 接口。

**建议**：当前无需改动。在 terminology 迁入 definition（R7 方案 D Phase 1）后，三个方法自然都能读取 aliases——消除了当前 toCorpusItem 需要外部 terminology 参数的问题。

---

## 3. 明确偏差的决策（需要更新）

### ❌ R7 Map 条目: "Terminology = 检索增强，不纳入 ontology"

**当前 map 记录**：
> R7 Terminology ontology 角色 — Terminology = 检索增强（非实体关系），维持显式传参（方案 B），不纳入 ontology graph，不新增 relation type

**前沿共识**：Terminology IS ontology 的一等组件（Forrester/OpenMetadata/Atlan/Jedify 统一观点）。

**实际状态**：R7 报告已更新为方案 D（节点属性 + 图索引），但 map 条目仍为旧结论。

**行动**：更新 map 条目以反映修订后的 R7 结论。

### ❌ Missing: Context Layer 整体演进路线

**当前 map 缺失**：map 没有将 dsh-data-agent 的语义层定位为 "context layer" 的演进认知。Destination 描述的是"端到端可用"，但未提及对齐前沿 context layer 架构。

**前沿要求**：2026 context layer = semantic layer + KG + glossary + policies + trust + memory。当前实现覆盖了 semantic layer + KG（部分），但缺失：
- **Terminology/Glossary** 统一到 ontology（R7 方案 D 解决）
- **Trust signals**：认证状态、数据新鲜度、使用频率（部分通过 eval evidence 覆盖）
- **Policies**：访问控制、使用建议（dsh-admin 覆盖访问控制）
- **Organizational Memory**：OpenMetadata 2.0 的核心新增——agent 的跨 session 记忆（当前 goal 机制部分覆盖）

**行动**：在 Not yet specified 中增加 "Context Layer 对齐" fog 条目。

---

## 4. 总结矩阵

| 决策 | 对齐程度 | 行动 |
|------|---------|------|
| R2/G2 Ontology = 语义层扩展 | ✅ 对齐 | 无需调整 |
| G2 三种 relation type | ⚠️ 方向对，范围窄 | 记录"语义概念映射"到 fog |
| G1 KindPlugin 三接口 | ⚠️ 实现模式差异 | 无需改动，R7 Phase 1 后自然消解 |
| P3 Graph-expanded recall | ✅ 对齐 | 无需调整 |
| G3 AI enrichment + eval gate | ✅ 对齐 | 无需调整 |
| G4/G5/W6 管理 agent + 自驱循环 | ✅ 对齐 | 无需调整 |
| R7 Terminology 不入 ontology | ❌ 偏差 | 更新 map 条目 |
| Missing: Context layer 演进认知 | ❌ 缺失 | 增加 fog 条目 |

---

## 5. 来源

- [Forrester context layer 定义](https://blog.getcollate.io/forrester-context-layer-definition-memory)（2026.08）
- [OpenMetadata 2.0: Open Context Layer for AI Agents](https://blog.open-metadata.org/announcing-openmetadata-2-0-the-open-context-layer-for-ai-agents-83b8ce8b9dde)（2026.08）
- [Atlan: Enterprise Knowledge Layer for AI](https://atlan.com/know/ai-agent/data-for-ai/enterprise-knowledge-layer-for-ai/)（2026.08）
- [Jedify: Context Graph cuts tokens 75%, 87% SQL accuracy](https://finance.yahoo.com/technology/ai/articles/jedify-benchmark-shows-context-graphs-130000573.html)（2026.08）
- [Martin Fowler: Making Data Ready for Agentic AI](https://martinfowler.com/articles/making-data-ready-for-agentic-ai.html)（2026.08）
- [Gartner 2026 Impact Radar: AI Context Platforms](https://atlan.com/know/ai-agent/context-layer/gartner-impact-radar-ai-context-platform/)（2026.08）
- [Fluree: Semantic Layer Tools with SKOS vocabulary](https://flur.ee/compare/semantic-layer-tools)（2026.08）
- [Ontology-driven semantic layer for enterprise AI agents](https://clawaws.com/blog/ontology-driven-semantic-layer-enterprise-ai-agents/)（2026.08）
