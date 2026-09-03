# GA-WIRING-impl — selectedAssetId 跨 sibling 共享（session-scoped slot store）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-03 · wayfinder session (GA-WIRING-impl)
**Source**: [GA-GRILL-wiring resolution](GA-GRILL-wiring-selectedAsset.md)（2026-09-03 grilling 锁定方向 D）
**Priority**: high
**Blocked by**: 无

## Question

实施 GA-GRILL-wiring 锁定的方向 D：用框架 session-scoped **slot store**（`defineStore` + 在两个 `details.aux` entry 上声明同一 handle）把 SchemaExplorer 的选中资产信号共享给 EvidenceSidebar，修复生产侧 GapPanel/EvalTrajectory 永久空。

## 背景（grilling 查到的现实）

- projection 是 **log-derived**：host 从 session 事件日志 fold 出值（`session-projection` doc：`apply(state, event)` 折每个 committed `SessionEvent`，值持久化、服务端算），客户端 `useProjection` 只读、**不能 publish**。临时 UI 选中状态不是 session log event → 方向 A（`useProjection('selection')`）错配机制，出局。
- 框架已有 session-scoped slot store：`defineStore`（`runtime/contract/store.ts`）造 handle；entry 注册时声明 `store:`；`ui-renderer/scoped-slots.tsx` 的 `standardKit` 在声明 `store:` 的 entry 上注入 `kit['useStore'] = observableHook(store)`（uSES selector hook）+ `kit['actions'] = store.actions`（写 mutator）。两个 entry 声明**同一 handle** → `storeOf`→`resolveStore` 按 handle×sessionId 索引 → 共享一个 per-session 实例；session 死则 `pruneStoreScope` 清。
- `index.ts` 既有 `evidenceClient`/`schemaClient` 已是按 session（`ctx.inject([...], scope => …)` 回调内构造）注入 sibling adapter 的先例。
- `EvidenceSidebar` 本就吃 `selectedAssetId?: string`，asset-scoped effect `if (!selectedAssetId) return` → `fetchGapAnalysis`/`fetchEvalResults`。只需把信号接上。
- 多 session 真实（`sessions.list.byId`、session-scoped inject、`pruneStoreScope`）→ 机制必须 session-scoped；模块单例（B）会串。

## Scope

### S1：新建 selection store（新文件）

- `packages/client/ui-semantic-layer/src/client/selectionStore.ts`（新）：
  - `export interface SelectionAsset { name: string; kind: AssetKind }`
  - `export interface SelectionState { selectedAsset: SelectionAsset | null }`
  - `export const selectionStore = defineStore({ init: () => ({ selectedAsset: null }), actions: { select: (d, asset: SelectionAsset | null) => { d.selectedAsset = asset } } })`
  - `defineStore` from `@deepseek-ai/dsh-client-runtime/client`（`contract/store.ts` 导出）；`AssetKind` from `./hooks/useSchemaGateway.ts`。
  - handle 模块级单常量 → 所有 session 共享同一 handle 对象，实例仍 per-session（`resolveStore` 按 handle×session 索引）。

### S2：两个 details.aux entry 声明同一 store handle

- `packages/client/ui-semantic-layer/src/client/index.ts`：
  - import `selectionStore`。
  - SchemaExplorer entry 的 `scope.slots.register({ …, id:'semantic-layer-schema-explorer', …, store: selectionStore, inject: () => ({ schemaClient, onNavigateToGraph: resolveNavigateToGraph() }) }, SemanticLayerSchemaExplorer)`
  - Evidence entry 的 `scope.slots.register({ …, id:'semantic-layer-evidence', …, store: selectionStore, inject: () => ({ evidenceClient }) }, SemanticLayerEvidence)`
  - 同一 handle → 两 sibling entry 共享一个 per-session store 实例。`store:` 与 `inject:` 共存（scoped-slots.tsx `standardKit` + `runInject` 支持；`runInject` 把 `actions` 作 inject factory 第二参，但 kit 已直接铺 `useStore`/`actions`）。

### S3：SchemaExplorer 写选中资产到 store

- `packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx`：
  - 删本地 `const [selectedAsset, setSelectedAsset] = useState<{ name: string; kind: AssetKind } | null>(null)`。
  - props 加 `useStore` + `actions`（kit 注入；见 S5）。
  - `const selectedAsset = useStore((s: SelectionState) => s.selectedAsset)`
  - `handleAssetClick`：`actions.select({ name, kind })`（替 `setSelectedAsset`）。
  - `handleDomainClick`/`handleTabChange`/`handleBack`：`actions.select(null)`（替 `setSelectedAsset(null)`）。
  - `AssetDetail` 仍读 `selectedAsset`（现来自 store）。

### S4：SemanticLayerEvidence 读 store → 喂 EvidenceSidebar

- `packages/client/ui-semantic-layer/src/client/wiring.tsx`：
  - `SemanticLayerEvidence`：props 解构加 `useStore`；`const selectedAsset = useStore((s: SelectionState) => s.selectedAsset)`；`<EvidenceSidebar … selectedAssetId={selectedAsset?.name ?? undefined} />`。
  - `SemanticLayerSchemaExplorer`：props 解构加 `useStore, actions`，透传给 `<SchemaExplorer useStore={useStore} actions={actions} … />`。

### S5：props 类型

- `wiring.tsx`：`SemanticLayerEvidenceProps` / `SemanticLayerSchemaExplorerProps` 加 store-kit 字段——`useStore: SnapshotSelectorHook<SelectionState>`、`actions: { select(a: SelectionAsset | null): void }`（`SnapshotSelectorHook` from `@deepseek-ai/dsh-client-ui-slots`）。renderer 在 `store:` 声明时注入这两个 kit 字段（见 `ui-renderer/src/client/scoped-slots.tsx` `standardKit`）。先确认 `PropsRuntime<'details.aux'>` 是否已含 store-kit 组合类型；无则手动 `&`。

## 验收标准

1. `pnpm run typecheck`（`tsc -b` 含 ui-semantic-layer）0 新增错误。
2. `pnpm run constraints` 不受影响（无新包、无 manifest 改动；ui-semantic-layer 既已合规）。
3. 单测：mount 两 sibling adapter（同一 session provide bundle、同一 store handle）→ SchemaExplorer `actions.select({name:'orders',kind:'table'})` → EvidenceSidebar 的 `useEffect` 以 `selectedAssetId='orders'` 触发 `fetchGapAnalysis`+`fetchEvalResults`（mock `EvidenceQueryClient` 断言调用参数）。
4. 多 session 隔离：两个 management session 各选不同资产不串（`resolveStore` 按 sessionId 索引 → 各自实例；构造性保证 + 一条断言）。
5. 手测/e2e：management session 里 SchemaExplorer 点 table/event/metric → EvidenceSidebar 的 GapPanel + EvalTrajectory 出数据（不再空）；GoalDock/CoveragePanel 不受影响。
6. 不引入手搓 store/zustand——用框架 `defineStore` + `store:` seat（`dsh-find-simplifications` 不应标"hand-rolled store where framework has slot store seat"）。
7. AssetDetail + `onNavigateToGraph` 行为不退化。

## 风险 / 待确认

- **asset id 契约**：SchemaExplorer 资产 `name`（schema-gateway 命名）是否 == evidence-query 后端 `assetId` 格式？若不一致（evidence 期望 `table:orders` 而 schema 给 `orders`），选中后 fetch 取不到。impl 时确认两套 id 对齐（必要时在 store 存规范化 id 或加映射）。
- **props 类型**：`useStore`/`actions` 是 renderer 在 `store:` 声明时注入的 kit 字段；确认 `PropsRuntime<'details.aux'>` 是否已含、或需手动 `&` store-kit 类型（参考 scoped-slots.tsx `standardKit`）。
- **`store:` + `inject:` 共存**：两 entry 同时声明 `store:` + `inject:`——`standardKit` 铺 `useStore`/`actions`、`runInject` 跑 inject face；impl 验证两 seat 同 entry 共存无冲突。

## Key files

- `packages/client/ui-semantic-layer/src/client/selectionStore.ts`（新）
- `packages/client/ui-semantic-layer/src/client/index.ts`
- `packages/client/ui-semantic-layer/src/client/wiring.tsx`
- `packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx`
- 参考：`packages/client/runtime/src/client/contract/store.ts`（`defineStore`）、`packages/client/ui-renderer/src/client/scoped-slots.tsx`（`store:` → `useStore`/`actions` kit 注入）、`docs/subsystems/session-projection.md`（projection 为何不适用）

## Resolution (2026-09-03)

实施方向 D：框架 session-scoped slot store（`defineStore` + 两 `details.aux` entry 声明同一 handle → per-session 共享实例）。SchemaExplorer 写选中资产到 store，EvidenceSidebar 读 `selectedAsset.name` 作 `selectedAssetId`，接上原本断开的 asset-scoped effect（`fetchGapAnalysis`/`fetchEvalResults`）。

### 改动文件（additive-only，只动 ui-semantic-layer）

- **新** `packages/client/ui-semantic-layer/src/client/selectionStore.ts`：`createSelectionStore()` 工厂（`defineStore`，`init: {selectedAsset:null}`，`actions.select(asset)`），导出 `SelectionAsset`/`SelectionState`/`SelectionStoreProps`（= `PropsStore<ReturnType<typeof createSelectionStore>>`）。
- `packages/client/ui-semantic-layer/src/client/index.ts`：apply 期构造 `const selectionStore = createSelectionStore()`；两个 `details.aux` entry（`semantic-layer-evidence` + `semantic-layer-schema-explorer`）都声明 `store: selectionStore`；inject 工厂不变。
- `packages/client/ui-semantic-layer/src/client/wiring.tsx`：`SemanticLayerEvidenceProps`/`SemanticLayerSchemaExplorerProps` 各 `& SelectionStoreProps`；`SemanticLayerEvidence` 读 `useStore(s => s.selectedAsset)` → `selectedAssetId={selectedAsset?.name}`；`SemanticLayerSchemaExplorer` 透传 `useStore`/`actions` 给 `SchemaExplorer`。
- `packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx`：删本地 `useState`；`selectedAsset` 改读 `useStore`；`handleAssetClick`→`actions.select({name,kind})`、`handleDomainClick`/`handleTabChange`/`handleBack`→`actions.select(null)`；props 改 `type SchemaExplorerProps = SelectionStoreProps & {...}`。
- **新** `packages/client/ui-semantic-layer/tests/wiring-store.client.spec.tsx`：验收 #3（两 sibling adapter 共享一实例 → `actions.select` → EvidenceSidebar effect 以 `selectedAssetId='orders'` 触发 `gapAnalysis('orders')`+`evalResultQuery({assetId:'orders',limit:50})`）、清空再触发（re-arm）、验收 #4（一 handle 两 per-session 实例隔离）、S3 click→`actions.select`（#5 机制）。
- `packages/client/ui-semantic-layer/tests/SchemaExplorer.spec.tsx`：S3 使 `useStore`/`actions` 成为 required props；既有 8 测加真实 store 实例 + `bindUseStore`（uSES 绑定，等价 production `observableHook`）。

### 验证结果

- `pnpm run typecheck`（`build:lib:host` + `tsc -b tsconfig.client.json`）：**0 error**（含 ui-semantic-layer 及下游消费者）。
- `pnpm run constraints`：exit 1，但 **ui-semantic-layer 不在失败列表**——失败全在其他包（`packages/eval/*` [并行 GA-EVAL-MANIFEST session]、`packages/data/tool-*`、`packages/credentials/*`、`packages/client/schema-form`/`web-react` [既有缺 package.json 目录]）。本票 additive、无 manifest 改动 → 无新增违规（验收 #2 "不受影响" 成立）。
- Vitest（ui-semantic-layer）：**12/12 pass**（4 新 + 8 既有 SchemaExplorer，无回归；含 onNavigateToGraph click→AssetDetail 路径验证真实 store + useStore re-render，验收 #7 不退化）。

### 3 个风险（票 "风险/待确认"）—— 全部 in-scope 解决，未开 follow-up grilling

- **asset id 契约（#1）**：**对齐**。`SelectionAsset.name`（schema-gateway 逻辑名 table_name/event name/metric name）== evidence-query 后端 `assetId`——权威 JSDoc `packages/data/evidence-query/src/types.ts` 的 `EvalResultFilters.assetId` 注 "table_name, event name, or metric name"；`typert.remote-client.d.ts` 的 `gapAnalysis(assetId)`/`assetHealth(assetId)` 同。无 `table:orders` 前缀方案（风险注假设被证伪）。store 直接存 `selectedAsset.name`、直传 `selectedAssetId`，无需规范化。（SchemaExplorer search-hit 的 `hit.id` 前缀 quirk 是既有、正交、不在本票 scope。）
- **props 类型（#2）**：**手动 `&`**。`PropsRuntime<'details.aux'>` 不含 store-kit（store share `PropsStore<H>` 在 register call site 单独组合进 `ComposedProps`）；两 adapter props + `SchemaExplorerProps` 各 `& SelectionStoreProps`。
- **`store:` + `inject:` 共存（#3）**：**结构可行**（typecheck + 测实测）。`runInject` 把 `(sessionId, actions)` 作 inject factory 位置参；既有 factory 忽略多参；kit 直接铺 `useStore`/`actions`。两 entry 同 handle + 同 session → `resolveStore` 共享一 per-session 实例。

### 遗留 / 备注

- **偏离票 S1 "模块级单常量"**：实施为 **factory `createSelectionStore()` apply 期构造**（非模块级导出），遵循框架明令 "Never export a handle at module level"（`store.d.ts` JSDoc："module-cache identity is a disguised singleton across plugin reloads"）+ `ui-conversation` chat store 先例（"Per-session chat store shared by conversation and details registrations… created at apply time so identity follows the fiber"——与本案同构）。**完全达成票的 intent**（一共享 handle 跨两 `details.aux` entry、per-session 实例 via `resolveStore`）。非 scope 扩大，是匹配该模式的仓库既定约定。`EngineStoreHandle`/`SelectionActions` 类型 twin、mutable state field、contextually-typed draft 均对齐 `ui-conversation/stores.ts`/`ui-layout/stores.ts`。
- **验收 #5（手测/e2e）**：click→`actions.select`→store→`useStore`→EvidenceSidebar effect→fetch 全链路单测覆盖（`wiring-store.client.spec.tsx`）。完整 app 级 e2e（management session + 真实 evidence-query/schema-gateway host 后端 → GapPanel/EvalTrajectory 出数据）需 running stack，属手测/e2e 步骤（单测已覆盖 #5 所依的行为契约）。
- 新文件 `selectionStore.ts` 全被测覆盖（`init`/`actions.select`/`select(null)`）。
- core 未动；未碰 `scripts/check-workspace-constraints.ts` 或其他包。

### Subagent review (2026-09-03)

用户要求 subagent code review + test。两个 general-purpose subagent 并行（read/run-only，不编辑）：

- **code review subagent** — verdict **APPROVED-WITH-NITS**。Critical/High **clean**。确认：convention adherence（`selectionStore.ts` 对齐 `ui-conversation/stores.ts` precedent——factory / `EngineStoreHandle` 返回 / `SelectionActions` type twin / mutable state / contextually-typed draft / apply-time 构造）、additive-only（`git status` 仅 6 文件，core/framework 未动）、`dsh-find-simplifications` clean（用 `defineStore`+`store:` seat 非手搓）、S1 deviation sound（apply-time 构造符合 "never module-level" 框架规则 + ui-conversation 先例）、hook order 正确（`useStore` 在 early-return 前无条件调用）、`actions` 在 `useCallback` deps 稳定（instance-cached）、`selectedAsset?.name→selectedAssetId` 无 stale/re-render-storm。
- **test subagent** — verdict **TESTS-GREEN-AND-SOUND**。`pnpm exec vitest run`（ui-semantic-layer 2 文件）= **12/12 pass**；`pnpm exec tsc -b tsconfig.client.json` = **0 error**。验收 #3（两 sibling adapter 共享一实例 → `actions.select` → EvidenceSidebar effect 触发 `gapAnalysis('orders')`+`evalResultQuery({assetId:'orders',limit:50})`）+ #4（一 handle 两 per-session 实例隔离）load-bearingly proven（args 匹配真实 call site）；`selectionStore.ts` 全覆盖（init/select/select(null)）；test-local `bindUseStore`（uSES over subscribe/getSnapshot）对 `selectedAsset` slice 忠实（ref-stable，无 storm/missed-update）。

#### M1 finding（Medium）→ follow-up grilling，未自行 inline 修

review 发现 **M1**：SchemaExplorer **SEARCH 路径**传 prefixed `SchemaSearchHit.id`（`event:`/`evt_`/`metric:`/`m_` 前缀，见 `inferKindFromId`）作 `selectedAsset.name` → `selectedAssetId` → evidence 后端期望 bare name（`EvalResultFilters.assetId` JSDoc = "table_name, event name, or metric name"）→ search 选 event/metric 时后端不匹配、GapPanel/EvalTrajectory 空。**LIST 路径**（table/event/metric 列表点击）正确（bare name）。本 wiring **激活**了此既有 quirk（原 `selectedAsset` 是 local useState，不达 EvidenceSidebar）。

**risk #1 纠正**：原 resolution 仅查 LIST 路径即下"对齐、无需规范化"结论——**over-broad**。LIST 路径对齐 ✓；SEARCH 路径 event/metric 前缀不一致 ✗。

**处理**：按 ticket scope 纪律（"asset id 契约真不一致 → 开 follow-up grilling，勿自行扩大 scope"），**未 inline 修 M1**——规范化点（A 客户端 search handler / B store / C schema-gateway 后端上游 / D 不修）是设计决策，且 production search id 真格式待确认。**开 follow-up grilling 票** [GA-GRILL-search-asset-id-normalization](GA-GRILL-search-asset-id-normalization.md)。`selectionStore.ts` 注释 N1 已就地纠正（LIST 对齐 / SEARCH 不一致 → follow-up）。

#### 其他 nits（review 提出，未阻断）

- **L1**（Low）：无 search-hit→select→evidence-fetch 测（会 catch M1）→ 并入 follow-up grilling 的实施票。
- **L2**（Low）：无 `active=false` gate / null `evidenceClient` 路径测（既有、跨切，pre-existing）。
- **N2**（Nit）：test-local `bindUseStore` 与 production `observableHook` 对 slice-stable selector 等价（已在 helper 注释说明 "slice-stable only" 假设）。
