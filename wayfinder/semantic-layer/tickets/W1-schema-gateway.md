# W1 — SchemaGateway（ctx.schema Remote 投影）

**Type**: task
**Status**: Closed
**Blocked by**: —

## Question

新增 `SchemaGateway extends TypertRemoteService`，将 `ctx.schema` 的只读方法 + Bm25Linker search 投影为 Remote（`@Remote`），供 `ui-semantic-layer` client 经 RPC 调用。这是 R6 识别的**唯一新基建代码**（既有 pattern 重复，非架构创新），范本 = `packages/host/plugin-inventory` 的 `PluginInventoryGateway`（`TypertRemoteService` + `@Remote`）。

投影范围（W4/W5 依赖）：
- 资产只读：listTables / listEvents / listMetrics / getTableMeta / getEventDefinition / getMetricDefinition 等
- **search**：复用 `tool-search-data-sources` 的 `Bm25Linker`（host 内存）经 `SchemaGateway.search()` Remote 暴露（<100ms，R6 已证无需独立 UI 搜索后端）
- **coverage**：`getCoverageStats()`（W4 evidence-query 依赖）
- **确认 per-asset `domains` 字段经投影可达**（nav domain-first 依赖此；types.ts 中 TableDefinition/EventDefinition 均有 `domains: string[]`，metrics 亦有）

## 验收

- [ ] `ctx.schema` 只读方法 + search 经 `SchemaGateway` Remote 可从 client 调用
- [ ] per-asset `domains` 字段经投影暴露（domain-first nav 前置）
- [ ] 遵循 `PluginInventoryGateway` pattern，无架构创新

## 参考

- R6（可行性前提）、G4（Q3 nav domain-first 依赖 domains 投影 / Q4 搜索复用 Bm25Linker）
- 范本：`packages/host/plugin-inventory/src/index.ts`、`packages/client/ui-settings/src/client/index.ts`（client 侧调用范本）

## Resolution

新包 `@deepseek-ai/dsh-schema-gateway`（`packages/data/schema-gateway/`）已实现：

**实现**：`SchemaGateway extends TypertRemoteService`，namespace = `schemaGateway`，`inject = ['schema']`。

**Remote 方法**（9 个）：
- `listTables()` → `TableSummary[]`（table_name, kind, domains, description, column_count, metric_count）
- `listEvents()` → `EventSummary[]`（name, domains, description, param_count, metric_count）
- `listMetrics()` → `MetricSummary[]`（name, domains, description, source, aggregation）
- `getTableDefinition(name)` / `getEventDefinition(name)` / `getMetricDefinition(name)` → full definition | null
- `search(query, topK?)` → `SchemaSearchHit[]` — cached `Bm25Linker` over `loadRetrievalCorpusAll()`，D2f cache-invalidation（corpusVersion mismatch → rebuild）
- `listDomains()` → `DomainEntry[]`（domain-first nav 前置；聚合 table/event/metric counts per domain）
- `getCoverageStats()` → `CoverageStats`（W4 evidence-query 依赖：total counts + domain_counts breakdown）

**验收**：
- ✅ `ctx.schema` 只读方法 + search 经 `SchemaGateway` Remote 可从 client 调用
- ✅ per-asset `domains` 字段经投影暴露（listTables/listEvents/listMetrics + listDomains）
- ✅ 遵循 `PluginInventoryGateway` pattern，无架构创新
- ✅ 11 tests 全绿
