# W1 — SchemaGateway（ctx.schema Remote 投影）

**Type**: task
**Status**: Open
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
