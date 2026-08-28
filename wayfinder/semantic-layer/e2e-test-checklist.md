# 语义层 / Ontology UI 功能测试清单

> 前置：`pnpm dsh web` 成功启动（http://127.0.0.1:3080），使用 data-agent profile。

## 启动方式

```bash
# 杀残余进程
lsof -ti:3080 | xargs kill -9 2>/dev/null

# 启动
cd /path/to/deepseek-harness-da
pnpm dsh web
```

---

## A. Sidebar Trigger（语义层入口按钮）

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| A1 | 页面加载后，sidebar 底部出现"语义层"按钮 | 可见按钮（icon + 文字 in wide mode, 仅 icon in rail mode） | ☐ |
| A2 | 点击按钮（无已有管理 session） | 创建新 session，preset = `semantic-layer-management` | ☐ |
| A3 | 点击按钮（已有管理 session） | 恢复已有 session（不创建新的） | ☐ |
| A4 | 点击按钮后 | 右侧 details panel 自动打开 | ☐ |
| A5 | sidebar 收缩为 rail 模式 | 按钮变为 36×36 圆形（仅 icon） | ☐ |

## B. 管理 Agent 对话

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| B1 | 新管理 session 的 persona | agent 自我介绍为语义层管理助手 | ☐ |
| B2 | 输入"搜索 DAU" | agent 调用 `search_schema` tool | ☐ |
| B3 | 输入"查看 dws_daily_active_user 的定义" | agent 调用 `get_definition` tool | ☐ |
| B4 | 输入"查看覆盖统计" | agent 调用 `get_coverage` tool | ☐ |
| B5 | 输入"发现 dws_pay_order 的关系" | agent 调用 `discover_relations` tool | ☐ |
| B6 | 输入"运行 eval" | agent 调用 `trigger_eval` tool | ☐ |

## C. Tool Presenters（对话中结构化卡片）

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| C1 | search_schema 调用后 | 对话中渲染搜索结果卡（资产名 + 类型 badge + 域标签） | ☐ |
| C2 | get_definition 调用后 | 对话中渲染定义卡（字段表 + 关系列表） | ☐ |
| C3 | get_coverage 调用后 | 对话中渲染 KPI 卡（table/event/metric 计数 + confirmed/draft） | ☐ |
| C4 | discover_relations 调用后 | 对话中渲染 diff 卡（+标记 + relation type badge: joins/derived_from/related_to） | ☐ |
| C5 | trigger_eval 调用后 | 对话中渲染 eval 结果卡（pass rate + delta summary） | ☐ |

## D. Schema Explorer（右侧详情面板 — 资产浏览器）

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| D1 | 管理 session 中打开 details panel | Schema Explorer 面板可见 | ☐ |
| D2 | Domain 导航 | 显示"所有域"下拉 / 列表 | ☐ |
| D3 | Tab 切换（表/事件/指标） | 三个 tab 正确切换内容 | ☐ |
| D4 | 搜索功能 | 输入关键词过滤资产列表 | ☐ |
| D5 | 点击资产 | 展示 AssetDetail（字段、分区、关系等） | ☐ |
| D6 | "在知识图谱中查看"按钮 | 若 contextLayer 可用则打开全屏图谱 | ☐ |

## E. Evidence Sidebar（右侧详情面板 — 证据侧栏）

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| E1 | 管理 session 中 | EvidenceSidebar 组件渲染（即使数据为空显示占位） | ☐ |
| E2 | Coverage Panel | 显示 table/event/metric 计数 | ☐ |
| E3 | Eval Trajectory | 显示 eval 运行时间线（若有历史数据） | ☐ |
| E4 | Eval Delta View | 显示两次运行对比（improved/regressed/unchanged） | ☐ |
| E5 | Gap Panel | 显示 join-reachable 但无 eval 覆盖的资产 | ☐ |

## F. GoalDock（对话底部 Goal 卡片）

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| F1 | 管理 session 中设置 goal | GoalDock 显示 objective + phase | ☐ |
| F2 | Goal 进行中 | 显示 round counter | ☐ |
| F3 | Eval sparkline | 若有 evalPassRates 数据则显示 SVG 折线 | ☐ |

## G. B→A Layout Auto-flip

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| G1 | evalRunCount < 3 | Shell 渲染触发按钮（B 布局） | ☐ |
| G2 | evalRunCount ≥ 3 + evidenceClient 可用 | Shell 渲染 DashboardView（A 布局） | ☐ |

## H. 非管理 session 隔离

| # | 测试项 | 预期结果 | 通过 |
|---|--------|----------|------|
| H1 | 普通对话 session | GoalDock 不渲染 | ☐ |
| H2 | 普通对话 session | EvidenceSidebar 不渲染 | ☐ |
| H3 | 普通对话 session | SchemaExplorer 不渲染 | ☐ |

---

## 已知限制（测试时可跳过）

- **Query 执行**：query-maxcompute 未配置 `maxcConfigPath` 时 graceful degrade，NL2SQL 全链路不可用
- **LLM 调用**：需 `DEEPSEEK_API_KEY` 或 AGA 配置，否则 agent 无法响应
- **Evidence 数据**：首次运行无历史 eval 数据，E3/E4/E5/G2 需先执行 trigger_eval
- **Context Layer**：D6 需 `ui-context-layer` 插件挂载（W10），否则按钮不显示
