# Phase 2 — Phase 1 剩余项 + NL2SQL 集成 + 指标计算引擎（合并执行）

> 已对齐真实代码 API（2026-08-22 校准）。本 prompt 合并：Phase 1 剩余项（events external_refs + runtime-wiring 缺口）+ P3 + P4。

## Phase 1 实际产物（前置事实）

- K11 已迁移：**321 tables + 453 events**（`examples/k11-semantic-layer/`）
- dimension_refs：**126 个 DWS 表**已填充（`enrichment.ts` 两轮策略）
- metrics：**3916 个**独立文件在 `metrics/`（`computation.sql/metadata` + `relations: [derived_from]`）
- `enrichment.ts`：`discoverRelationsDeterministic` + `discoverRelationsFor` + `enrichAllDwsTables` + `buildLlmPrompt`/`parseLlmRefs`/`buildDimInventory`
- Service：`ctx.schema.discoverRelations({tables})` + on-write hook `enrichOnWrite`（`autoEnrich` 默认 true）+ `setLlmCall(fn?)`
- agent tool：`packages/data/tool-discover-relations/`（调 `ctx.schema.discoverRelations`）

## 真实 API 速查（务必用这些名字，勿用旧字段）

**RelationGraph**（`src/relation-graph.ts`，类已存在，runtime 未实例化）：
```ts
class RelationGraph {
  build(entries: { sourceId: string; relations: RelationDef[] }[]): void  // 清空+构建双向邻接
  findJoinPath(sourceId, targetId): string[] | null   // BFS，仅 joins 边
  getRelated(sourceId, type?): RelationEdge[]          // type ∈ joins|derived_from|related_to
  getDerived(sourceId): RelationEdge[]                 // derived_from 链
  getJoinCondition(sourceId, targetId): string | null  // 直接相邻两点的 join 条件
}
interface RelationEdge { targetId, type, on?, description? }
```

**3 个 kind plugins**（`src/kinds/`，已存在，runtime 未注册）：
- `eventKindPlugin` / `tableKindPlugin` / `metricKindPlugin`，各实现 `DataSourceKindPlugin<T>`
- 每个 plugin 有 `storageDir`（`events`/`tables`/`metrics`）+ `relations(def): RelationDef[]` + `toCorpusItem(def, terminology?)` + `getId(raw)`
- `tableKindPlugin.relations()`：从 `dimension_refs` → `joins` 边（`on` = `dws_col = dim_col`）
- `eventKindPlugin.relations()`：从 `external_refs` → `joins` 边
- `metricKindPlugin.relations()`：从 `relations: [derived_from]` → `derived_from` 边
- `metricKindPlugin.toExecutableRule(def): string | null` → 返回 `def.computation.sql`（**只返回 SQL 串，不接 params**）

**MetricDefinition 真实字段**（`src/kinds/metric-kind.ts`）：
```yaml
kind: metric
name: dws_10000251_pay_order_di__pay_amt_sum
description: 付费总金额（元）
domains: [付费经济]
computation:
  sql: SUM(pay_amt)              # ← 不是 "expression"
  metadata: { aggregation, field, source, time_grain }  # source = 源表名
relations:
  - { type: derived_from, target: dws_10000251_pay_order_di, description: ... }
```
- 加载器：`loadMetricDefinitions(semanticLayer)` 返回 `MetricDefinition[]`（`src/metrics.ts`）

**检索语料现状**：`ctx.schema.loadRetrievalCorpus(): EventCorpusItem[]` 仅含 events（`loadRetrievalCorpusFromLayer`）。`EventCorpusItem`/`CorpusItem` 形状一致：`{ id, description?, metrics?, payload? }`。

---

# Part A — Phase 1.5：runtime-wiring 补全（P3/P4 地基，先做）

P2 ticket 声称的 `loadRetrievalCorpusFromRegistry` 实际不存在 — registry/graph/corpus 只到组件+单测。必须接进 `SemanticLayerService` runtime。

## A1. 注册 3 个 kind plugins 到 live registry

在 `SemanticLayerService`（`src/index.ts`）内部持有一个 `DataSourceRegistry` 实例：
```ts
import { DataSourceRegistry } from './registry.ts'
import { eventKindPlugin } from './kinds/event-kind.ts'
import { tableKindPlugin } from './kinds/table-kind.ts'
import { metricKindPlugin } from './kinds/metric-kind.ts'

// 构造时注册
private readonly registry = new DataSourceRegistry()
constructor(...) {
  ...
  for (const p of [eventKindPlugin, tableKindPlugin, metricKindPlugin]) this.registry.register(p)
}
```
暴露访问点：`getRegistry(): DataSourceRegistry`（或 `getKind(kind)`）。

## A2. 构建 + 暴露 live RelationGraph

新增 Service 方法：
```ts
private graphCache: RelationGraph | undefined
private graphVersion = -1

getRelationGraph(): RelationGraph {
  // 用 corpusVersion() 做失效信号；version 不变则复用缓存
  if (this.graphCache && this.graphVersion === this.corpusVersion()) return this.graphCache
  const g = new RelationGraph()
  const entries: { sourceId: string; relations: RelationDef[] }[] = []
  // tables: loadTables → tableKindPlugin.getId + relations
  for (const t of loadTables(this.semanticRoot)) {
    const def = TableDefinitionSchema.safeParse(t.raw); if (!def.success) continue
    entries.push({ sourceId: def.data.table_name, relations: tableKindPlugin.relations(def.data) })
  }
  // events: loadEvents → eventKindPlugin（external_refs → joins）
  for (const e of loadEvents(this.semanticRoot)) {
    const def = EventDefinitionSchema.safeParse(e.raw); if (!def.success) continue
    entries.push({ sourceId: def.data.name, relations: eventKindPlugin.relations(def.data) })
  }
  // metrics: loadMetricDefinitions → metricKindPlugin（derived_from）
  for (const m of loadMetricDefinitions(this.semanticRoot)) {
    entries.push({ sourceId: m.name, relations: metricKindPlugin.relations(m) })
  }
  g.build(entries)
  this.graphCache = g; this.graphVersion = this.corpusVersion()
  return g
}
```
（events external_refs 填充后，event 节点才进图；Part B 做完后图才完整。）

## A3. 扩展检索语料含 tables + metrics

新增 registry-driven 语料构建器（补 P2 未实现的 `loadRetrievalCorpusFromRegistry`）：
```ts
loadRetrievalCorpusAll(): CorpusItem[] {
  const out: CorpusItem[] = []
  const term = parseTerminology(loadTerminology(this.semanticRoot))
  for (const plugin of this.registry.allPlugins()) {
    const defs = loadByStorageDir(this.semanticRoot, plugin.storageDir) // 见下
    for (const def of defs) {
      const item = plugin.toCorpusItem(def, term)
      if (item) out.push(item)
    }
  }
  return out
}
```
- 需要一个 `loadByStorageDir`：按 `storageDir` 分发到 `loadEvents`/`loadTables`/`loadMetricDefinitions`，再各自 schema.parse 投影。
- **关键**：metrics 必须进语料（`metricKindPlugin.toCorpusItem` 已实现，返回 `{id, description, metrics}`），否则 P4 路由无从命中。
- 让 `tool-search-data-sources` 的 `Bm25Linker` 改读 `loadRetrievalCorpusAll()`（替换原 events-only 路径），保留 `corpusVersion` 失效机制。

---

# Part B — Phase 1 剩余：events external_refs 第二轮 + llmCall 接线

## B1. events external_refs 发现

`enrichAllDwsTables` 只处理 DWS 表。events 的 `external_refs` 需要平行实现。在 `enrichment.ts` 新增：

```ts
export async function enrichAllEvents(
  semanticLayer: string,
  llmCall?: LlmCall,
  events?: readonly string[],
): Promise<{ enriched: number; written: number; errors: string[] }>
```

设计要点：
- events 的关联信号主要是 **LLM 轮**：event 有 `params_fields`（record，非 columns 数组）+ `description`，确定性 PK-name 匹配不天然适用 → 以 LLM 轮为主。
- LLM prompt 输入：event 名 + description + params_fields（字段名+描述）+ table/DIM inventory（表名+PK+description）。
- LLM 输出 `DimensionRef[]`，写入 event YAML 的 `external_refs`（schema 与 `dimension_refs` 相同）。
- events 写入用 `io.ts` 的 `writeEventYaml`（raw-edit surface，name-match 校验，非 schema-validate）—— 注意要先读原文、注入 `external_refs`、再 dump。或新增一个 `updateEventExternalRefs` helper。
- 对 K11 跑：`enrichAllEvents(k11Root, llmCall)` → 预期填充部分 453 events 的 external_refs。

## B2. Service 方法 + on-write hook 扩展

- `ctx.schema.discoverRelations({tables?, events?})` 扩展：传入 `events` 时走 `enrichAllEvents`；on-write hook 在写入 event 后也触发 events enrichment。
- 或新增 `ctx.schema.discoverEventRelations({events?})` 与 table 路径解耦（推荐：语义更清晰）。

## B3. llmCall 接线（生产）

当前 `setLlmCall` 注释说"Production wires this to ctx.llm"但 bundle 未接线。在 `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 或对应 bundle 装配处，挂载后调用：
```ts
ctx.schema.setLlmCall((prompt) => ctx.llm.text(prompt))  // 适配真实 ctx.llm 的 BlockAssembler 接口
```
未接线则 enrichment 只跑确定性轮（events 无法发现 → B1 跑不出结果）。**B3 是 B1 的前置**。

---

# Part C — P3：NL2SQL 集成

**Ticket**: `wayfinder/semantic-layer/tickets/P3-ontology-nl2sql-integration.md`

## C1. Join-path 注入 Prompt（依赖 A2 live graph）

NL2SQL 引擎在 schema linking 后，对多表查询：
1. `ctx.schema.getRelationGraph().findJoinPath(tableA, tableB)` 获取 path
2. 对 path 上每对相邻节点，`getJoinCondition(a, b)` 取 `on`（如 `server_id = server_id`）
3. 注入 LLM prompt 作 hard constraint：
   ```
   已知 JOIN 关系（必须使用，勿自行推断 JOIN key）：
   - dws_10000251_pay_order_di JOIN dim_10000251_server_info ON server_id = server_id
   ```
4. LLM 只管 SELECT/WHERE/GROUP BY。

## C2. Critic 校验未声明 JOIN

NL2SQL critic 新增规则：
- 解析生成 SQL 的 JOIN clause，提取涉及的表对
- 每对查 `getRelationGraph().getJoinCondition(a, b)`（或 `getRelated(a, 'joins')` 是否含 b）
- 无声明 → 警告 `"⚠️ 未声明的 JOIN: a ⟷ b，可能 hallucination"`，不阻断执行，结果标注

## C3. 关系图增强召回（依赖 A3 语料含 tables/metrics）

搜索阶段：
- BM25 命中 table A → `getRelated(A, 'joins')` 扩展召回关联 DIM 表
- 命中 metric → `getDerived(metric)` 扩展召回其 source table
- 扩展深度 = 1 hop（避免噪音）

## C4. 验收
- [ ] 多表查询 join condition 从 live graph 获取（非 LLM 推断）
- [ ] Critic 校验未声明 JOIN 并告警
- [ ] 关系图增强召回（≥3 个 K11 eval case）
- [ ] 对比实验：有/无 ontology 辅助的多表查询准确率

---

# Part D — P4：指标计算引擎

**Ticket**: `wayfinder/semantic-layer/tickets/P4-ontology-metric-engine.md`

## D1. Metric 匹配路由（依赖 A3 — metrics 进语料）

1. 检索阶段：BM25 命中 metric 的 `CorpusItem`（`metricKindPlugin.toCorpusItem` 已实现）
2. 路由判断：
   - **纯指标查询**（"昨天 DAU 是多少"）→ Level 2.5
   - **混合查询**（"付费用户中等级>50 的 DAU"）→ Level 2
3. 简单规则：只命中 1 个 metric 且无额外 WHERE 条件 → Level 2.5

## D2. Level 2.5 确定性执行路径（P4 自建模板化 — `toExecutableRule` 不够用）

`metricKindPlugin.toExecutableRule(def)` 只返回 `computation.sql`（如 `COUNT(DISTINCT user_id)`），不含 FROM/WHERE。P4 新建：

```ts
export function buildExecutableSQL(
  metric: MetricDefinition,
  params: { date?: string; start_date?: string; end_date?: string },
  graph: RelationGraph,
): string {
  const source = metric.computation.metadata.source      // 源表名
  const sqlExpr = metric.computation.sql                 // 聚合表达式
  // 判断源表是否有分区列 ds（用 tableKindPlugin.toCriticContext 或 loadTableDefinition）
  const src = loadTableDefinition(semanticLayer, source)
  const hasDs = src?.partitions.some(p => p.name === 'ds')
  const where = hasDs ? ` WHERE ds = '${params.date}'` : ''
  return `SELECT ${sqlExpr} FROM ${source}${where}`
}
```

执行流：
```
用户: "昨天的 DAU"
→ 检索命中 metric: daily_active_users
→ metric.computation.sql = "COUNT(DISTINCT user_id)"
→ metric.computation.metadata.source = "ods_login_di"
→ 参数提取: {date: "2026-08-21"}  (格式化为 ds 串 "20260821")
→ buildExecutableSQL → SELECT COUNT(DISTINCT user_id) FROM ods_login_di WHERE ds = '20260821'
→ 直接执行，不经 LLM
```

参数提取：
- 时间参数从用户问题提取（"昨天"→yesterday；"上周"→上周日期区间；指定日期→原值）
- 简单用规则，复杂用 LLM 小模型快速提取
- 注意 ds 分区格式：DWS 多为 `YYYYMMDD` 串（如 `20260821`），需格式匹配源表实际分区格式

## D3. Level 2 Context 注入路径

混合查询时，将命中的 metric 计算规则注入 NL2SQL prompt：
```
已知指标定义（请基于此规则构建查询）：
- DAU = COUNT(DISTINCT user_id) FROM ods_login_di WHERE ds = '{date}'
用户问题：付费用户中等级>50 的 DAU
请生成 SQL...
```

## D4. 验收
- [ ] 纯指标查询走 Level 2.5 确定性路径，SQL 正确执行返回结果
- [ ] 混合查询走 Level 2，metric 规则作 context 注入
- [ ] 参数提取至少支持：昨天/今天/上周/本月/指定日期
- [ ] ≥5 个 K11 eval case 对比 Level 2.5 vs Level 2 准确率
- [ ] 路由判断准确率 > 90%

---

# 执行顺序建议

1. **Part A（A1→A2→A3）** — runtime wiring 地基，P3/P4 共同前置
2. **Part B（B3 llmCall 接线 → B1 events external_refs → B2 Service 扩展）** — B3 是 B1 前置；B1 完成后 A2 的 graph 才含 event 节点
3. **Part C（P3）+ Part D（P4）并行** — C 依赖 live graph + tables 语料（A2/A3），D 依赖 metrics 语料 + 模板化（A3 + D2）
   - 建议两 worktree/分支并行，最后合并
4. 跑完用 K11 eval cases 做对比实验（C4 + D4）

> 注：A2 graph 缓存用 `corpusVersion()` 失效；events external_refs（B1）写入会 bump corpusVersion → graph 自动重建，无需手动刷新。
