# R1 — 语义层数据模型设计调研

## 1. 现有模型分析

### 当前结构（`packages/data/semantic-layer/src/types.ts`）

两种硬编码类型，镜像 RBI pydantic：

- **EventDefinition**：事件定义（name、description、params_fields{name→{type,description}}、metrics、partitions、domain、confirmation、coverage）
- **TableDefinition**：表定义（table_name、kind[dws/dim/ods]、columns[{name,type,role,description}]、partitions、primary_key、label_columns、metrics、description）

所有 schema 使用 zod `.passthrough()`（兼容未知字段），`canonicalizeType` 统一物理类型到逻辑类型。

### 下游消费方式

1. **NL2SQL 引擎**（`nl2sql-engine/src/types.ts:131-132`）：
   - `CriticCtx.eventParams` ← `EventDefinition.params_fields` 的字段名集合
   - `CriticCtx.partitionCols` ← `TableDefinition.partitions` 的列名
   - `EventDefinitionLite`（`prompt.ts:22-24`）：仅需 `params_fields` + `partitions`

2. **检索工具**（`tool-search-data-sources/src/index.ts`）：
   - 通过 `ctx.schema.loadRetrievalCorpus()` 获取 `EventCorpusItem[]`
   - corpus 只需 `{ id, description, metrics, payload }` —— **不关心具体类型**

3. **加载工具**（`tool-load-table-definition`、`tool-load-event-definition`）：
   - 返回完整的 definition 对象给 LLM
   - LLM 读取字段含义来写 SQL

### 关键发现

检索层（BM25 corpus）**已经是类型无关的**——`EventCorpusItem` 只是 `{ id, description, metrics }`。类型特异性只在**加载和 critic 校验**时体现。

## 2. 方案 A：统一抽象 DataSource + kind

### 设计草案

```typescript
interface DataSourceDefinition {
  id: string                    // 唯一标识
  kind: string                  // 'event' | 'table' | 'excel' | 'api' | ...
  name: string                  // 显示名
  description: string           // 业务描述
  fields: FieldDefinition[]     // 统一字段列表
  partitions?: PartitionDef[]   // 可选分区
  metrics?: Record<string, MetricDef>  // 可选指标
  metadata: Record<string, unknown>    // kind-specific 扩展
  terminology?: string[]        // 别名
}
```

### 优点
- 检索天然统一，无需 per-kind corpus builder
- 新增 kind 零代码改动（只需填充 metadata）
- Web UI 管理界面统一——一个列表、一个编辑器
- 与 ontology（实体-关系图）更自然契合——节点都是 DataSource

### 缺点
- **下游负担**：NL2SQL critic 当前直接读 `params_fields`（EventDefinition 特有结构），统一后需要从 `fields` 转换，或按 kind 分支处理
- **类型安全削弱**：TypeScript 层面 `metadata: Record<string, unknown>` 无法静态校验
- **LLM prompt 差异**：加载事件 vs 加载表时，提供给 LLM 的信息格式不同——统一抽象后 prompt 模板需要按 kind 分支

## 3. 方案 B：类型化但可插拔

### 设计草案

```typescript
// 核心接口
interface DataSourceKindPlugin<T> {
  kind: string
  schema: ZodSchema<T>
  toCorpusItem(def: T): CorpusItem        // 统一检索
  toPromptContext(def: T): string           // 给 LLM 的格式化描述
  toCriticContext?(def: T): CriticFields   // critic 校验字段
}

// 注册
registry.registerKind(eventPlugin)   // kind='event', schema=EventDefinitionSchema
registry.registerKind(tablePlugin)   // kind='table', schema=TableDefinitionSchema
registry.registerKind(excelPlugin)   // 未来
```

### 优点
- **类型安全完整**：每个 kind 有自己的强类型 schema
- **下游适配最小**：NL2SQL critic 继续用 EventDefinition 特有字段，只需实现 `toCriticContext`
- **关注点分离**：每个 kind 独立管理自己的解析、校验、prompt 生成
- **渐进式**：现有 EventDefinition/TableDefinition 代码基本不动

### 缺点
- 新增 kind 需要实现一个 plugin（接口不多，但非零成本）
- 检索统一需要每个 plugin 实现 `toCorpusItem`
- Web UI 需要 per-kind 的编辑器适配（或用通用 JSON editor + kind-specific 表单）

## 4. 上下游影响对比

| 维度 | 方案 A（统一抽象） | 方案 B（类型化可插拔） |
|------|-------------------|---------------------|
| 检索层改动 | 无（已是类型无关） | 无（通过 toCorpusItem） |
| NL2SQL critic | 需按 kind 分支提取字段 | 不动（plugin 返回 CriticFields） |
| LLM prompt | 需按 kind 分支格式化 | plugin.toPromptContext 各自处理 |
| Web UI | 统一编辑器 + metadata panel | per-kind 编辑器或通用 + plugin hint |
| 新增 Excel kind | 只需约定 metadata 字段 | 实现 ExcelPlugin ~50 行 |
| TypeScript 安全 | 弱（metadata 无类型） | 强（per-kind schema） |
| Ontology 兼容 | 更自然（统一节点类型） | 需要抽象层桥接 |
| 现有代码改动 | 大（重构 types.ts + io.ts + consumer） | 小（包装现有代码为 plugin） |

## 5. 业界参考

| 产品 | 模型设计 | 本质 |
|------|---------|------|
| **dbt** | metric + dimension + entity，强类型 YAML schema | 偏 B：每种语义对象有专属 schema |
| **DataHub** | 统一 Entity + Aspect 模型（urn://dataset/...） | 偏 A：统一 entity，aspect 扩展 |
| **Metabase** | Model（=saved question）+ Metric，无硬编码类型 | 偏 A：通用抽象 |
| **Superset** | Dataset（=SQL query/table），统一抽象 | 偏 A：不区分表/视图/查询 |
| **Palantir Foundry** | Object Type + Property + Link Type | 偏 B：强类型 object，但统一图模型 |

**趋势**：业界整体倾向「统一 entity 抽象 + 可扩展 aspect/property」（DataHub 模式），但保留 per-kind 的 schema 校验（不完全放弃类型安全）。

## 6. 推荐

**推荐方案：B（类型化可插拔），但吸收 A 的统一检索层设计。**

理由：
1. **现有代码保护**：EventDefinition/TableDefinition 不需要重写，包装为 plugin 即可
2. **NL2SQL 兼容**：critic 继续读强类型字段，无适配成本
3. **扩展成本可接受**：新增 kind ~50 行 plugin 代码，对 LLM 编码无负担
4. **类型安全**：TypeScript 开发体验好，静态校验有效
5. **Ontology 兼容**：plugin 可以额外暴露 `relations()` 接口，返回与其他 DataSource 的关系

**具体设计**：
- 统一 `CorpusItem` 接口（已有）用于检索——检索层类型无关
- `DataSourceKindPlugin` 接口 for per-kind 逻辑
- 现有 EventDefinition/TableDefinition 重构为内置 plugin
- 注册表（`DataSourceRegistry`）管理所有 kind
- Web UI 通过 registry 获取 kind 列表 + per-kind 编辑器 hint

**与 Ontology 的兼容**：B 方案中每个 plugin 可声明：
- `relations(): RelationDef[]`（与其他 DataSource 的关系：join key、派生链）
- 这些关系构成知识图谱的边，DataSource 实例构成节点
