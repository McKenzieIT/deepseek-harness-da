# CL-1 — Terminology 统一到 Definition Schema（R7 方案 D 实现）

**Type**: grilling (HITL) → **已锁定，毕业为 task**
**Phase**: context-layer-alignment
**Status**: closed (resolved)
**Assignee**: mckenzie
**Blocked by**: 无
**Blocks**: [CL-2](CL2-concept-kind-plugin.md)（CL-1 验证图扩展模式后 CL-2 跟进）、[CL-3](CL3-retrieval-strategy-experiment.md)（检索策略实验）
**Related**: [R7](../research/r7-terminology-ontology-role.md)（前沿调研）、[G2](G2-ontology-role-decision.md)（ontology 决策）、[P2](P2-ontology-relations-graph.md)（RelationGraph）

## Question

将 terminology 从独立扁平文件（`terminology.yaml`）统一到 definition schema 中，作为 ontology 的一等组件。对齐 2026 context layer 共识（Forrester/Jedify/OpenMetadata 2.0）。

## Resolution — 5 个设计决策（2026-08-28 grilling 锁定）

### D1：字段结构 — SKOS 对齐双字段

```typescript
pref_label?: string    // SKOS prefLabel：规范业务名称（snake_case 适配）
alt_labels?: string[]  // SKOS altLabel：替代检索标签（纯字符串数组）
```

- **SKOS 对齐**：采用 SKOS 标准命名（`prefLabel` → `pref_label`，`altLabel` → `alt_labels`），snake_case 适配现有 schema 惯例
- **不加 `locale`**：多语言在消费层/scope 层解决，非 per-alias 标记
- **不加 `source`**：别名质量由 eval 驱动，非来源追踪；git 层已覆盖 provenance
- **不加 `hiddenLabel`**：当前无「命中但不展示」的需求；未来按需添加
- **`standard_concept` 归属 CL-2**：terminology.yaml 的 `standard_concept` 是跨资产共享的抽象业务概念（如"日活跃用户"连接多张表），属于 CL-2 ConceptKindPlugin 图节点，不在单个 definition 上建模

### D2：Scope — 所有 definition type + 排除列级

- **全部加**：`EventDefinition`、`TableDefinition`、`MetricDefinition`（含内嵌 `MetricDefSchema`）均增加 `pref_label` + `alt_labels`
- SKOS 统一性：图中所有节点类型应有统一 vocabulary 属性
- terminology.yaml 数据实际覆盖三种类型（events/tables/metrics 如 ARPU）
- 成本为零：可选字段，schema `.loose()`，不用的 kind 自然为空
- **列级别排除**：`ColumnDefSchema` 不加。当前检索粒度为 definition 级别，列的 `comment` 字段已覆盖列级可读性。列级 SKOS 是 CL-3/CL-4 远期方向

### D3：`toCorpusItem` 接口变更 — 直接移除，原子迁移

```typescript
// Before
toCorpusItem(def: T, terminology?: EventTerminology): CorpusItem | null

// After
toCorpusItem(def: T): CorpusItem | null
```

- **直接移除 `terminology?` 参数**（breaking change），不做 deprecation path
- **原子完成**：同一变更中完成接口变更 + terminology.yaml 数据迁移到各 definition 的 `alt_labels` + 删除 `loadTerminology`/`parseTerminology` 代码路径
- 常设原则：「无兼容负担」+「不做过渡方案」
- 影响点：`eventKindPlugin.toCorpusItem`、`tableKindPlugin.toCorpusItem`、`loadRetrievalCorpusAll()`、`loadRetrievalCorpus()`、相关测试

### D4：resolveAlias 与 BM25 的关系 + tool 统一

**4a — 检索策略：Strategy B（always-fused graph-anchored hybrid）**

```
用户 query
  ├── [通道 1] resolveAlias(terms) → graph expand 1-hop → alias-resolved nodes (score boost)
  └── [通道 2] BM25 fuzzy match → scored candidates
           ↓
      Rank Fusion（alias-resolved nodes 获得 configurable boost）
           ↓
      Top-K → NL2SQL prompt
```

- BM25 始终运行（零 regression 风险）
- alias resolution 作为增量精度增益（透明融入 `search_data_sources`）
- 渐进演进路径：覆盖率提高 → 可平滑切换到 Strategy C（Jedify 纯图投射）
- **另开 [CL-3](CL3-retrieval-strategy-experiment.md) 票**：设计实验对比 A/B/C 三种策略的检索精度/SQL 准确率

**4b — tool 重命名：`lookup_terminology` → `resolve_term`**

- 定位：agent 主动消歧/概念探索工具（非检索必经路径）
- 与 `search_data_sources`（模糊检索）形成清晰语义对比：resolve = 确定性解析
- LLM agent 最易理解："我有一个 term，resolve 它到具体资产"
- catalog 描述：`resolve_term(term): 将业务术语精确解析为数据资产（匹配 alt_labels/pref_label），返回命中节点及图上下文`

### D5：AI enrichment 机制 — G3 同构（hook + tool + eval）

| 组件 | 职责 |
|------|------|
| **on-write hook** | definition 新建/更新时，LLM 从 description + column comments + domains 推断 alt_labels 候选并写入 |
| **agent tool `discover_alt_labels`** | 管理 agent 显式对一批 definitions 运行 alias enrichment（初始迁移 + 后续补充） |
| **eval 验证** | enrichment 后运行检索相关 eval cases，测量 precision/recall 变化；regression 则 revert |

- 与 G3 `discoverRelations` 模式完全同构：on-write hook（增量）+ 显式 tool（批量）+ eval gate（质量）
- 排除纯 persona 指导（不 scale、被动、与已建立模式不一致）
- eval 验证设计纳入 CL-3 实验票（alias 质量实验和检索策略实验统一）

## 实现计划（毕业为 task 后执行）

### Phase 1：Definition schema + 接口变更 + 数据迁移（原子）

1. `EventDefinitionSchema` / `TableDefinitionSchema` / `MetricDefSchema` / `MetricDefinitionSchema` 增加 `pref_label?: string` + `alt_labels?: string[]`
2. `DataSourceKindPlugin<T>` 接口 `toCorpusItem` 签名移除 `terminology?` 参数
3. `eventKindPlugin.toCorpusItem(def)` 从 `def.alt_labels` 读取别名注入 corpus
4. `tableKindPlugin.toCorpusItem(def)` 同理（当前已 unused `_terminology`）
5. `loadRetrievalCorpusAll()` 删除 `parseTerminology(loadTerminology(...))` 调用
6. `loadRetrievalCorpus()` 同步改为从 def 读取
7. 迁移脚本：遍历 terminology.yaml → 按 `maps_to` 分配 slang 到对应 definition 的 `alt_labels`；`table_comment` 作为初始 `pref_label`
8. 删除 `terminology.yaml`、`loadTerminology`、`parseTerminology` 相关代码
9. 更新所有相关测试

### Phase 2：RelationGraph 反向索引 + resolve_term tool

1. `RelationGraph` 增加 `aliasIndex: Map<string, string[]>`（normalized_alias → nodeIds）
2. `build()` 时从所有 definition 的 `alt_labels` + `pref_label` 构建索引
3. 新增方法：`resolveAlias(term: string): string[]`（返回匹配 nodeIds）
4. 新增方法：`getAliases(nodeId: string): string[]`
5. `search_data_sources` 内集成 always-fused hybrid（alias-resolved boost + BM25 parallel）
6. 实现 `resolve_term` tool 包（`@deepseek-ai/dsh-tool-resolve-term`）
7. phase-gate 更新：`resolve_term` 替换 `lookup_terminology` 在 UNIVERSAL_TOOLS 中的位置
8. NL2SQL prompt TOOL_CATALOG 同步更新

### Phase 3：AI enrichment

1. on-write hook 扩展：definition 写入后调用 LLM 推断 alt_labels + pref_label
2. `discover_alt_labels` Service method + agent tool 实现
3. management preset 注册 `discover_alt_labels` tool
4. eval 验证流程集成（与 CL-3 实验设计协同）

## 验收

- [x] Phase 1：`toCorpusItem(def)` 无 terminology 参数；`def.alt_labels` 从 definition 读取；现有 tests 通过；terminology.yaml 已删除 — **commit `d36c5d7f9a`（2026-08-29）**。tsc clean + 212 tests green。
- [x] Phase 2：`graph.resolveAlias('dau')` → 命中 `role.online` + `dws_...act_di`；`resolve_term` tool 可用；`search_data_sources` 集成 hybrid 检索 — **commit `91794aec4f`（2026-08-29）**。tsc clean + 342 tests green（涉及包）。Code review: 无阻塞问题，3 个建议归入 CL-3 迭代（score cap / CJK 分词 / relation fan-out）。
- [x] Phase 3：新 definition 写入后自动获得 AI 建议的 alt_labels；eval 无 regression — **commit TBD（2026-08-29）**。tsc clean + 233 tests green（涉及包）。Code review: 无阻塞问题，1 个 medium 性能关注（双轮 enrichOnWrite 顺序执行）v1 可接受。

## 对齐前沿

- **SKOS**：`pref_label` / `alt_labels` 对齐 prefLabel / altLabel 标准命名
- **Jedify**：always-fused hybrid → 向 graph-first subgraph projection 渐进演进
- **OpenMetadata 2.0**：glossary = ontology 一等组件（alt_labels 在 definition 中 = 节点属性）
- **G3 enrichment pattern**：hook + tool + eval gate 三层同构
