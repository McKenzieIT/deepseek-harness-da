# W1 — SchemaGateway（ctx.schema Remote 投影）

## 背景

G4 已决议（见 `map.md` Decisions / G4 ticket Resolution）：语义层管理 = 一个 agent = **goal ⊕ eval/evidence**；v1 = ① 证据基建 + ② 人驱管理面（B 布局：资产为首 + 证据侧栏）。W1 是 v1 的**奠基票**（R6 识别的唯一新基建代码），unblocks W4（evidence-query）+ W5（UI）。

W1 是 **host 侧** Remote 网关（范本 = `PluginInventoryGateway`），把 `ctx.schema`（`SemanticLayerService`）的能力投影为 RPC，供 `ui-semantic-layer` client（W5）经 connection 调用。**W1 只做 host 网关；client 侧消费是 W5。**

**ctx.schema 现有方法面**（`packages/data/semantic-layer/src/index.ts`，`class SemanticLayerService extends Service`，service key `'schema'`，`declare module Context { schema: SemanticLayerService }`）：
- **读**：`loadEventDefinition(name)` / `loadTableDefinition(name)` / `loadMetricDefinition(name)` / `loadRetrievalCorpus()`（events-only）/ `loadRetrievalCorpusAll()`（events+tables+metrics，registry-driven）/ `corpusVersion()` / `getRelationGraph()` / `getRegistry()`；getters `semanticRoot` / `scopeId` / `corpusVariant`
- **写（Tier-2，经 `ctx.audit.recordTier2Write`，D5 不可关）**：`syncWrite(tableMetas, opts)` / `updateTableMeta(name, updates, opts)`
- **enrichment（unaudited auto-derive）**：`discoverRelations(opts)` / `discoverEventRelations(opts)`
- **live-ODPS（deferred，无 provider 抛错）**：`discover` / `describe` / `sample`

## 工作流（Wayfinder: Work through the map）

1. **加载 map**，确认 Destination + G4 决议。
2. **认领 W1**（status → in-progress）。
3. **先 resolve 下方 D1-D3 设计决策**（grilling / domain-modeling 一问一答；W1 非纯机械跟 pattern，有真实分叉），再实现。
4. **实现 SchemaGateway（host 侧）+ 单测**；遵循 `PluginInventoryGateway` pattern（`extends TypertRemoteService` + `@Remote` + `static inject`）。
5. **记录 Resolution → close → map Decisions-so-far 追加 W1 索引**。

## 待决（W1 session 内 grilling，一问一答）

### D1. 只读 vs 读写网关
R6 框定"只读方法投影"，但 G4 Q5 决议"人类 inline-edit（escape hatch，即写+audit）"+ ②"手动 enrichment 触发"。→ 网关是否也投影 Tier-2 写方法（`updateTableMeta` / `syncWrite`）+ enrichment（`discoverRelations` / `discoverEventRelations`）？
- **推荐：读 + 写 + enrichment**。read-only 已被 G4 Q5 / ② 推翻；写经 D5 audit（非 disableable），client 触发也安全；enrichment 是 ② 人驱动作的入口。

### D2. nav 列表方法缺口
UI nav（domain-first，4700 资产）需"列出资产 + 其 domains / kind / dws-dim / confirmation.status"的**轻量摘要**，但 ctx.schema 无 `listTables` / `listEvents` / `listMetrics` 摘要方法（只有 per-name `load*Definition` + 全量 `loadRetrievalCorpusAll()` 返回 `CorpusItem`）。→ 网关加 list-summary 方法（如 `listAssetSummaries(filter?)` 返回 `{name, kind, domains, dws/dim, confirmation.status}`），还是这归 W4 evidence-query 层？
- **推荐：W1 加 list-summary**（nav 的直接数据源，属网关投影面；W4 聚合 coverage 但 list 是网关职责）。复用 substrate `loadTables` / `loadEvents` / `loadMetricDefinitions`（`io.ts`）。

### D3. search 的归属
`search()` **不是 ctx.schema 方法**——它是 `tool-search-data-sources` 的 `Bm25Linker`。R6 说"包进 `SchemaGateway.search()` Remote 暴露"。→ 网关 `search()` = 在网关内**组合** Bm25Linker（over `loadRetrievalCorpusAll()`）暴露，**非纯投影**。确认此组合在网关内（复用 `tool-search-data-sources` 的 Bm25Linker，不重写检索；<100ms，R6 已证无需独立 UI 搜索后端）。

### 事实更正（非决策）
G4/W1 ticket 草稿提的 `getCoverageStats()` **在 ctx.schema 不存在**——coverage 统计是 **W4** 的计算职责（聚合各 `load*Definition` 的 `confirmation.status`），W1 **不投影它**。从 W1 ticket 描述中移除此项。

## 上下文

- **ctx.schema 挂载 + semanticRoot**：map "现有基础设施"记"bundle 已挂 semantic-layer 但 semanticRoot 为空"。W1 须验证 host 侧 ctx.schema 已挂且 `semanticRoot` 指向 K11（`examples/k11-semantic-layer`），否则网关投影返回空。git 有未提交的 `packages/data/semantic-layer/src/llm-wiring-plugin.ts`（ctx.llm→ctx.schema 接线，F1 工作）——与本票正交，知悉即可。
- **domains**：`TableDefinition` / `EventDefinition` / metric 均带 `domains: string[]`（多对多，`types.ts`）——经 `load*Definition` / list-summary 自然可达，domain-first nav 依赖此（G4 Q3）。
- **范本**：`PluginInventoryGateway`（host 网关）`static inject = ['loader']` / `super(ctx, 'pluginInventory')` / `@Remote('list')` 直接读 `this.ctx.loader`。W1 类比：`static inject = ['schema']` / `super(ctx, 'schemaGateway')` / `@Remote(...)` 委托 `this.ctx.schema.*`。

## 参考文件

| 文件 | 用途 |
|------|------|
| `wayfinder/semantic-layer/tickets/W1-schema-gateway.md` | ticket 全文 |
| `wayfinder/semantic-layer/tickets/G4-web-ui-scope-and-interaction.md`（Resolution） | G4 决议（架构 + Q5 inline-edit / Q3 nav / Q4 search） |
| `packages/host/plugin-inventory/src/index.ts` | **网关范本**（`TypertRemoteService` + `@Remote` + `static inject`） |
| `packages/data/semantic-layer/src/index.ts` | **ctx.schema = SemanticLayerService**（投影源；方法面见上） |
| `packages/client/ui-settings/src/client/index.ts` | client 消费范本（`apply` + `connection.api` + `$on` invalidation）——W5 用，W1 知悉 |
| `packages/data/tool-search-data-sources/` | `Bm25Linker`（search 组合源，D3） |
| `wayfinder/semantic-layer/research/r6-web-ui-implementation.md` | R6 可行性（网关 = 唯一新基建；pattern 重复非创新） |

## 验收

- [ ] D1 / D2 / D3 三个设计决策逐一与用户敲定（grilling 可追溯）
- [ ] `getCoverageStats` 误项从 W1 描述移除（归 W4）
- [ ] `SchemaGateway`（host 侧）实现：投影 ctx.schema 读 + 决议的写（D1）/ enrichment + list-summary（D2）+ search（D3 组合 Bm25Linker）
- [ ] 确认 per-asset `domains` 经投影可达
- [ ] 验证 host 侧 ctx.schema 挂载 + `semanticRoot` 配置（否则标注缺口）
- [ ] 单测：网关方法经 RPC 可从 client 调用 + 返回真实数据（K11）
- [ ] W1 ticket Resolution → close → map Decisions-so-far 追加索引

## 注意

- **W1 是 host 侧网关**；client 侧消费（`ui-semantic-layer`）是 W5。W1 完成 unblock W4（evidence-query 读 ctx.schema 经网关）+ W5（UI 经网关取数）。
- **W1 是 task 票但有 3 个真实设计分叉（D1-D3）**——先 grilling 敲定再实现，不是纯机械跟 pattern。
- 遵循 `PluginInventoryGateway` pattern，无架构创新（R6 已证）。
- 一次只 resolve 一个决策点（D1 → D2 → D3），等用户回答再进下一个。
