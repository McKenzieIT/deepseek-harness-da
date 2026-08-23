# R6 — Web UI 实现方案技术调研

> 状态：调研完成。本文给出语义层 Web UI 在 dsh 插件化架构下的技术实现路径，回答 G4 决策所需的可行性前提。

## 0. 结论速览

- **UI 插件模式成熟可直接套用**：dsh 的 Client UI Slot 系统对「新增一个完整管理页面」有清晰、被反复验证的 pattern（ui-workspace / ui-settings / ui-sidebar 均同构）。语义层 UI 是一个新 `ui-<name>` 包，遵循同样的 `src/client/index.ts → ctx.slots.register` 脚手架，无需任何基建前置。
- **Host↔Client RPC 路径明确**：`TypertRemoteService` + `@Remote()` 装饰器是 host Service 暴露方法给浏览器的标准通道，`dsh-typert-generator` 自动产出 client 侧 typed stub，`dsh-api-remotes` 装配挂载。`ctx.schema` 当前**没有** Remote 接口（只被 host 侧 tool 调用）——需新增一个 `SchemaGateway extends TypertRemoteService`，这是本方案唯一需要新写的「基建」代码，但属于既有 pattern 的机械重复，非架构创新。
- **图谱可视化无现成依赖**：仓库内无任何项目包直接依赖 React Flow / D3 / Cytoscape（pnpm-lock 中的 cytoscape/d3-* 为传递性/工具链产物，非应用依赖）。需新增一个前端依赖；推荐 **React Flow（`@xyflow/react`）**。
- **检索后端可复用**：`tool-search-data-sources` 的 `Bm25Linker` 跑在 host 内存，可直接包进新 `SchemaGateway` 的 `search()` Remote 方法暴露给 UI，无需在浏览器重建索引。

**G4 可决策性**：R5 推荐方案（三栏 + Domain 导航 + 多视图 + 详情抽屉）技术上**全部可落地**，无任何一项被架构阻塞。分阶段交付（只读→编辑→质量监控）天然可行，因为每个能力都对应一组独立的 Remote 方法 + slot 组件。

---

## 1. 现有 Web UI 插件结构分析

### 1.1 包的物理结构

每个 UI 插件是 `packages/client/` 下一个独立 workspace 包，命名 `@deepseek-ai/dsh-client-ui-<name>`。以 `ui-workspace`、`ui-sidebar`、`ui-settings` 三个实例为样本，结构高度同构：

```
packages/client/ui-<name>/
├── package.json              # dsh.client.inject 元数据 + peerDeps
├── src/
│   ├── index.ts              # host loader 入口（UI 插件通常空 apply()）
│   ├── invariant.ts          # 包级 invariant
│   └── client/               # 浏览器半（真正逻辑）
│       ├── index.ts          # apply(ctx) + inject 导出 + declare module
│       ├── <Component>.tsx    # React 组件
│       ├── <Component>.module.css
│       ├── contract/          # slot 类型契约（OwnerProps / Injected）
│       ├── locales.ts         # i18n zh/en
│       └── stores.ts          # zustand-style 局部 store（可选）
├── tests/
├── tsconfig.json
└── tsdown.config.ts
```

**关键点**：`src/index.ts`（host 半）对纯 UI 插件通常只是一个空 `export function apply(): void {}`，只为让该包出现在 host cordis.yml / Loader 中；真正的浏览器代码经 `exports["./client"]` 暴露，由 `package.json` 的 `dsh.client` 声明驱动发现。

### 1.2 package.json 约定（以 ui-workspace 为准）

```jsonc
{
  "name": "@deepseek-ai/dsh-client-ui-workspace",
  "type": "module",
  "exports": {
    ".":        { "types": "...", "default": "lib/index.js" },
    "/client":  { "types": "...", "default": "lib/client.js" },   // 浏览器入口
    "/src/*":   "./src/*"                                          // 源平面（workspace 内引用）
  },
  "dsh": {
    "client": {
      "inject": [ /* informational: 加载/预取元数据，非 apply 顺序约束 */ ],
      "platform": "web"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:^",
    ...
  }
}
```

### 1.3 slot 注册机制（核心 pattern）

浏览器入口 `src/client/index.ts` 的标准形态（取自 ui-sidebar，最简实例）：

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, zh, type SidebarKey } from './locales.ts'

// ① 声明合并：为本插件拥有的 i18n namespace 注册
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sidebar: SidebarKey }
}

// ② fiber 依赖声明（slots + locale + 业务 service）
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

// ③ apply：在 effect 中注册组件到目标 slot
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('sidebar', { zh, en }), '...')
  ctx.effect(() =>
    ctx.slots.register({
      name: 'sidebar',                 // 目标 slot key（layout 已声明）
      locale: 'sidebar',
      children: {                       // 本插件拥有的子 slot（声明 = 独占渲染权）
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings':  { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      },
      inject: () => ({ /* 传给组件的回调 */ }),
    }, SidebarRoot),
    'ui-sidebar: slot registration',
  )
}
```

**Slot 系统要点**（R3 已详述，此处只列 UI 实现相关）：

| 维度 | 取值 | 语义层 UI 用法 |
|------|------|----------------|
| `kind` | `single` / `list` / `keyed` / `chain` | 语义层主区域 = `single`（独占）；导航项可用 `list` |
| `scope` | `root` / `session` / `session-maybe` | 语义层管理页无会话绑定 → `root` |
| `children` | 子 slot 声明 | 详情抽屉、子视图切换可用子 slot |
| `store` | zustand-style store seat | 列表筛选/选中态可放局部 store |
| `inject` 工厂 | 返回传给组件的 props | 业务回调（打开详情、触发搜索） |

### 1.4 如何注册一个「新导航项 / 新页面」

dsh 当前**没有 URL 路由器**的概念——导航 = slot 占用。两种落地形态：

**形态 A：占用现有 slot**（轻量，推荐 v1）
- 语义层 UI 作为 `sidebar.settings` 或新增 `sidebar.<section>` slot 的 occupant，在 sidebar 内渲染一个管理面板。参考 `ui-settings-general` 占用 `sidebar.settings`。
- 优点：零布局改动，复用现有 AppFrame 三栏几何。
- 缺点：管理界面被压缩进 sidebar 宽度，不适合复杂三栏布局。

**形态 B：声明独立顶层页面 slot**（重，按需）
- 在 `ui-layout` 的 `root` slot 下新增一个 `semantic-layer` 顶层子 slot（`kind: single, scope: root`），语义层 UI 插件占用它，由一个导航触发器（sidebar footer action 或顶部入口）切换显示。
- 这需要改动 `ui-layout`（声明新 slot）或由语义层插件**自身**在 register `root` 时声明 children——但 `root` 已被 `ui-layout` 独占声明，重复声明会冲突。
- 结论：若要全屏管理页，正确做法是**扩 `ui-layout` 的 SlotMap 声明**，加一个 `semantic-layer` 顶层 slot + 一个 view-mode 切换器（类似 `details` 列的开关由 `ctx.layout` 拥有）。这是对布局包的一次小扩展，不是新发明。

> **G4 相关**：R5 推荐的「三栏布局」在 dsh 现有 Web 壳中需要形态 B 的布局扩展（全屏页），或退化为形态 A（sidebar 内嵌）。这是 G4「三栏 vs 两栏」决策的技术约束输入。

### 1.5 数据获取模式

样本插件展现了三种 client 取 host 数据的路径：

| 模式 | 实例 | 语义层 UI 适用性 |
|------|------|------------------|
| **框架全局 hook**（`useWorkspaces` / `ctx.sessions.search`） | ui-workspace | 这些 hook 内部封装了 RPC；语义层无现成 hook，需自建 |
| **Typert Remote namespace**（`ctx.remote`） | ui-settings（`settings/describe`）、ui-settings-plugins（`pluginInventory/list`） | **推荐主路径**——语义层只读查询走这条 |
| **legacy IApiClient 通道**（`connection.api`） | ui-model-selection | 旧 RPC，新功能不应再用 |

**ui-settings 的 `SettingsDescribeMirror` 是最佳参考样板**：它是一个 client 侧 mirror，订阅 host 的 `settings/document-updated` 转发事件（`ctx.remote.$on`）触发重新读取，loopback 时直接读 host、否则走 RPC。语义层 UI 的列表/详情数据流应复刻这个 mirror + 转发事件模式（语义层已有 `corpusVersion()` 版本号，可作为失效信号）。

---

## 2. Host ↔ Client 通信机制（typert Remote）

### 2.1 协议层全貌

```
Host 进程                              Browser
─────────                              ───────
SemanticLayerService                   ctx.remote (TypertClientRemote)
  (ctx.schema, 纯 host)                  ↑ $mount(contribution)
        ↑ 被调用                          │
SchemaGateway                           │  typed stub（d.ts 由 generator 产出）
  extends TypertRemoteService           │
  @Remote('listTables') listTables()    │
        ↓                               │
dsh-typert-generator  ──生成──→  packages/data/semantic-layer/lib/typert.remote-client.d.ts
        ↓                               │
TYPERT_REMOTE: TypertRemoteContribution │
        ↓                               │
dsh-api-remotes (client/index.ts) ──import value──→ ctx.remote.$mount()
```

### 2.2 host 侧：声明一个 Remote Service

以 `PluginInventoryGateway`（`packages/host/plugin-inventory/src/index.ts`）为标准范本——它是「host 状态 → 浏览器只读投影」的最简实例，与语义层 UI 的需求同构：

```ts
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export class SchemaGateway extends TypertRemoteService {
  static inject = ['schema']          // 依赖 ctx.schema（SemanticLayerService）

  constructor(ctx: Context) {
    super(ctx, 'semanticLayer')       // namespace 名
  }

  @Remote('listTables')
  listTables(): TableListSnapshot {
    return { tables: this.ctx.schema.getRegistry()... /* 投影只读切片 */ }
  }

  @Remote('search')
  search(query: string): SearchResult[] {
    // 复用 host 内存中的 Bm25Linker（见 §3.3）
  }
}
```

**机制要点**：
- `TypertRemoteService` 是 `Service` 子类，`super(ctx, name)` 注册到 `ctx.<name>`；其方法被 `@Remote('methodName')` 装饰后即对 client 可见。
- generator 从一个 **FaceModel** 产出两份产物：`lib/typert.host.d.ts`（host 侧 marker）和 `lib/typert.remote-client.d.ts`（client 侧 typed stub + `TYPERT_REMOTE` 值）。后者形如：
  ```ts
  declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespace$<hash> {
      listTables: () => Promise<RemoteResult<TableListSnapshot>>
    }
    interface TypertRemoteMap {
      'semanticLayer/listTables': () => Promise<RemoteResult<TableListSnapshot>>
    }
  }
  export declare const TYPERT_REMOTE: TypertRemoteContribution
  ```
- 方法返回 `Promise<RemoteResult<T>>`（成功/错误统一包装）。
- **scoped 方法**（绑 agentId/sessionId）走 `TypertRemoteScopeMap` 的 `agent:` 前缀——语义层 UI 是 `root` scope（无 session 绑定），不需要这层。

### 2.3 client 侧：装配与调用

1. **装配**：在 `packages/api/remotes/src/client/index.ts` 加一行 value import + `$mount`：
   ```ts
   import semanticLayerRemote from '@deepseek-ai/dsh-semantic-layer/remote'
   // ...
   for (const contribution of [..., semanticLayerRemote]) {
     disposers.push(await ctx.remote.$mount(contribution))
   }
   ```
   这使 `ctx.remote.semanticLayer`（namespace）在浏览器可用。

2. **调用**（在 UI 组件 / mirror 中）：
   ```ts
   const res = await ctx.remote.semanticLayer.listTables()
   if (!res.ok) throw new Error(res.error.message)
   return res.value
   ```

3. **类型**：client 业务包 `import type { TableListSnapshot } from '@deepseek-ai/dsh-semantic-layer/client'`（包的 `./client` 子路径投影 `./types`，零重复）。

### 2.4 转发事件（变更通知）

host 侧 cordis 事件经 `dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS` 白名单转发到浏览器，client 用 `ctx.remote.$on('event/name', handler)` 订阅。语义层写操作（syncWrite / updateTableMeta）已有 `corpusVersion()` bump 机制；UI 刷新路径：
- host 侧 `SchemaGateway` 在写操作后 emit 一个 cordis 事件（如 `semanticLayer/invalidated`，带新 corpusVersion）；
- 将该事件名加入 `API_REMOTE_FORWARDED_EVENTS` 白名单 + owner 包的 `./types` Events 声明；
- client mirror 订阅它 → 重新 `listTables()` / `search()`。

这是 `ui-settings` 的 `settings/document-updated` 模式的直接复刻，无新机制。

---

## 3. 语义层数据访问路径

### 3.1 现状判断

`ctx.schema`（`SemanticLayerService`）当前**只有 host 侧消费者**——被 agent tool（`tool-search-data-sources`、`tool-load-*-definition`、`tool-discover-relations`、`execute_metric`）直接调用。**没有任何 Typert Remote 接口**。因此 Web UI 要读语义层数据，**必须新增一个 `SchemaGateway` Remote service**（§2.2 的范本）。

这不是架构缺口，而是「该 host Service 尚未被任何 browser consumer 需要，故未投影」的自然状态——投影是按需的机械工作。

### 3.2 需要新增的 Remote 方法（按 R5 功能映射）

| UI 能力（R5） | 需要的 Remote 方法 | 对应 `ctx.schema` 现有能力 | 备注 |
|---------------|---------------------|-----------------------------|------|
| 浏览（列表） | `listTables` / `listEvents` / `listMetrics` | `loadTables`/`loadEvents`/`loadMetricDefinitions`（substrate 直读） | 投影为只读 summary 切片（不含全量 raw） |
| 详情 | `getTable(name)` / `getEvent(name)` / `getMetric(name)` | `loadTableDefinition`/`loadEventDefinition`/`loadMetricDefinition` | 直接投影 |
| 搜索 | `search(query, opts)` | `Bm25Linker`（在 tool-search-data-sources，host 内存） | 见 §3.3 |
| 关系/血缘 | `getRelations(name)` / `getRelationGraph(filter?)` | `getRelationGraph()` + `RelationGraph.getRelated`/`getDerived`/BFS | 图数据投影（节点+边），client 侧渲染 |
| scope 管理 | `listScopes()` / `getActiveScope()` | `ctx.scopes`（P1 决策的 `dsh-scope-registry`） | 走单独 namespace，非 `ctx.schema` |
| 编辑 | `updateTable(name, updates)` / `syncWrite(metas)` | `updateTableMeta` / `syncWrite`（已 Tier-2 审计） | 写方法，需转发事件 |
| 质量监控（覆盖率） | `getCoverageStats()` | 由 `confirmation.status` 字段本地聚合 | 纯计算，无新数据源 |
| 质量监控（新鲜度） | — | 当前 `freshness` 字段为空 | **需 ODPS 查询，延后**（G4 已识别） |

**结论**：除「新鲜度」外，R5 全部能力的数据访问路径都已被 `ctx.schema` 现有方法覆盖，只需在 `SchemaGateway` 里做只读投影包装。

### 3.3 搜索后端：BM25Linker 复用

`tool-search-data-sources` 的 `Bm25Linker` 已在 host 进程内存中持有语义层语料（通过 `ctx.schema.loadRetrievalCorpusAll()` 聚合 events+tables+metrics）。两条路径：

**路径 A（推荐 v1）：host 侧搜索，Remote 暴露**
- `SchemaGateway.search(query)` 直接调用 host 内存中的 `Bm25Linker`（或经 `ctx.schema.loadRetrievalCorpusAll()` 自建一个），返回 top-N `CorpusItem`。
- 浏览器零索引开销，延迟 = 单次 RPC + BM25 计算（K11 规模 3916 metrics + 445 events + 321 tables，亚毫秒级 BM25）。
- `corpusVersion()` 失效时 host 侧重建 linker（已有机制）。
- 满足 G4 提的「Cmd+K <100ms」——单次 RPC + 内存检索远低于此阈值。

**路径 B（按需）：client 侧索引**
- `listCorpus()` 一次性拉全量 → 浏览器自建 mini BM25（如 `minisearch`/`wuzzy`）。
- 适合「离线浏览 / 无 host 往返」场景，但 K11 全量语料体量（数千条）传输+索引成本不低，v1 不必要。

**结论**：路径 A 直接复用既有 `Bm25Linker`，无新建搜索后端的需要。G4「复用 BM25Linker vs 独立 UI 搜索后端」的决策倾向显然是前者。

### 3.4 数据流示意（host ↔ client）

```
┌─────────────── Browser (ui-semantic-layer 插件) ───────────────┐
│                                                                │
│  React 组件                                                     │
│    ↑ useSyncExternalStore                                       │
│  SemanticLayerMirror（client 侧，仿 SettingsDescribeMirror）     │
│    │  ensure() 首次拉取  load() 失效后重拉                      │
│    │  $on('semanticLayer/invalidated') → load()                │
│    ↓                                                            │
│  ctx.remote.semanticLayer.listTables() / search() / ...         │
│        │                                                        │
│        │  Typert RPC（typed stub，经 Connection transport）       │
└────────┼───────────────────────────────────────────────────────┘
         │
┌────────┼─────────────── Host 进程 ─────────────────────────────┐
│        ▼                                                        │
│  SchemaGateway (extends TypertRemoteService, inject: ['schema'])│
│        │  @Remote 方法投影只读切片                                │
│        ▼                                                        │
│  ctx.schema (SemanticLayerService)                              │
│    ├─ loadTables/Events/MetricDefinitions  (substrate YAML 直读)│
│    ├─ getRelationGraph()  (in-memory RelationGraph, BFS)       │
│    ├─ loadRetrievalCorpusAll() → Bm25Linker (host 内存)         │
│    ├─ corpusVersion()  (写操作 bump → 失效信号)                  │
│    └─ syncWrite/updateTableMeta (Tier-2 审计写)                 │
│           │  写后 emit 'semanticLayer/invalidated'              │
└───────────┼─────────────────────────────────────────────────────┘
            ▼  转发经 dsh-api-remotes 白名单 → 浏览器
```

---

## 4. 图谱可视化技术选型

### 4.1 现状

- 扫描所有 `packages/**/package.json`：**无任何项目包直接依赖** React Flow / D3 / Cytoscape / dagre / elkjs。
- `pnpm-lock.yaml` 中出现 `cytoscape`、`cytoscape-cose-bilkent`、`@types/d3-*`，但**无任何 workspace 包将其列为 dep**——属传递性/工具链产物（疑似某 dev/test 工具引入），非应用运行依赖。
- 结论：**需新增一个前端图谱依赖**。

### 4.2 候选评估

| 维度 | React Flow (`@xyflow/react`) | D3.js | Cytoscape.js |
|------|------------------------------|-------|--------------|
| React 集成 | 原生（React 组件） | 需手写 wrapper/生命周期管理 | 需 wrapper（imperative DOM） |
| DAG / 层级布局 | 内置 dagre/elk 可选插件 | 需手搭 `d3-hierarchy` | cose-bilkent 布局（lock 中已有但非应用 dep） |
| Bundle size | ~45KB gzip（core） | ~70KB+（按需子模块） | ~300KB+ |
| 交互（点击节点/选中/缩放） | 开箱即用 + 回调清晰 | 全自建 | 开箱即用但 API 偏底层 |
| 语义层契合度 | 高（节点=表/事件/指标，边=join/derived，需点击跳转详情） | 中（灵活但工作量大） | 中（图算法强，但本场景不需要复杂图算法） |
| 维护活跃度 | 活跃（v12，XYFlow） | 活跃 | 活跃 |

### 4.3 推荐

**React Flow（`@xyflow/react`）**，理由：

1. **集成成本最低**：dsh 前端是 React 18，React Flow 是原生 React 组件，与现有 slot 组件模式（`ctx.slots.register(..., Component)`）无缝；D3/Cytoscape 都需手写 imperative wrapper 处理 mount/unmount/HMR，违背仓库「effect 驱动生命周期」的约定。
2. **DAG 场景对口**：语义层关系图是典型 DAG（`derived_from` 有向、`joins` 无向），React Flow + `dagre` layout 插件直接产出层级布局；节点点击 → 触发详情抽屉（复用 R5 的详情交互）。
3. **Bundle 可控**：v12 支持按需子路径导入，core ~45KB gzip，对 dsh web 壳增量可接受。
4. **规模匹配**：K11 关系图节点量级（数百~数千），React Flow 渲染性能充足；无需 Cytoscape 的大图优化。
5. **延后空间**：图谱可视化在 R5 六类能力中属「质量监控/血缘」，非 v1 必需（map 已将「关系图谱可视化」列为 Ontology Phase 4，**当前 Out of scope**）。因此该依赖可在 v2 血缘视图阶段才引入，v1 不背此依赖。

> **G4 相关**：R5 提及的「血缘图」若进 v1，需引入 React Flow；若延后（贴合 map 的 Phase 4 = Out of scope），v1 零图谱依赖。建议 G4 将血缘图划出 v1。

---

## 5. 推荐插件结构模板

### 5.1 包脚手架

```
packages/client/ui-semantic-layer/
├── package.json
├── src/
│   ├── index.ts                    # host 半：空 apply()
│   ├── invariant.ts
│   └── client/
│       ├── index.ts                # apply(ctx) + inject + declare module + slot 注册
│       ├── SemanticLayerBrowser.tsx       # 主管理组件（列表/卡片视图）
│       ├── SemanticLayerDetail.tsx        # 详情抽屉
│       ├── SemanticLayerSearch.tsx       # 搜索框（Cmd+K）
│       ├── RelationGraphView.tsx          # v2：血缘图（React Flow，按需 lazy）
│       ├── contract/
│       │   └── slots.ts                   # OwnerProps / Injected 类型
│       ├── mirror.ts                      # SemanticLayerMirror（仿 SettingsDescribeMirror）
│       ├── locales.ts                     # zh/en
│       └── stores.ts                      # 筛选/选中 store
├── tests/
│   └── mirror.client.spec.ts
├── tsconfig.json
└── tsdown.config.ts
```

### 5.2 host 侧配套（新包或并入 semantic-layer 包）

`packages/data/semantic-layer/src/remote.ts`（或独立 `packages/host/semantic-layer-remote/`）：

```ts
export class SchemaGateway extends TypertRemoteService {
  static inject = ['schema']
  constructor(ctx: Context) { super(ctx, 'semanticLayer') }

  @Remote('listTables')  listTables(): TableListSnapshot { ... }
  @Remote('listEvents')  listEvents(): EventListSnapshot { ... }
  @Remote('listMetrics') listMetrics(): MetricListSnapshot { ... }
  @Remote('getTable')   getTable(name: string): TableDefinitionView | null { ... }
  @Remote('search')     search(query: string, opts?: SearchOpts): SearchResult[] { ... }
  @Remote('getRelations') getRelations(name: string): RelationView { ... }
  @Remote('updateTable') async updateTable(name: string, updates: ...): Promise<WriteResult> { ... }
}
```

### 5.3 bundle 挂载

`packages/bundle/web-app/cordis.patch.yml`（或 data-agent 叠加层）：
```yaml
- insert:
    - id: semantic-layer-remote
      name: '@deepseek-ai/dsh-semantic-layer-remote'   # 或并入主包
- insert:
    - id: ui-semantic-layer
      name: '@deepseek-ai/dsh-client-ui-semantic-layer'
```

并在 `dsh-api-remotes` client 装配里 mount `semanticLayerRemote`。

---

## 6. R5 推荐方案可行性判断

| R5 推荐 | 可行性 | 前置 | 工作量 |
|---------|--------|------|--------|
| 三栏布局（导航+列表+详情抽屉） | ✅ 可落地 | 形态 B 需扩 `ui-layout` SlotMap 声明一个顶层 `semantic-layer` slot + view-mode 切换；形态 A（sidebar 内嵌）零前置 | M（形态 B）/ S（形态 A） |
| Domain 导航主轴 | ✅ | scope = 纯 namespace（P1 已决策），`ctx.scopes.listScopes()` 提供 | S |
| Kind-first 退为 filter | ✅ | `ctx.schema.getRegistry().allPlugins()` 已天然分 kind（event/table/metric） | S |
| 全局搜索 Cmd+K | ✅ | 复用 host `Bm25Linker` 经 `SchemaGateway.search()` 暴露；<100ms 满足 | M |
| 详情抽屉（不离开列表） | ✅ | 子 slot 或局部 store + Drawer 组件（ui-primitives 有 Modal/HoverCard 可参考） | S |
| 多视图切换（列表/卡片/DAG） | ✅ | 列表/卡片 v1 即可；DAG 视图依赖 React Flow，延后 | M（含 DAG）/ S（不含） |
| 编辑（行内+modal） | ✅ | `ctx.schema.updateTableMeta`/`syncWrite` 已 Tier-2 审计；经 `SchemaGateway.updateTable` Remote 暴露 + 转发事件 | M |
| scope 管理 | ✅ | P1 的 `dsh-scope-registry`（`ctx.scopes`）提供，独立 namespace | S |
| 质量监控（覆盖率） | ✅ | `confirmation.status` 字段本地聚合，`getCoverageStats()` 纯计算 | S |
| 质量监控（新鲜度） | ⚠️ 延后 | 需 ODPS 查询，`freshness` 当前为空 → 需 live-ODPS provider（P6b Q3 deferred） | L（且依赖外部） |
| 血缘图（DAG 可视化） | ✅ 但建议 v2 | 引入 React Flow；map 已将关系图谱可视化列为 Phase 4 = 当前 Out of scope | M |
| 指标预览 | ✅ | `execute_metric` tool 已实现（P4）；可经 Remote 暴露或直接复用 agent | M |

### 增量交付策略（回答 R6 §5）

分 plugin 交付可行且推荐，每个 plugin 对应一组 Remote 方法 + slot 组件，独立 mount/unmount：

1. **v1-a 只读浏览**（S）：`SchemaGateway` 的 list/get/search + `ui-semantic-layer` 浏览/搜索/详情抽屉。**最高 ROI**——直接让语义层从「代码存在不可见」变为「可浏览可搜索」。
2. **v1-b 编辑**（M）：加 `updateTable`/`syncWrite` Remote + 转发事件 + 编辑 UI。使定义可改，摆脱「只能改 YAML」。
3. **v2 质量监控 + scope 管理**（S~M）：`getCoverageStats` + `ctx.scopes` namespace。
4. **v2 血缘图**（M）：引入 React Flow + `getRelations`/`getRelationGraph`。
5. **延后**：新鲜度（需 live-ODPS provider）。

---

## 7. 工作量估计汇总

| 交付单元 | 工作量 | 说明 |
|----------|--------|------|
| `SchemaGateway` Remote service（list/get/search/relations 投影） | M | 既有 pattern 的机械重复；generator + 装配 + 类型投影 |
| `ui-semantic-layer` v1-a（浏览+搜索+详情） | M | slot 注册 + mirror + 组件；仿 ui-workspace/ui-settings |
| `ui-layout` SlotMap 扩展（顶层页，若形态 B） | S | 加一个 `semantic-layer` slot + view-mode |
| v1-b 编辑（Remote 写方法 + 转发事件 + 编辑 UI） | M | Tier-2 审计已有；事件白名单 + mirror 刷新 |
| v2 质量监控（覆盖率） | S | 纯聚合，无新数据源 |
| v2 scope 管理 UI | S | `ctx.scopes` 已有 |
| v2 血缘图（React Flow） | M | 新依赖 + 图数据投影 + 布局 |
| 新鲜度监控 | L | 阻塞于 live-ODPS provider（P6b Q3 deferred），非本 map |

**v1（只读浏览+搜索+详情）总估**：M ~ M+（一个 SchemaGateway + 一个 UI 插件 + 可选的 layout 扩展）。

---

## 8. 给 G4 的可行性结论

1. **R5 全部推荐方案技术可行**，无架构阻塞。唯一需新写的「基建」是 `SchemaGateway`（一个 `TypertRemoteService` 子类），属既有 pattern 的重复，非创新。
2. **唯一外部阻塞**是「新鲜度监控」——依赖 live-ODPS provider（P6b Q3 deferred），建议 G4 将其划出 v1。
3. **血缘图**建议划出 v1（map 已将关系图谱可视化列为 Phase 4 = Out of scope），避免 v1 引入 React Flow 依赖。
4. **搜索后端**复用 `Bm25Linker`（host 内存经 Remote 暴露），无需独立 UI 搜索后端；<100ms 满足。
5. **三栏布局**在 dsh 壳中有两种落地形态（sidebar 内嵌 vs 全屏顶层页），是 G4「三栏 vs 两栏」决策的技术输入——全屏三栏需小扩 `ui-layout`。
6. **增量交付**天然可行：v1-a（只读浏览）→ v1-b（编辑）→ v2（质量/血缘），每段独立 plugin + 独立 Remote 方法集。

G4 可据此进入功能范围/交互/优先级决策。
