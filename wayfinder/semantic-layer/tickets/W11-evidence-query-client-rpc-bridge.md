# W11 — Evidence-query client RPC bridge

**Type**: task
**Status**: Open
**Blocked by**: W4（evidence-query host service，已 Closed）——已解阻；依赖 W6 UI 接线占位（commit `4fc80b0cb6`，已落地）
**Resolved**: —

## Question

把 host 侧 `ctx.evidenceQuery`（W4 EvidenceQueryService：coverageQuery / gapAnalysis / reachabilityDelta / evalResultQuery / assetHealth / beforeAfterDelta）接到 client UI：构造 client-side `EvidenceQueryClient` face（`useEvidenceQuery` hook 消费的那个），替换 `packages/client/ui-semantic-layer/src/client/wiring.tsx` 里三处 `TODO(evidence-query-rpc)` 占位，让 EvidenceSidebar + GoalDock sparkline + auto-flip A 模式拿到真实数据。

## 背景

- **W4 已完成 host 侧**：`EvidenceQueryService`（Cordis Service，`ctx.evidenceQuery`）+ `FileBackedEvalResultStore`（读 W3 JSONL）+ `beforeAfterDelta`。**host 有数据。**
- **W6c/W6d UI 接线已完成**（commit `4fc80b0cb6`）：GoalDock 挂 `conversation.input.dock`、EvidenceSidebar 挂 `details.aux`、A/B auto-flip、sparkline——但 client 拿不到 evidence-query，三处占位：
  - `wiring.tsx` `SemanticLayerEvidence`：`evidenceClient={null}` + `evalRunCount={0}` + `evalPassRates={[]}`
  - GoalDock sparkline 收 `[]` → 不渲染
  - auto-flip：`evalRunCount=0` → 永远停 B，A 模式 dashboard 不触发
- **先例**：W1 SchemaGateway 是"read-only Remote projection of ctx.schema for client UI consumption"——已通过 Remote 把 host `ctx.schema` 暴露给 client UI。evidence-query 可镜像此模式。

## 待决 / 实现点

1. **evidence-query 的 Remote 化**：确认 `evidence-query` 是否已是 `TypertRemoteService`（client 可调）。若否，参照 schema-gateway 把需要的查询面（`coverageQuery` / `gapAnalysis` / `evalResultQuery` / `assetHealth` / `beforeAfterDelta` + `getEvalStore().getRunIds().length` + 最近 N 次 run 的 pass_rates）暴露为 Remote 方法。
2. **client `EvidenceQueryClient` 构造**：`useEvidenceQuery`（`packages/client/ui-semantic-layer/src/client/hooks/useEvidenceQuery.ts`）消费的 `EvidenceQueryClient` face 当前无 client 侧构造（`wiring.tsx` 注 `null`）。在 ui-semantic-layer `apply()` 或 connection API 处构造它（调 Remote），传给 `SemanticLayerEvidence` adapter。
3. **接线替换占位**（`wiring.tsx` 三处 `TODO(evidence-query-rpc)`）：
   - `evidenceClient={null}` → 真实 client
   - `evalRunCount={0}` → 真实 run count（`getEvalStore().getRunIds().length` 的 client 侧读取）
   - `evalPassRates={[]}` → 真实最近 N 次 run 的 pass_rates
4. **reactivity**：evalRunCount / evalPassRates 需在 eval run 完成后更新 UI——确认 Remote 调用 + 订阅机制（订阅 eval-store 变更，或把 run-count/pass-rates projection 化走 `useProjection`）。

## 验收

- [ ] management 会话中 EvidenceSidebar 的 CoveragePanel 显示真实 coverage stats（与 SchemaGateway.getCoverageStats 一致）
- [ ] GapPanel 显示真实 gap（选中资产后）
- [ ] EvalTrajectory 显示真实 run 时间线 + pass_rate
- [ ] EvalDeltaView 显示真实 before/after delta
- [ ] OnDemandEvalTrigger 触发真实 eval（经 eval-runner-service）+ 完成后刷新
- [ ] GoalDock sparkline 显示真实 evalPassRates
- [ ] auto-flip：`evalRunCount≥3` → A 模式（DashboardView hero）真实触发
- [ ] `wiring.tsx` 三处 `TODO(evidence-query-rpc)` 移除
- [ ] vitest 全绿（新增 client bridge 测试；ui-semantic-layer + ui-layout 无回归）

## 参考

- W4（host EvidenceQueryService，已 Closed）
- W1（SchemaGateway Remote 先例——host ctx → client UI 的暴露模式）
- W6c / W6d（GoalDock / B→A layout——UI 占位接线，commit `4fc80b0cb6`）
- `packages/client/ui-semantic-layer/src/client/wiring.tsx`（三处 `TODO(evidence-query-rpc)`）
- `packages/client/ui-semantic-layer/src/client/hooks/useEvidenceQuery.ts`（client `EvidenceQueryClient` face）
- `packages/data/evidence-query`（host EvidenceQueryService 实现）
- 解阻 E2E：E2（Evidence-Query 数据）、E5（Evidence Sidebar 真实数据）、E9（真实 eval 数据）、E10（A 模式 auto-flip）、E11（sparkline）
