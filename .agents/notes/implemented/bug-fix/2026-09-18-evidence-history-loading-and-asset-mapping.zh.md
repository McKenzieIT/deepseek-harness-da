# Agent Note: Evidence 历史加载与资产映射

Status: implemented

[English](2026-09-18-evidence-history-loading-and-asset-mapping.md) | 中文

## 问题

Evidence Dashboard 可在 `getEvalRunCount()` 观察到持久化运行后进入 evidence-first 布局，但 history 和 delta 面板仍为空。计数、结果查询和 delta 已共享同一个解析后的 `EvalResultStore`；Client 没有在 Dashboard 挂载时请求历史，sidebar 也只有在选择资产后才请求历史。

持久化 eval case 包含 `caseId`，但尚未携带持久的 case 到资产 identity。file-backed store 使用 `caseId` 作为 `assetId` fallback，因此资产筛选可能返回空结果，并被误解为该资产的权威 evidence。

## 决策

`useEvidenceQuery.fetchEvalHistory()` 拥有 Client 历史加载序列。它查询按记录时间排序的最新十条运行聚合行，不向浏览器发送对应 case 记录，并请求最新两次运行的 delta。Dashboard 和 sidebar 调用同一操作；Dashboard 在挂载时请求全局历史，sidebar 在没有选择时请求全局历史，有选择时请求按资产筛选的视图。资产筛选实际应用时，delta 使用同一资产范围；若映射在比较前变为不可用，请求会失败。选择变化导致请求重叠时，只有最新请求可以发布 history、delta 或错误。

`EvalResultStore` 记录每条存储记录是否具有可靠资产 identity。程序化添加的记录具有明确资产 id。file-backed 记录只有在提供 case 到资产 resolver 时才可靠。`evalResultQuery()` 报告 `assetFilterStatus`；只有每条候选记录都有可靠映射时才应用资产筛选；否则它返回其他条件匹配的全局历史并报告 `unavailable`，而不应用 `caseId` fallback。`hasResultsFor()` 也忽略 fallback id。

`EvalTrajectory` 按运行显示一行，而不是按 case 记录显示一行。即使全局回退为空，不可用的资产筛选仍会明确显示。自动布局统计解析后的不同 run id；展示的 history 和 delta 始终来自查询结果，从不使用文件数量。

Client 插件等待 `remote.schemaGateway` 和 `remote.evidenceQuery` 后再构造对应 RPC client，避免在 namespace 注册前把 `null` 永久注入组件。管理入口使用当前 `layout.openRightbar(true, false)` API；已移除的 `openDetails()` 不能继续作为可选调用。

## 考虑过的替代方案

**把 `caseId` 当作 `assetId`。** 这会保留旧的空筛选结果，但让缺少 case 到资产映射来源 看起来像资产没有 eval coverage 的证据。

**选择资产前隐藏历史。** 这会保留旧 sidebar 行为，但即使存在全局运行，evidence-first Dashboard 仍为空。

**增加第二个 run-history store 或 endpoint。** 现有 store 已拥有解析后的记录和运行 id。第二个数据源会重新引入 W18 最初怀疑的漂移。

## 后果

旧 JSONL 仍可读取并在全局视图显示。只有真实 resolver 或未来 evaluation identity owner 提供映射后，按资产查看的历史才可用。Evaluation T13 继续负责持久的 case 到资产映射来源；本改动不发明该映射。

## 测试

聚焦 store 测试覆盖明确映射、不可用的旧映射、回退到全局结果以及 `hasResultsFor()`。Dashboard 组件测试覆盖 loading、empty、error、single-run 和 multi-run 状态，包括最新两次运行的 delta 选择。Hook 测试覆盖重叠的 history 与 delta 请求。Sidebar 集成测试覆盖选择前的全局历史、空的 unavailable 回退和选择后的资产筛选请求。Client apply 测试固定 typed Remote 依赖和当前 right-sidebar API。W24 记录缺失的 keyless recorded-session Web snapshot composition。
