# G1 — 语义层数据模型最终决策

**Type**: grilling
**Status**: Resolved (2026-08-21)
**Blocked by**: R1 (resolved), R2 (resolved)

## Question

基于 R1（数据模型调研）和 R2（ontology 调研）的结论，决定语义层数据模型采用统一抽象还是类型化可插拔，以及 ontology 对模型的影响。

## 决策要素

- R1 的方案对比结论（上下游影响、扩展成本）
- R2 的 ontology 结论（是否需要 entity-relationship 建模能力）
- 对现有 P6/P6b 代码的影响（重构 vs 推翻）
- 对 NL2SQL 引擎的适配需求

## Resolution

### D1：确认方案 B（类型化可插拔 + 统一检索层）

**决策**：采用 R1 推荐的方案 B，不调整。

**理由**（来自现有代码的实证）：

1. **检索层已是类型无关的**：`corpus.ts` 产出 `EventCorpusItem = { id, description, metrics, payload }` —— 与 kind 无关。方案 B 的 `toCorpusItem()` 自然对齐这个已有形态。
2. **NL2SQL critic 已按类型分支消费**：`CriticCtx` 分别从 `EventDefinition.params_fields` 取 eventParams、从 `TableDefinition.partitions` 取 partitionCols —— 这正是 per-kind `toCriticContext()` 的天然形态。
3. **TypeScript 类型安全**：每个 kind 保有完整 zod schema（`EventDefinitionSchema` / `TableDefinitionSchema`），静态校验不丢失。方案 A 的 `metadata: Record<string, unknown>` 退化。
4. **扩展成本可接受**：新增 kind ≈ 实现一个 plugin（~50 行），对 LLM 编码无负担。
5. **与 R2 ontology 兼容**：每个 plugin 暴露 `relations()`，关系构成图的边、定义实例构成节点。

### D2：DataSourceKindPlugin 接口设计

```typescript
/** 统一检索项（类型无关） */
interface CorpusItem {
  id: string
  description?: string
  metrics?: Record<string, unknown>
  payload?: unknown
}

/** Critic 守卫字段（可选子集，由 registry 合并） */
interface CriticFields {
  eventParams?: Record<string, unknown>
  partitionCols?: string[]
}

/** 关系声明（R2 ontology 轻量图的边） */
interface RelationDef {
  type: 'joins' | 'derived_from' | 'related_to'
  target: string
  on?: string           // join condition (e.g. "user_id = user_id")
  description?: string  // 关系的业务描述
}

/** 数据源类型插件（每 kind 一个实现） */
interface DataSourceKindPlugin<T = unknown> {
  /** 类型标识 */
  kind: string

  /** 定义的 zod 验证 schema */
  schema: ZodSchema<T>

  /** YAML 存储子目录名 (e.g. 'events', 'tables') */
  storageDir: string

  /** 定义 → 统一检索项（null = 该定义不参与检索索引） */
  toCorpusItem(def: T, terminology?: EventTerminology): CorpusItem | null

  /** 定义 → LLM prompt 文本（load_* tool 返回给模型的描述） */
  toPromptContext(def: T): string

  /** 定义 → critic 守卫字段（可选；非所有 kind 都有 critic 逻辑） */
  toCriticContext?(def: T): CriticFields

  /** 定义 → 关系声明（可选；构建 in-memory 关系图） */
  relations?(def: T): RelationDef[]

  /** 从 raw YAML 中提取唯一标识（event 用 name，table 用 table_name） */
  getId(raw: Record<string, unknown>): string | undefined
}
```

**设计依据**：

- `toCorpusItem`：对齐 `corpus.ts` 已有的 `EventCorpusItem` 形态。当前只有 events 进 corpus，table plugin 可选择返回 null（不索引）或返回精简 item（未来索引表）。`terminology` 参数注入是因为术语是全局资源（不属于单个定义），但 enrichment 需要它。
- `toPromptContext`：对齐 `tool-load-*-definition` 返回的格式化文本。event plugin 格式化 params_fields 表格；table plugin 格式化 columns 表格 + kind/engine 信息。
- `toCriticContext`：直接产出 `CriticFields`（`makeCriticCtx` 的输入 shape）。event 返回 `{ eventParams: def.params_fields }`；table 返回 `{ partitionCols: def.partitions.map(p => p.name) }`。Registry 合并所有 kind 的 fields 后交给 `makeCriticCtx`。
- `relations`：从定义的 YAML `relations` 字段（R2 推荐的声明式）提取。当前 EventDefinition 已有 `external_refs`（DimensionRef），可映射为 `joins` 类型关系。
- `storageDir`：分离存储关注点——events/ 和 tables/ 各自扫描，新 kind 自带目录。
- `getId`：kind-specific 的 ID 提取（event 是 `name`，table 是 `table_name`）。

### D3：现有 EventDefinition/TableDefinition 重构为 plugin 的方案

**策略：additive wrapping，不重写 schema**。

具体步骤：

1. **新增 `packages/data/semantic-layer/src/registry.ts`**：
   - 定义 `DataSourceKindPlugin` 接口 + `DataSourceRegistry` class
   - Registry 持有 `Map<string, DataSourceKindPlugin>`
   - 提供 `register(plugin)` / `getKind(kind)` / `allKinds()` API

2. **新增 `packages/data/semantic-layer/src/kinds/event-kind.ts`**：
   ```typescript
   export const eventKindPlugin: DataSourceKindPlugin<EventDefinition> = {
     kind: 'event',
     schema: EventDefinitionSchema,
     storageDir: 'events',
     getId: (raw) => typeof raw.name === 'string' ? raw.name : undefined,
     toCorpusItem: (def, terminology) => ({
       id: def.name,
       description: buildEnrichedDescription(def, terminology),
       metrics: def.metrics,
       payload: def,
     }),
     toPromptContext: (def) => formatEventForLLM(def),
     toCriticContext: (def) => ({ eventParams: def.params_fields }),
     relations: (def) => def.external_refs?.map(ref => ({
       type: 'joins' as const,
       target: ref.dim_table,
       on: ref.join_keys.map(k => `${k.dws_column} = ${k.dim_column}`).join(', '),
     })) ?? [],
   }
   ```

3. **新增 `packages/data/semantic-layer/src/kinds/table-kind.ts`**：
   ```typescript
   export const tableKindPlugin: DataSourceKindPlugin<TableDefinition> = {
     kind: 'table',
     schema: TableDefinitionSchema,
     storageDir: 'tables',
     getId: (raw) => typeof raw.table_name === 'string' ? raw.table_name : undefined,
     toCorpusItem: (_def) => null,  // 当前不索引表；未来可索引
     toPromptContext: (def) => formatTableForLLM(def),
     toCriticContext: (def) => ({ partitionCols: def.partitions.map(p => p.name) }),
     relations: (def) => [
       ...def.dimension_refs.map(ref => ({
         type: 'joins' as const,
         target: ref.dim_table,
         on: ref.join_keys.map(k => `${k.dws_column} = ${k.dim_column}`).join(', '),
       })),
       // 未来：从 YAML relations 字段直接读
     ],
   }
   ```

4. **重构 `io.ts` 的加载逻辑**：
   - `loadDefinitions(semanticLayer, kindPlugin)` 泛型版替代 `loadEvents` / `loadTables`
   - 保留 `loadEvents` / `loadTables` 为快捷方法（调用泛型版 + 内置 kind）
   - 不破坏现有 test 和 consumer

5. **扩展 `SemanticLayerService`**：
   - 添加 `private registry = new DataSourceRegistry()`
   - 构造时自动注册 `eventKindPlugin` + `tableKindPlugin`
   - 新增 `registerKind(plugin)` 公开 API（外部扩展用）
   - `loadRetrievalCorpus()` 改为遍历所有 kind 的 `toCorpusItem()` 聚合
   - 新增 `loadDefinition(kind, name)` 泛型加载方法

6. **YAML `relations` 字段**：在 `EventDefinitionSchema` / `TableDefinitionSchema` 中**暂不添加** zod 字段（`.passthrough()` 已透传未知键），plugin 的 `relations()` 从 raw YAML 的 `relations` 键按约定读取。后续正式化时加 zod 校验。

### D4：对现有 P6b 代码的处理

**决策：重构，非推翻。**

P6b 代码分析：

| 文件 | 处理 | 理由 |
|------|------|------|
| `types.ts` | **保留**（零修改） | zod schema 正确镜像 RBI，即是 plugin 的 `schema` 字段 |
| `corpus.ts` | **保留**（utility） | `buildRetrievalCorpus` 逻辑成为 `eventKindPlugin.toCorpusItem` 的内部实现 |
| `io.ts` | **重构**（additive） | 增加泛型 `loadDefinitions`；保留 `loadEvents`/`loadTables` 为快捷方法 |
| `basic-index.ts` | **重构**（kind-aware） | 从硬编码 event/table 索引改为按注册 kind 遍历 |
| `pending.ts` | **保留** | 与 kind 无关（per-scope pending queue） |
| `index.ts` | **扩展**（additive） | Service 增加 registry 能力，保留所有现有 API |
| tests | **扩展** | 新增 registry 测试，现有 scenario 测试保留验证不退化 |

**"无兼容负担"原则的适用**：指的是对外部消费者（preset、bundle config、用户 YAML）无需保持向后兼容。对内部代码，P6b 已经过 code review + vitest 验证，是正确的实现——不做无意义重写。

### 与后续 ticket 的关系

- **G2（Ontology 角色决策）**：本决策已包含 ontology 结论——`relations()` 在 plugin 接口中是 first-class。G2 的核心问题（ontology 是独立系统还是语义层扩展）已由 R2 解答并在此落地：**语义层 + relations = 轻量 ontology，不引入独立系统**。
- **后续实现 ticket**（待 G2 close 后 graduate）：
  - 实现 `DataSourceRegistry` + 两个内置 kind plugin
  - 实现 in-memory relation graph (`findJoinPath` / `getRelated`)
  - NL2SQL critic 适配（通过 registry 的 `toCriticContext` 聚合）
  - `load_*` tools 通过 registry 的 `toPromptContext` 格式化
