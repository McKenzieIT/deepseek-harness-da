# CL-2 — Domain/Concept 作为图节点（ConceptKindPlugin）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: closed (resolved 2026-08-29)
**Assignee**: claimed (2026-08-29)
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

---

## Resolution (2026-08-29)

决策：引入 ConceptKindPlugin，将 domain/concept 建模为图中的一等节点。

### D1：Concept = 显式一等实体（独立 YAML）

- `concepts/` 目录，每个 concept 一个 YAML 文件
- 声明 name + description + pref_label + alt_labels
- **不含 `related_assets` 字段**——concept→asset 的 `related_to` 边从 asset 侧的 `domains` 字段在图构建时自动派生
- 前沿验证：OpenMetadata 2.0 / Atlan / Jedify / Fluree 统一做法（所有主流 context layer 系统均将 concept 作为显式实体）
- 数据量：K11 仅 10 个 unique domain（即使企业级也在百量级），存储和性能无压力

### D2：`domains: string[]` 保留 + 引用验证

- Asset 上的 `domains: string[]` 字段**原样保留**，零格式迁移（现有 800+ YAML 不改动）
- loadDefinitions 时**严格校验**：domain 值必须匹配已存在的 concept YAML 的 `name` 字段，否则加载报错
- `domains` 是 concept→asset `related_to` 关系的**唯一真相源**（single source of truth）

### D3：Concept 在检索 corpus 中 + graph-expand 支持 `related_to`

- `toCorpusItem` 返回非 null（含 name + description + alt_labels 合并文本）→ concept 可被 BM25 搜索命中
- `expandCandidates`（ontology.ts C3）新增 `related_to` 边展开
- NL2SQL 路径：concept 命中 → graph-expand via related_to → 相关 assets 的 toPromptContext 注入 prompt（concept 本身不注入 SQL prompt）
- 管理 agent 路径：concept 直接可搜索、可通过 concept 聚合覆盖率
- 对齐 Jedify 子图投射机制（concept 作为投射锚点，14x token 压缩的核心）

### D4：零新 tool，泛化现有工具为 registry-driven

- `get_definition` / `edit_definition`：从硬编码 table→event→metric 改为走 DataSourceRegistry kind-agnostic lookup
- `list_domains`：从聚合 asset.domains 改为读取 concept 定义（返回 name + description + alt_labels + asset_count）
- `get_definition(kind='concept')`：附带 related assets 列表（从图的 related_to 边查询）
- 所有 tool description 更新加入 "concept" / "business domain" 关键词
- `get_coverage`：增加可选 `domain?: string` 参数（concept-scoped 覆盖率）
- 不改名：LLM 靠 description 判断工具适用性，名称更改影响面过大

### D5：Concept node id = `concept:` 前缀

- 格式：`concept:付费经济`（零碰撞风险、图遍历可读、aliasIndex 可辨）
- Concept 的 alt_labels 进入统一 aliasIndex（与 asset 级别共存）
- `resolve_term` 返回所有匹配 nodeId，消费者根据 `concept:` 前缀区分层级
- 语义互补：concept alias 命中 → 广召回（整个域的 assets）；asset alias 命中 → 精准匹配

### ConceptDefinition Schema

```yaml
# concepts/付费经济.yaml
name: 付费经济
description: 用户付费行为相关的数据资产域，涵盖充值、消费、订单等
pref_label: 付费经济
alt_labels:
  - 支付
  - 充值
  - 消费
  - 商业化
```

### ConceptKindPlugin 接口

```
kind: 'concept'
storageDir: 'concepts'
getId(raw): `concept:${raw.name}`
schema: ConceptDefinitionSchema (zod)
toCorpusItem(def): {id: 'concept:付费经济', description: 'name + description + alt_labels joined'}
toPromptContext(def): 概念描述 + related assets 列表（人类可读）
toCriticContext: undefined (concept 无 SQL 可 critique)
relations(def): [] (边不由 concept 声明——由 graph builder 扫描 asset.domains 生成)
```

### 毕业实现票

决策锁定，毕业为 CL-2a 实现票（scope：ConceptKindPlugin + concept YAML + 引用验证 + graph-expand related_to + tool 泛化）。
