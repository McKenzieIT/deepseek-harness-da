# GA-GRILL-search-asset-id-normalization — SchemaExplorer search-hit prefixed id → evidence mismatch

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open  ·  **Claim**: —
**Source**: [subagent code review of GA-WIRING-impl](GA-WIRING-impl-session-scoped-slot-store.md)（2026-09-03，M1 finding）
**Priority**: medium
**Blocked by**: 无

## 问题（grill 前先读这些确认）

GA-WIRING-impl 的 store wiring 把 SchemaExplorer 的 `selectedAsset`（`.name`）共享给 EvidenceSidebar 作 `selectedAssetId` → evidence 后端 `gapAnalysis(assetId)`/`evalResultQuery({assetId})`。**LIST 路径**（domain-detail 的 table/event/metric 列表）传 bare name（`t.table_name`/`e.name`/`m.name`），与 evidence-query 后端 `assetId` 契约（`EvalResultFilters.assetId` JSDoc = "table_name, event name, or metric name"）对齐 ✓。但 **SEARCH 路径** 传 `SchemaSearchHit.id`，而 `inferKindFromId`（检查 `event:`/`evt_`/`metric:`/`m_` 前缀）暗示 event/metric 的 search-hit id 带前缀——该前缀 id 作 `selectedAssetId` 流到 evidence 后端，后端期望 bare name → 不匹配 → search 选 event/metric 时 GapPanel/EvalTrajectory 空（本票声称修复的症状，仅在 search 入口复现）。

读确认：`rg 'inferKindFromId\|onSelect\(hit.id\|handleAssetClick' packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx`（看 search→select 路径）+ `EvalResultFilters.assetId` JSDoc（`packages/data/evidence-query/src/types.ts`）。

## 背景

- `packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx`：`SearchResults` → `onSelect(hit.id, kind)`（`kind = inferKindFromId(hit.id)`）→ `handleAssetClick(hit.id, kind)` → `actions.select({ name: hit.id, kind })`。`inferKindFromId` 检查前缀 `event:`/`evt_`/`metric:`/`m_`，暗示 production search-hit id 对 event/metric 带前缀。
- evidence 后端 `EvalResultFilters.assetId` JSDoc（`packages/data/evidence-query/src/types.ts`）= "table_name, event name, or metric name"（bare）。`typert.remote-client.d.ts` 的 `gapAnalysis(assetId)`/`assetHealth(assetId)` 同。
- **不确定项（grill 前置）**：production schema-gateway 的 search 是否真返回带前缀的 id？`inferKindFromId` 的存在暗示是，但可能是防御性启发式；test fixture `SchemaExplorer.spec.tsx` 的 `SEARCH_RESULTS` 用 `event:recharge_event` 是测试作者选择，非 production 证据。需读 schema-gateway 后端 search 实现确认 id 格式（后端定位待查——evidence-query 后端在 `packages/data/evidence-query/`，schema-gateway 后端待定位）。
- GA-WIRING-impl **激活**了此 quirk：之前 `selectedAsset` 是本地 useState（不到 EvidenceSidebar）；现在经 session-scoped store 流到后端。GA-WIRING-impl 的 risk #1 resolution 仅查 LIST 路径即下结论"对齐、无需规范化"——**over-broad**（search 路径不一致），本 grilling 纠正之。
- LIST 路径（table/event/metric 列表点击）正确，本 grilling 只管 search 路径。

## 四个方向

### A. SchemaExplorer search 路径剥前缀
`SearchResults`/`handleAssetClick` 里把 `hit.id` 的前缀剥掉得 bare name 再 `actions.select({ name: bareName, kind })`。
- **pro**：客户端修复，不动后端/store；最小。
- **con**：`inferKindFromId` 的前缀列表是否穷尽 production 格式？剥错→kind 错或 name 残前缀；schema-gateway 若改 id 格式，客户端 heuristic 滞后。

### B. selection store 存规范化 id
store 在 `actions.select` 时规范化（存 bare name）而非原 `hit.id`。
- **pro**：集中规范化，单一来源。
- **con**：store 不该懂 schema-gateway id 格式（泄漏）；且 SchemaExplorer 的 `selectedAsset` 还用于自身 AssetDetail/`loadAssetDefinition`（也吃 name）——规范化点要在写入前，store 已晚。

### C. schema-gateway 后端 search 返回 bare id（上游根治）
后端 search 返回 bare name + 显式 kind（或保持 id 但 client 不靠前缀 infer kind）。
- **pro**：根治；client `inferKindFromId` 可删；list/search id 一致。
- **con**：动后端（`packages/data/schema-gateway`? 待定位）；上游升级路径影响；可能 breaking（其他 consumer 依赖 prefixed id？）。

### D. 不修（记录 search 路径不驱动 evidence fetch）
search 选 event/metric 不触发 evidence fetch（只 list 路径驱动）；UI 上 search hit 点击只做 schema 浏览，不联动侧边栏。
- **pro**：0 改动。
- **con**：用户从 search 选 event/metric → 侧边栏空——体验不一致；与 GA-WIRING-impl "选中资产→侧边栏出数据" outcome 部分冲突。

## Grilling 问题（逐个 grill，逼出真正取舍）

1. **production 真 id 格式**：schema-gateway 后端 search 实际返回的 `SchemaSearchHit.id` 对 event/metric 是否带前缀？读后端 search 实现确认。若 bare → M1 非真问题（`inferKindFromId` 仅防御），close 本票。
2. **前缀穷尽性**：`inferKindFromId` 的 `event:`/`evt_`/`metric:`/`m_` 是否覆盖 production 全部格式？有无遗漏/未来新增？
3. **规范化点**：A（客户端 search handler）/ B（store）/ C（后端根治）/ D（不修）？选哪个？
4. **后端 breaking**：C 改后端 search id 格式，是否有其他 consumer 依赖 prefixed id？breaking 影响？
5. **测试覆盖**：选定方向后补 search-hit→`actions.select`→evidence-fetch 测（GA-WIRING-impl L1 gap）。

## 决策门槛

grill 到能答"production search id 真格式"+"规范化点（A/B/C/D）"后定方向。定后开实施票。

## 不 grill 就不能定的事

- production search id 是否真带前缀——这决定 M1 是否为真 bug（若 bare，M1 消失，close）。
- 规范化点——A/B/C 三处各有 trade-off，需 grill 出"谁该懂 id 格式"的责任边界。
