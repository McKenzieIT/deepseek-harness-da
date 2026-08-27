# W9 — Schema Browser UI（Asset 浏览器）

**Type**: task
**Phase**: misc（管理 UI）
**Status**: resolved
**Blocked by**: 无（SchemaGateway W1 已就绪：listDomains/listTables/listEvents/listMetrics/getTableDefinition/getEventDefinition/search）

## Question

SchemaGateway (W1) 已暴露完整的 semantic layer 只读 Remote API，但零客户端消费。管理员无法在 UI 中浏览/搜索 data assets。

## 做法

### SchemaExplorer 组件

注册 client slot（`details.panel` 或 `sidebar.panel`），在 management session 中可用：

1. **Domain 列表视图** — `schemaGateway.listDomains()` → 10 domain cards（名称 + table/event/metric 计数）
2. **Domain 详情** — 点击 domain → 展示该 domain 下所有 assets 列表（table/event/metric tabs）
3. **Asset 列表** — `listTables({domain?})` / `listEvents({domain?})` → 名称 + kind badge + confirmation status icon
4. **搜索** — 顶部 search bar → `schemaGateway.search(query, topK=20)` → 混合结果列表
5. **Asset 详情卡** — 点击 asset → `getTableDefinition(name)` / `getEventDefinition(name)` → 完整信息：
   - Table: columns 表格、metrics 列表、dimension_refs（JOIN 关系）、granularity、partitions、confirmation
   - Event: params_fields 表格、metrics、external_refs、event_filter
6. **导航到 Graph** — 详情卡内 "在知识图谱中查看" 按钮 → 跳转 C3 graph view 以该 asset 为 focus

### 文件

- `packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx` — 主组件
- `packages/client/ui-semantic-layer/src/client/AssetDetail.tsx` — 详情面板
- `packages/client/ui-semantic-layer/src/client/hooks/useSchemaGateway.ts` — RPC hook
- slot 注册在现有 `index.ts` client exports 中

## 验证

- web UI → management session → SchemaExplorer 渲染 10 domains
- 点击 "角色" domain → 看到 dws/dim 表列表
- 搜索 "充值" → 返回相关 events/tables
- 点击 dws_acc_summary_df → 看到 69 columns + 6 dimension_refs

## Resolution

Implemented the full Schema Browser UI in `packages/client/ui-semantic-layer/src/client/`:

**New files:**
- `schemaGatewayBridge.ts` — RPC bridge (unwraps RemoteResult, exports local type re-declarations)
- `hooks/useSchemaGateway.ts` — React hook with state management, debounced search (300ms)
- `SchemaExplorer.tsx` — Main component: domain grid → domain detail (3 tabs) → search mode
- `SchemaExplorer.module.css` — CSS module following existing pattern
- `AssetDetail.tsx` — Detail panel for Table (columns/metrics/dimension_refs/partitions), Event (params_fields/external_refs/event_filter), Metric (computation/caliber_variants/host)

**Modified files:**
- `wiring.tsx` — Added `SemanticLayerSchemaExplorer` adapter for `details.aux` slot (order 10, management session gated)
- `index.ts` — Added slot registration, exports, remote inject ('remote' added to scope inject list)
- `locales.ts` — Added 21 schema.* locale keys (zh + en)

**Tests:** 3 new spec files (schemaGatewayBridge.spec.ts, SchemaExplorer.spec.tsx, AssetDetail.spec.tsx) — 85 total tests pass. tsc --noEmit clean.

**Wiring note:** `onNavigateToGraph` prop is a noop placeholder for W10. The schemaGateway remote is wired via `scope.remote.schemaGateway` with graceful null fallback.

## 关联

- [schema-gateway](../../packages/data/schema-gateway/) — 数据源 Remote API
- [W10 Knowledge Graph](W10-knowledge-graph-visualization.md) — 详情卡 "在图谱中查看" 跳转目标
