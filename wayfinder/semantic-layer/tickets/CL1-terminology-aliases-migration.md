# CL-1 — Terminology 统一到 Definition Schema（R7 方案 D 实现）

**Type**: task (AFK, 三阶段)
**Phase**: context-layer-alignment
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Blocks**: [CL-2](CL2-concept-kind-plugin.md)（CL-1 验证图扩展模式后 CL-2 跟进）
**Related**: [R7](../research/r7-terminology-ontology-role.md)（前沿调研）、[G2](G2-ontology-role-decision.md)（ontology 决策）、[P2](P2-ontology-relations-graph.md)（RelationGraph）

## Question

将 terminology 从独立扁平文件（`terminology.yaml`）统一到 definition schema 中，作为 ontology 的一等组件。对齐 2026 context layer 共识（Forrester/Jedify/OpenMetadata 2.0）。

## 三阶段实现

### Phase 1：Definition schema 加 aliases 字段

1. `EventDefinition` / `TableDefinition` / `MetricDefinition` 的 Zod schema 增加 `aliases?: string[]`
2. `eventKindPlugin.toCorpusItem(def)` 从 `def.aliases` 读取别名注入 corpus，**不再需要外部 `terminology?` 参数**
3. `tableKindPlugin.toCorpusItem(def)` 同理支持 aliases（当前完全忽略 terminology）
4. `DataSourceKindPlugin<T>` 接口中 `toCorpusItem` 签名简化：移除 `terminology?` 参数
5. `SemanticLayerService.loadRetrievalCorpusAll()` 不再 loadTerminology + parseTerminology
6. 保留 `terminology.yaml` 兼容加载（Phase 3 迁移完成后移除）

### Phase 2：RelationGraph 反向索引

1. `RelationGraph` 增加 `aliasIndex: Map<string, string>`（alias → nodeId）
2. 新增方法：`resolveAlias(term: string): string | undefined`
3. 新增方法：`getAliases(nodeId: string): string[]`
4. `buildGraph()` 时从所有 definition 的 aliases 字段构建索引
5. NL2SQL 引擎查询前调用 `graph.resolveAlias()` 解析用户术语 → 定位相关数据源 → 投射子图

### Phase 3：数据迁移

1. 将 `examples/k11-semantic-layer/terminology.yaml` 的 `maps_to` 数据迁移到对应 event definition 的 `aliases` 字段
2. AI enrichment（G3/F1 机制）自动为新 definition 填充 aliases
3. 移除 `loadTerminology` / `parseTerminology` 代码路径
4. 移除 `terminology.yaml` 文件

## 验收

- [ ] Phase 1：`toCorpusItem(def)` 无 terminology 参数，aliases 从 def 读取；现有 registry tests 通过
- [ ] Phase 2：`graph.resolveAlias('dau')` → `'role.online'`；NL2SQL 集成测试通过
- [ ] Phase 3：`terminology.yaml` 删除，所有 aliases 在 definition 中；K11 eval 无 regression

## 对齐前沿

- **Jedify**：context graph pre-encodes terminology → 子图投射（Phase 2 的 resolveAlias 实现同等效果）
- **OpenMetadata 2.0**：glossary = ontology 一等组件（aliases 在 definition 中 = 节点属性）
- **SKOS**：vocabulary as graph-queryable（反向索引 = 图可查）
