# Semantic Layer v1 — E2E 测试清单

## 前置条件
- [ ] `pnpm install` 成功（275 workspace packages）
- [ ] `npx vitest run --no-coverage` 全量通过（含新增 93 tests）
- [ ] bundle 配置已挂载新包（cordis.yml 或 bundle config 添加 schema-gateway / evidence-query / ui-semantic-layer）

---

## 1. SchemaGateway (W1)

### 1.1 基本可达
- [ ] bundle 启动后 `ctx.get('schemaGateway')` 返回非 undefined
- [ ] Typert Remote 注册：client 可调 `remote.schemaGateway.listTables()`

### 1.2 资产列表
- [ ] `listTables()` 返回 321 条 K11 表（含 domains 字段）
- [ ] `listEvents()` 返回 445 条 K11 事件
- [ ] `listMetrics()` 返回 3916 条 K11 指标
- [ ] 每条记录的 `domains` 非空数组（验证 domain-first nav 前置）

### 1.3 资产详情
- [ ] `getTableDefinition('dws_10000251_com_pay_order_di')` 返回完整 columns/metrics/partitions
- [ ] `getEventDefinition('game.pay.order')` 返回 params_fields
- [ ] `getMetricDefinition('dws_10000251_com_pay_order_di__pay_amt')` 返回 computation.sql
- [ ] 不存在的名称返回 null（无异常）

### 1.4 搜索
- [ ] `search('充值 金额')` 返回 >0 条结果，score 递减
- [ ] `search('不存在的随机词汇xyz')` 返回空数组
- [ ] 写入新定义后，corpusVersion 递增 → 下次 search 使用新语料

### 1.5 域导航
- [ ] `listDomains()` 返回 10+ 域（与 K11 domains.yaml 一致）
- [ ] 每个域的 table_count + event_count + metric_count 非零

### 1.6 覆盖统计
- [ ] `getCoverageStats()` 返回 table_count=321, event_count=445, metric_count=3916
- [ ] `domain_counts` 各域总和 ≥ 总资产数（多域归属重复计数）

---

## 2. Evidence-Query (W4)

### 2.1 Coverage Query
- [ ] `coverageQuery()` 返回 enriched stats（含 confirmed/draft/rejected 分层）
- [ ] 总数与 SchemaGateway.getCoverageStats() 一致

### 2.2 Gap Analysis
- [ ] `gapAnalysis('dws_10000251_com_pay_order_di')` 返回可达但无覆盖的关联表
- [ ] 无 dimension_refs 的表返回空 gaps

### 2.3 Reachability Delta
- [ ] 添加一条新 joins relation → `reachabilityDelta()` 返回 >0 新可达对
- [ ] 移除 relation → delta 为 0

### 2.4 Asset Health
- [ ] `assetHealth('dws_10000251_com_pay_order_di')` 返回 confirmationStatus + relationCount
- [ ] 不存在的 assetId 返回 null

---

## 3. Eval Cases (W2) + Runner (W3)

### 3.1 Case 加载
- [ ] `loadCases(glob('cases/k11/*.yaml'))` 加载 161 条无报错
- [ ] 每条 case 的 dimensions.covered_assets 引用真实 K11 表名

### 3.2 Batch Runner（Stub Collaborators）
- [ ] `runBatch({ casePaths: [...161], passK: 1 }, stubCollaborators)` 完成无异常
- [ ] RunResult.summary.total === 161
- [ ] 结果持久化到 JSON 可读回

### 3.3 Delta 对比
- [ ] 跑两次 batch（stub 返回不同结果）→ `compareDelta(runA, runB)` 返回 flips
- [ ] DeltaReport.summary.improved + regressed + unchanged === 161

### 3.4 Health Gate
- [ ] stub collaborators → health 全 true
- [ ] 断开 executor → health.queryExecutor = false + error message

### 3.5 Infra Retry
- [ ] 模拟 ECONNREFUSED → 重试 2 次 → infra_failure verdict
- [ ] 非 infra 错误（如 TypeError）不重试

---

## 4. UI Semantic Layer (W5-lite)

### 4.1 插件加载
- [ ] bundle 启动后 sidebar slot 注册成功
- [ ] 浏览器访问管理界面可见"语义层"入口

### 4.2 Domain-first 导航
- [ ] 左侧面板展示所有域名
- [ ] 点击域名 → 右侧资产列表过滤为该域资产
- [ ] 所有域都有资产（无空域）

### 4.3 Kind 二级筛选
- [ ] 可切换 table/event/metric 视图
- [ ] table 视图下可进一步筛选 dws/dim

### 4.4 搜索
- [ ] 输入关键词 → debounce 后调用 SchemaGateway.search
- [ ] 结果按 score 排序展示
- [ ] 清空搜索框 → 恢复列表视图

### 4.5 资产详情
- [ ] 点击资产 → 右侧展示完整定义（字段列表/关系/域）
- [ ] 表定义：显示 columns + metrics + partitions + dimension_refs
- [ ] 事件定义：显示 params_fields + external_refs

### 4.6 Coverage Badge
- [ ] 每个资产条目显示 draft/confirmed 标签
- [ ] 标签颜色区分（confirmed=绿，draft=灰）

### 4.7 Evidence Sidebar (Placeholder)
- [ ] 侧栏显示占位文字 "eval 基建就绪后自动亮起"
- [ ] `evidence.enabled=false` 时无 eval 数据请求

---

## 5. UI Evidence Sidebar (W5-full)

### 5.1 Feature Flag 翻转
- [ ] 设置 `evidence.enabled=true` → 侧栏从占位切换为完整视图
- [ ] 无需代码变更，仅配置变更

### 5.2 Coverage Panel
- [ ] 展示 KPI 卡：表/事件/指标总数
- [ ] 展示 confirmed/draft/rejected 比例条

### 5.3 Gap Panel
- [ ] 选中资产后显示关联的未覆盖资产
- [ ] join path 可视化

### 5.4 Eval Trajectory
- [ ] 展示历次 eval run 时间线
- [ ] 每次 run 显示 pass_rate + case 计数

### 5.5 Delta View
- [ ] 展示最近一次 before/after delta
- [ ] 标注 improved / regressed / unchanged

### 5.6 On-Demand Eval
- [ ] 触发按钮可点击 → 显示 running 状态
- [ ] 完成后切换为 done + 刷新数据

### 5.7 Goal Dock
- [ ] 显示当前 goal 状态（phase + objective）
- [ ] blocked 时显示原因

---

## 6. Autonomous Goal Loop (W6, ③-gated)

### 6.1 NoProgressDetector
- [ ] 连续 N 轮无改进 → `shouldBlock()` 返回 true
- [ ] 一轮有改进 → counter 重置

### 6.2 GoalRoundDriver
- [ ] idle → running → evaluating → idle 状态流转正确
- [ ] 异常时进入 error 状态

### 6.3 Evolution Config
- [ ] B→A 路由切换配置正确读取
- [ ] layout='dashboard' 时落地页指向 evidence dashboard

---

## 7. 集成验证

### 7.1 全链路冒烟
- [ ] 用户提问 → SchemaGateway.search → NL2SQL 生成 SQL → 执行 → 返回结果
- [ ] 上述链路中语义层 toPromptContext 正确喂入 NL2SQL 引擎

### 7.2 写后一致性
- [ ] 通过 UI inline edit 修改表定义 → SchemaGateway.listTables 反映变更
- [ ] 修改后 corpusVersion 递增 → search 使用新语料

### 7.3 Enrichment 触发
- [ ] UI 手动触发 enrichment → dimension_refs 更新 → RelationGraph 重建

### 7.4 回归
- [ ] 现有 semantic-layer 142 tests 仍通过
- [ ] 现有 tool-search-data-sources 11 tests 仍通过
- [ ] 现有 eval core tests 通过（207 tests）

---

## 8. W6 UI 接线（E8-E11，2026-08-25 session）

> 状态：vitest 自动化通过（ui-semantic-layer 50 + ui-layout 58 = 108 tests，commit `4fc80b0cb6`）。代码审查（subagent）1 个 blocking——inject-factory 门控对 `agentPreset` 变化失效（会缓存 stale `active:false`）——已修复为组件内响应式 `useSessions` 读取并 amend。占位项标注 `TODO(evidence-query-rpc)`，待 client evidence-query RPC bridge。

### 8.1 E8 — GoalDock 接入 input dock
- [x] `SemanticLayerGoalDock` 注册为 `conversation.input.dock` 第 2 个条目（id `semantic-layer-evidence`，order 20，list slot 与 ui-goal 共存）
- [x] 仅管理 agent 会话渲染（响应式 `useSessions(s => s.byId[sessionId]?.agentPreset === PRESET_ID)` 门控；非管理会话 → null，ui-goal dock 不受影响）
- [x] `goalData` 由 `useProjection('goal')` 经 `toGoalDockGoalData` 适配（null/undefined → null）
- [ ] **TODO(evidence-query-rpc)**：`evalPassRates=[]` 占位 → sparkline 不渲染

### 8.2 E9 — EvidenceSidebar 接入 details 列
- [x] `details.aux` list slot 在 ui-layout 声明 + AppFrame DetailsColumn 与 `details`/DetailsPanel 并排渲染（共存，非替换——`details` 是 single-occupant）
- [x] `SemanticLayerEvidence` 挂入 `details.aux`，仅管理会话
- [x] 活跃侧栏带 `--mode-b` class；GoalDock + CoveragePanel 渲染
- [ ] **TODO(evidence-query-rpc)**：`evidenceClient=null` + `evalRunCount=0` 占位
- [ ] **手工 E2E**：`details` + `details.aux` 在 `.detailsCol` 叠放布局需视觉验收（审查者标注）

### 8.3 E10 — DashboardView 融入 A 模式 + auto-flip
- [x] `EvidenceSidebar` 新增 `layoutMode`（默认 'B'）+ `evalRunCount`（默认 0）；`computeEffectiveMode` 驱动 B/A
- [x] A 模式：EvalTrajectory hero + KPI CoveragePanel（DashboardView 核心融入，非独立路由）；B 模式：CoveragePanel 领先紧凑布局
- [x] `layoutMode='auto'` + `evalRunCount≥3` → A；`<3` → B（4 测试通过）
- [ ] **TODO**：`evalRunCount=0` 占位下 auto 停在 B，待 RPC bridge 接入真实 run count

### 8.4 E11 — EvalSparkline 占位
- [x] GoalDock sparkline 收 `[]` → 不渲染（不崩溃）；单点/2+点/等值分支已由 `GoalDock.spec.tsx` 覆盖
- [ ] **TODO(evidence-query-rpc)**：接入真实 eval pass rates

### 8.5 后续 ticket（占位项的统一来源）
- [ ] client evidence-query RPC bridge：接入 `evidenceClient`、`evalRunCount`（`ctx.evidenceQuery.getEvalStore().getRunIds().length`）、`evalPassRates`，替换 `packages/client/ui-semantic-layer/src/client/wiring.tsx` 中所有 `TODO(evidence-query-rpc)` 处
- [ ] ui-semantic-layer 既有类型债（presenters 的 `tool.call.toolview` 缺 ui-tool SlotMap 引用 + 行组件 `string|undefined`；包级 `t: (key:string)=>string` vs `TranslateNS`）——非本次引入，超出 W6 范围，另开票
- [ ] ui-semantic-layer 加入 `tsconfig.client.json` test aggregate 的 `references`（当前未引用 → 其 src 不被 CI client typecheck 覆盖；既有缺口，非本次引入）
