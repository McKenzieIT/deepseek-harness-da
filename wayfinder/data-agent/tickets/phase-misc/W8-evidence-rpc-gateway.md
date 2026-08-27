# W8 — Evidence RPC Gateway + Store 热加载 + UI Wiring

**Type**: task
**Phase**: misc（管理 UI 基础设施）
**Status**: resolved
**Blocked by**: 无

## Question

`evidence-query` 是 plain Cordis Service（`ctx.evidenceQuery`），无 `@Remote` 表面。Client `ui-semantic-layer` 的 `evidenceQueryBridge.ts` 已写好完整 RPC 客户端（coverageQuery/gapAnalysis/evalResultQuery/beforeAfterDelta/assetHealth + getEvalRunCount/getRecentPassRates），但对端不存在 → `wiring.tsx` 传 `evidenceClient={null}` → DashboardView 不可达、EvidenceSidebar 渲染空。

同时，运行时 evidence-query 内部 `EvalResultStore` 为空（`FileBackedEvalResultStore` 仅测试构造，无运行时 JSONL 注入）。

## 做法

### 1. EvidenceQueryGateway（仿 SchemaGateway）

新建 `TypertRemoteService`（可在 `evidence-query/` 包内加 `gateway.ts` 或新包 `evidence-query-gateway/`）：
- `@Remote coverageQuery()` → delegate `ctx.evidenceQuery.coverageQuery()`
- `@Remote gapAnalysis(assetId)` → delegate
- `@Remote evalResultQuery(filters)` → delegate
- `@Remote beforeAfterDelta(runIdA, runIdB)` → delegate
- `@Remote assetHealth(assetId)` → delegate
- `@Remote getEvalRunCount()` → `ctx.evidenceQuery.getEvalStore().getRunIds().length`
- `@Remote getRecentPassRates(n)` → 从 store 读最近 N 个 run 算 pass rate

### 2. Store 热加载

`eval-runner-service` 跑完 `runBatch` persist JSONL 后，emit `evidence/eval-run-completed` event → `evidence-query` 监听 → `FileBackedEvalResultStore.reload(resultsDir)` 重建 in-memory store。

或：`EvidenceQueryService` 构造时 new `FileBackedEvalResultStore(resultsDir)` 直接读盘（evalRunner 的 resultsDir config 可注入）。

### 3. UI Wiring

`ui-semantic-layer/src/wiring.tsx`：
- `evidenceClient = useRemote('evidenceQuery')` → 真 bridge
- `evalRunCount` / `evalPassRates` 从 bridge live query
- `computeEffectiveMode` 自然 flip 到 'A' → DashboardView 渲染

### 4. Bundle patch

`cordis.patch.yml` 加 evidence-query-gateway 行（如新包）或确认 evidence-query 自带 gateway 已注册。

## 验证

- web UI → management session → 右栏 EvidenceSidebar 显示真实 coverage 数据
- GoalDock sparkline 有真实 pass rate 数据
- `trigger_eval` 后刷新 → delta 显示

## 关联

- [schema-gateway](../../packages/data/schema-gateway/) — W1 模式参照
- [ui-semantic-layer wiring](../../packages/client/ui-semantic-layer/src/wiring.tsx) — 接入点
- [evidenceQueryBridge](../../packages/client/ui-semantic-layer/src/client/hooks/evidenceQueryBridge.ts) — 已写好的 client 适配
