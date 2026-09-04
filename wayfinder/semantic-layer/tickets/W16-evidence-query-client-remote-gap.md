---
type: task
status: open
blocked_by: []
---

# W16: evidence-query 客户端 remote 缺口 —— 证据 UI 在生产中是死的

**Branch**: `fix/w16-evidence-query-client-remote`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

## 事实（2026-09-03 代码核查）

服务端**齐全**，客户端那一半**从未接上**。`evidenceClient` 在生产里恒为 `null`。

**服务端 ✅**：`packages/bundle/data-agent/cordis.patch.yml:187` 挂载
`evidence-query-gateway` → `EvidenceQueryGateway extends TypertRemoteService`
（`packages/data/evidence-query/src/gateway.ts:19`，`namespace: 'evidenceQuery'`，
8 个 `@Remote`：coverageQuery / gapAnalysis / reachabilityDelta / evalResultQuery /
assetHealth / beforeAfterDelta / getEvalRunCount / getRecentPassRates）。

**客户端 ❌ 两处缺失**：

1. `packages/data/evidence-query/package.json` **没有 `./remote` 导出**（也没有 `./typert`）。
   对照 `schema-gateway/package.json` 两者都有：
   ```
   "./typert": { ... "./lib/typert.host.js" },
   "./remote": { ... "./lib/typert.remote-client.js" }
   ```
   生成物 `evidence-query/lib/typert.remote-client.js` **存在**（2026-08-25，此后未再生成）
   但不可达。
2. `packages/api/remotes/src/client/index.ts:11` 只 import 了 `schemaGatewayRemote`，
   **全仓无任何 `@deepseek-ai/dsh-evidence-query/remote` 的 import**。

**后果链**：`remote.evidenceQuery` 恒 undefined →
`ui-semantic-layer/src/client/index.ts:115` `scope.get('remote.evidenceQuery')` → undefined →
`:128` `evidenceClient = null` → 以下全部拿不到数据：
- `useEvidenceMetrics` / `useEvidenceQuery`
- `SemanticLayerGoalDock`（W6c）
- `SemanticLayerEvidence` / `EvidenceSidebar` / `CoveragePanel` / `EvalTrajectory` /
  `EvalDeltaView` / `GapPanel`（W5-full）
- `DashboardView` + B→A auto-flip（W6d）——`SemanticLayerShell.tsx:66` 要求
  `effectiveMode === 'A' && evidenceClient`，`evidenceClient` 为 null 则**永远**进不了 A
- W15 的 push 订阅（`subscribeInvalidation` 挂在 evidenceClient 上）

**经验证据**：46 个已 serve 的 plugin bundle 里 grep `evidenceQuery`，
只在 ui-semantic-layer 自己的 bundle 里命中 3 处字符串字面量；
`schemaGateway` 在 `dsh-api-remotes/client.js` 里命中 81 处。

## 与 map 的矛盾

map 的 Decisions-so-far 把 W11 记为「wiring.tsx 三处 TODO 替换为真实数据；98 tests 全绿」、
W15 记为「`useEvidenceMetrics` useEffect 订阅→refresh()；94 tests 全绿」。
**测试全绿但生产零数据**——因为测试直接注入 fake client，从不走
`scope.get('remote.evidenceQuery')` 这条真实解析路径。W12/W13 是同一个形状
（组件测试直调 handler，不经真实 G6 事件/渲染）。

## 范围

1. `evidence-query/package.json` 补 `./typert` + `./remote` 导出（照抄 schema-gateway）
2. 重新生成 `typert.remote-client`（`schema-gateway` 的产物是 2026-09-03，
   evidence-query 停在 08-25）
3. `packages/api/remotes/src/client/index.ts` import + 装配 `evidenceQueryRemote`
4. **补一条真实解析路径的测试**：断言 `remote.evidenceQuery` 在装配后可解析
   （不是注入 fake client 的组件测试——那种测试正是这个 bug 能存活的原因）

## 顺带（同一条死链上）

- `wiring.tsx:97` `SemanticLayerEvidence` 不传 `selectedAssetId` →
  `EvidenceSidebarContent` 的 asset-scoped effect `if (!selectedAssetId) return` →
  GapPanel + EvalTrajectory 永久空。需要与 SchemaExplorer 共享 selected-asset 信号。
  （GA-AUDIT1 标为 CRITICAL，data-agent map 记为「待定方向」）
- `DashboardView` **零 CSS**：`sl-dashboard` / `sl-dashboard__header` / `__title` / `__hero` /
  `__kpi-row` / `__detail` / `__workspace-link` 在任何 `.css` 里都不存在。auto-flip 一旦
  真能触发就是无样式溢出（在 56px rail / 264px sidebar footer 里）。
- `ui-semantic-layer/src/client/index.ts:121` `scope.remote.$on('evidence/eval-run-completed')`
  的 disposer 未捕获（`:200` 只 return `stopListSub`）→ reload / `connection/reset` 泄漏，
  持续 fire 进过期的 `invalidationListeners`。

## 验收

- `remote.evidenceQuery` 在真实客户端装配后可解析（测试断言，非 fake 注入）
- 浏览器实测：管理 session 里 GoalDock / EvidenceSidebar 显示真实 eval 数据
- `evalRunCount` 读到真实值（`.tmp/eval-results` 当前有 3 个 distinct runId，
  阈值为 3 → auto-flip 会立刻触发，所以 DashboardView 的 CSS 必须同批补上，
  否则修好 RPC 反而让按钮变成无样式溢出)
