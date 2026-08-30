# 取数模式 present_table 数据展示 UI:实现现状、Cordis 合规检查、前沿对照与优化方案

> 配套前沿调研见 [data-display-ui-patterns.md](./data-display-ui-patterns.md)(对话式 BI + 通用 agent 富结果展示 + 表格基线;**已完成第二轮 MCP 联网核验**:10/14 产品经官方页面/搜索结果核验,4 个标注"未核验";重要修正如"ChatGPT 表格为 interactive tables 而非静态 Markdown 表"已吸收进本文)。本文件聚焦 DSH 取数模式当前实现与可落地的优化路径。
> 证据来源:DSH checkout `packages/data/tool-present-table`、`packages/query/query-tool`、`packages/data/result-cache{-memory}`、`packages/client/ui-present-table`,以及 `wayfinder/interpretation-client-rendering/` 的 map / tickets(R1–R3、G1、T2)。

## 0. 结论速览

1. **是 Cordis 插件**:数据展示由静态 client Cordis 插件 `@deepseek-ai/dsh-client-ui-present-table`(`packages/client/ui-present-table/`)实现,通过 `ctx.slots.inject('tool.call.toolview')` 以 key `present_table` 替换通用工具卡片;host 侧 `tool-present-table` 注册同名模型工具。注册路径、slot 协议、生命周期均符合仓库 Cordis 纪律(Mode 3 Repository Package)。
2. **但存在正确性级缺陷**:客户端**完全忽略 `result_id`**,改为"同 turn 扫描最近一次 query_data 的渲染文本";而真实渲染文本首行是 `result_id: qr_xxx`、>50 行时带 `(... N more rows elided)` 标记 —— `parseTsv` 把它们当表头/数据行。**实测模拟:表头变成 `["result_id: qr_abc123"]`,列名行混入数据,行数显示错误**。测试夹具用理想化 TSV,从未覆盖真实格式,所以 52 个测试全绿但生产渲染错位。
3. **三个"高级能力"实际不可达**:虚拟滚动(>100 行)、CSV 下载(≥10000 行)、10000 行 cap —— 数据源文本被 `maxDisplayRows`(默认 50)截断,永远不会超过 ~50 行;KPI 聚合在这 50 行上计算,可能误导。
4. **G1 设计决策大面积未落地**:result store RPC、retry 按钮、LLM/UI 数据路径分离、object-layer LRU cache 都在 ticket 里定了,实现全部 bypass;而 host 侧 `ctx.resultCache`(完整行,含 `qr_`/`cr_` 键)其实**已经存在**,只缺 client RPC 通道——闭环成本比 R3 时代低得多。
5. 优化分四层:Phase 0 修解析/绑定正确性;Phase 1 补表格交互基线(排序/列固定/导出/主题);Phase 2 图表增强(类型切换/主题适配/懒加载);Phase 3 用 result-cache RPC 闭合 G1 架构(数据路径分离 + retry + 全量数据 + 服务端 KPI)。

## 1. 实现现状盘点

### 1.1 取数模式管线(四阶段)

`data-agent` preset(phase-gate 强制):UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION。
INTERPRETATION 交付顺序固定:`present_decomposition → present_table → compute → 【发现】→【注意】→ suggest_followups`。

### 1.2 数据面(host 侧工具)

| 包 | 角色 | 关键行为 |
|---|---|---|
| `packages/query/query-tool` | `query_data` 模型工具 | 执行 SQL,3-state 结果;`renderCompleted` 把 completed 结果渲染为 **TSV 文本**:`result_id: qr_xxx` 首行 → 列名行 → 数据行(截断到 `maxDisplayRows` **默认 50**)→ `(... N more rows elided)` → `(N rows)` 尾行 |
| `packages/data/result-cache-memory` | `ctx.resultCache` 服务 | `tools/post-execute` 钩子捕获 **完整未截断** query_data 结果,以确定性 `qr_<sha256(sql)[:12]>` 存入;compute 工具写 `cr_*` |
| `packages/data/tool-present-table` | `present_table` 模型工具 | 纯展示意图:`result_id, title, columns, column_types, sort_column, kpi_columns[], chart{line|bar}`;不携带数据,execute 只回显元数据 |

### 1.3 渲染面(client 插件)

- **注册**:`ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name, key: 'present_table' }, TableCard))`;`inject: ['slots']`。composition 行在 `packages/bundle/web-app/cordis.patch.yml`(id `ui-present-table`)。
- **数据绑定**:`selectQueryData(snapshot, blockSeq)` 从 `block.seq` 向后扫,取**最近的** `query_data` ToolResultNode 的 content 文本,`parseTsv` 解析;`args.columns` 覆盖表头;>10000 行截断 + CSV。
- **组件树**:header(折叠按钮 + title + 行数)→ KpiCards(客户端对解析出的字符串列做 sum/avg/max/min/count)→ PlainTable(≤100 行)/ VirtualTable(>100 行,flex 行 + ellipsis 单元格)→ ChartView(Chart.js line/bar,固定 240px)→ CsvDownload(仅 ≥10000 行)。
- **状态**:RunningToolCall → 骨架屏;`block.call === null`(窗口裁剪)→ 纯文本 fallback;`data === null`(扫不到 query_data / 解析失败)→ "数据已过期" 横幅 + 文本。**不读 `block.isError`**。
- **测试**:4 个 spec、52 tests;夹具 TSV 为理想格式(无 `result_id:` 行、无 elision 行)。

### 1.4 实证:生产数据流下的解析错位

用真实 `renderCompleted` 输出(maxDisplayRows=50,60 行结果)喂给 `parseTsv`(逻辑等价复现):

```
headers   = ["result_id: qr_abc123"]        ← 表头是 result_id 行
row[0]    = ["date","revenue","users"]      ← 真列名混入数据行
lastRow   = ["(... 10 more rows elided)"]   ← 截断标记混入数据行
rowCount  = 4(真实 60 行;正确解析应显示 2 行预览 + "共 60 行,前 50 行可见"提示)
```

后果:无 `columns` 覆盖时表头渲染成 `result_id: qr_xxx`;KPI 第一行解析 NaN 被过滤(侥幸)、图表 x 轴第一个 label 是列名、y 值 0 点污染曲线;多次 query_data 时还可能绑错结果(A1)。

## 2. Cordis 视角检查

### 2.1 是否是 Cordis 插件?

**是。** 三个 INTERPRETATION 展示插件(present_table / present_decomposition / suggest_followups)都是浏览器侧 Cordis 插件,走 `tool.call.toolview` keyed slot(key = 工具名),在 web-app bundle 静态注册 —— 属于 `dsh-plugin-development` 的 Mode 3(Repository Package),不是动态插件。host 工具与 client toolview 通过 **tool 名字约定** 耦合,无 RPC。

### 2.2 缺陷清单(按严重度分级)

#### A. 正确性缺陷(P0,用户直接看到错误数据)

| # | 缺陷 | 证据 |
|---|---|---|
| A1 | **数据绑定不按 `result_id`**:取"最近一次 query_data"。同 turn 多次查询(重试/对比)时绑错结果;`result_id` 指 `cr_*`(compute 派生)时永远显示"数据已过期" | `selectQueryData`;R3 已知风险("同 turn 可能有多次 query_data")但实现只取最近 |
| A2 | **解析协议与真实渲染格式不匹配**:`result_id:` 首行、elision 行被当数据(§1.4 实证)。契约存在于两个包之间却无共享类型/常量,query-tool 改 render 就静默破坏 UI —— 且已经发生了 | `query-tool renderCompleted` vs `parseTsv`;测试夹具未同步 |
| A3 | **50 行天花板 + KPI 误导**:虚拟滚动、CSV、10000 cap 不可达(源文本 ≤50 行);KPI/图表在截断样本上计算,聚合值可能严重偏离全量 | `maxDisplayRows: z.number().default(50)`;`MAX_DISPLAY_ROWS=10000` 永不触发 |
| A4 | **无 isError 处理**:present_table 自身失败(如非法 chart.type)时仍按 args 正常渲染,错误被吞(与 suggest-followups 早期缺陷 B6 同型,兄弟包已修) | TableCard 不读 `block.isError`;ChartView `'line' ? Line : Bar` 把非法类型静默渲染成 Bar |

#### B. 架构缺陷(G1 决策未落地 / 已过时的前提)

| # | 缺陷 | 对照设计 |
|---|---|---|
| B1 | **model-facing 渲染文本被当数据 API**:TSV+尾行格式是给模型看的,客户端反向解析。R3 自己写过"不需要从 content text 反向解析(成本高、脆弱)",方案 A 是明知妥协 | R3 §2/§3 |
| B2 | **result-cache 闭环只差最后一步**:host 已有 `ctx.resultCache`(完整行、`qr_/cr_` 键、含 sql/truncated/row_count 元数据),缺的只是 client 可调的 RPC surface。map 的"Not yet specified: Result store server-side 设计"在 R3 时代成立,result-cache 落地后已部分过时 | map.md;result-cache/src |
| B3 | **G1 决策 #2/#6 的 retry 按钮未实现**:"数据不可用 → 提示 + text fallback + retry(重拉 result store)";现实现只有横幅,无任何恢复路径 | G1 表格决策 2、6 |
| B4 | **G1 架构决策"LLM 数据路径 ≠ UI 数据路径"未实现**:设计要求 UI 走独立 result store RPC 取全量、LLM 只看采样;现状 UI 复用模型通道的 50 行采样 | G1 架构性决策 |
| B5 | **无契约护栏**:两包之间零共享 schema;测试夹具手写理想 TSV。建议:把 render 格式常量化进共享包 + 用真实 renderCompleted 输出做回归夹具(修 A2 的同时防复发) | 测试全绿但 §1.4 实测错位 |

#### C. 工程/表现力缺陷(P1-P2)

| # | 缺陷 | 说明 |
|---|---|---|
| C1 | **Chart.js 静态打进主 chunk**:`lib/client.js` 437KB(含 chart.js,~480 处引用);README 与 T2 ticket 声称 "lazy-loaded via React.lazy" 与代码不符(源码无任何 lazy/import()) | 误导性文档 + 首屏成本 |
| C2 | **无 locale 注册**:硬编码中文("数据已过期/下载 CSV/N 行");兄弟包 suggest-followups 已有 `locale: NS` + en/zh + `LocaleNamespaceMap` 增广 | i18n 惯例不一致 |
| C3 | **VirtualTable 语义/对齐缺陷**:div/span 无表格语义(无 role/aria-rowcount);thead 是独立 `<table>`、body 是 flex 行,列宽互不对应;单元格等宽 flex:1 + ellipsis,与内容宽度无关 | >100 行时(若未来可达)体验差 |
| C4 | **ChartView 主题与数据质量**:色板硬编码 rgba、坐标轴/图例用 Chart.js 默认灰(暗色模式下发乌);`parseFloat(x)\|\|0` 把非数值静默变 0;类别轴不当时间轴(日期不排序/解析);仅 line/bar,无类型切换、无交互(缩放/悬停数据点格式化) | 前沿基线:图表类型切换工具栏是共识兜底 |
| C5 | **表格零交互**:无排序(sort_column 参数收了但从未使用)、无筛选、无列宽拖拽、无固定列、无分页、无行点击、无复制;`column_types` 收了也没用(无数字右对齐/日期格式化)。经核验,ChatGPT 已把 DataFrame 渲染为 interactive tables —— 静态只读表已低于行业基线 | 行业最低门槛为 排序+筛选+固定列+CSV 导出 |
| C6 | **CSV 导出门槛错误**:仅 ≥10000 行出现(A3 使其永不出现),且只导出"已截断的展示行"而非 result-cache 全量;正确做法:任何行数都可导出、数据源走 host 全量结果 | CsvDownload 条件 `rows.length >= MAX_DISPLAY_ROWS` |
| C7 | **无障碍**:header 折叠按钮有 aria-expanded(好);表格无 caption/aria;VirtualTable 无语义;无键盘操作说明 | 前沿共识:Tab 可达是 baseline |

### 2.3 与兄弟插件的成熟度差(佐证"表现力较差"是相对的)

`ui-suggest-followups` 在前一轮优化后已具备:locale、isError 渲染、过期 chips 变 disabled(可回溯)、roving tabindex。而 `ui-present-table` 与 `ui-present-decomposition` 仍无 locale、无错误态;present-table 又是三者中唯一做"跨工具数据重构"的(复杂度最高、护栏最少),成熟度与风险倒挂。

## 3. 前沿调研结论(摘要)

> 详细分析、来源与核验状态见 [data-display-ui-patterns.md](./data-display-ui-patterns.md);仓库内另有一份来源核验过的 [R1 调研](../../workspace/deepseek-harness-da/wayfinder/interpretation-client-rendering/research/R1-llm-ui-rendering-patterns.md)(Genie/Fabric/ThoughtSpot/Hex 的 inline 表格 + 自适应图表 + KPI 卡 + 建议 chips 模式),两份结论互证。要点:

1. **表格交互已是行业标配(非可选项)**:OpenAI 帮助中心原文证实 ChatGPT 把 pandas DataFrame 渲染为 "**interactive tables**" —— 对话式产品也能承载交互式表格,**纯静态展示已是落伍做法**。必备项:列排序 + 筛选 + 列固定 + CSV 下载 + 大数据截断提示;AG Grid Enterprise / Power BI 是能力天花板参照。
2. **图表自动生成已成共识,但有三条实现路线**:PNG 静态图(基础)→ static/interactive 双模式(ChatGPT ADA:bar/line/pie/scatter 可 "Switch to interactive chart")→ React + Recharts 生成真正可交互代码(Claude Artifacts,自由度最高)。无论哪条路线,**必须给用户图表切换工具栏兜底**(模型选错图表类型是常态)。
3. **SQL/取数透明度是行业共识,但有三种架构路径**:暴露 SQL(Databricks Genie/Hex/Julius/ChatGPT;Genie 的可折叠 SQL + "Running query" 执行状态 + Edit SQL 是领先实践)、Search Tokens + 治理语义层(ThoughtSpot Spotter,企业级 no-hallucination 路线)、默认隐藏 + 性能分析器(Power BI/Tableau)。**不可完全不透明**;路径选择取决于目标用户。当前 DSH 的 present_table 卡片完全看不到 SQL(它在 query_data 卡片里,两个卡片割裂)——恰好 Genie 式"同卡折叠 SQL"是最贴合 DSH 场景的路径。
4. **追问建议紧贴结果卡片下方**(取数域共识:Genie/Spotter/Julius),DSH 的 suggest_followups 独立卡片在 present_table 之后,顺序正确但两者视觉上无关联。
5. **展示形态按用户分层**:业务用户内联卡片、分析师双栏 Artifact/Notebook、管理层嵌 BI 仪表盘;单一内联卡片无法覆盖全部 —— 长期可考虑"卡片 + 展开为侧栏全屏表格"混合形态。
6. **前沿方向 "Actionable Insights"**(已核验):ThoughtSpot Spotter 支持从洞察直接触发下游动作(Jira/Slack/Salesforce)—— "从洞察到行动" 是传统 BI 未做的增量;DSH 远期可让 suggest_followups 演进为"可执行动作"而不只是"追问文本"。

## 4. 前沿设计的优缺点

| 模式 | 优点 | 缺点/代价 |
|---|---|---|
| 内联富表格卡片(ChatGPT ADA、Genie、DSH 现状目标形态) | 与对话上下文强关联、实现直接、移动端友好 | 宽表/大表受对话列宽限制;交互深度有 ceiling;滚动离开后失联 |
| 双栏 Artifact/Notebook(Claude Artifacts、Hex) | 全宽数据探索、可迭代编辑、分析师友好 | 需要独立状态管理与布局;对轻量问答是杀鸡用牛刀;打断对话流 |
| 模型生成图表意图 + 用户可切换(Genie/ChatGPT,DSH 对齐方向) | 自动化收益大、错误有兜底 | 图表类型决策质量依赖模型;需要图表编辑 UI 成本 |
| 规则+生成混合建议(Perplexity/Cursor 模式) | 延迟低、相关性稳 | 规则模板维护成本;个性化弱 |
| 仪表盘嵌入(Power BI/Tableau) | 管理层消费形态、可分享 | 建设成本高、迭代慢;与对话式探索割裂 |

对 DSH 的含义:**内联卡片是正确的主形态**(游戏策划/运营的轻量取数场景),痛点不在形态选错,而在**表格基线能力缺失 + 数据绑定正确性**——这也是"表现力较差"观感的两个最大来源。

## 5. 优化方案(按成本/收益分层)

### Phase 0 — 正确性修复(必须,~1 天)

1. **修 parseTsv 协议**(A2):剥离 `result_id:` 首行、`(... N more rows elided)` 行;把格式常量(前缀/尾行正则)提进与 query-tool 共享的包,测试夹具改用真实 `renderCompleted` 输出(B5 护栏)。
2. **绑定校验**(A1 缓解):解析 query_data content 中的 `result_id` 行,与 `args.result_id` 比对,不匹配则继续向前扫描;都不匹配时显示"结果不匹配"而非错绑。
3. **补 isError**(A4):`block.isError` → 轻量错误行,不渲染富卡。
4. **CSV 条件修正**(C6):任何行数都提供导出(哪怕只导出当前解析到的行,并如实标注截断)。
5. **KPI 诚实化**(A3 缓解):当源数据被截断(elision 行存在)时,KPI 卡片加"仅基于前 N 行"角标,避免把样本聚合当全量。

### Phase 1 — 表格交互基线(高收益,~2-3 天)

6. **排序 + 类型感知格式化**:客户端列排序(数字/日期解析,用 `column_types`);数字列右对齐、千分位;`sort_column` 至少作为初始排序生效(现在参数完全被忽略)。
7. **列宽策略**:PlainTable 用真实 `<table>` 保持列对齐;VirtualTable 改为与表头共享列宽(或统一升级 TanStack Virtual 的表格虚拟化方案),补 `role="table"` 语义与 aria。
8. **locale 注册**(C2):补 `locale: NS` + zh/en,与 suggest-followups 对齐。
9. **图表懒加载**(C1):`React.lazy(() => import('./ChartView.tsx'))` + Suspense,兑现 README/T2 的既有承诺;顺带把 chart intent 不存在时的 0 成本变成真的。
10. **图表主题**(C4 部分):颜色改主题 CSS 变量/双色板,轴文字色随主题;`null/NaN` 显示为断点而非 0。

### Phase 2 — 展示力增强(中收益)

11. **图表类型切换工具栏**(line/bar/隐藏),前沿共识兜底;
12. **卡片级操作**:复制为 Markdown 表格、导出 CSV(全量,见 Phase 3)、全屏/侧栏展开(对话列宽内查看宽表);
13. **SQL 透明度**:卡片 header 加"查看 SQL"折叠区(从 query_data 卡片或 result-cache metadata 取),让取数过程与结果同卡呈现 —— 前沿调研结论 #3。

### Phase 3 — 架构闭合(G1 落地,依赖 host 侧小改)

14. **result-cache RPC surface**(B2):host 侧暴露按 `result_id` 取结果的 JSON 方法(现有 `ctx.resultCache.get` 直接包装,含 columns/rows/metadata);client 按 `args.result_id` 拉取**全量**数据,TSV 扫描降级为兼容 fallback。这是同时解决 A1/A2/A3/B1/B4 的单点改动。
15. **retry 按钮**(B3):"数据已过期"场景加 retry = 重发 RPC;G1 决策 #2/#6 原样落地。
16. **KPI 服务端化**(A3 根治):result-cache 存储时预计算常用聚合(UI 传 kpi intent,host 在 metadata 返回精确值),客户端不再对截断样本聚合。
17. **虚拟滚动 + 10000 cap 复活**:RPC 全量数据后,>100 行虚拟滚动、>10000 行 cap+CSV 才真正可达,现有代码直接生效。

### 明确不建议做的

- **不 takeover composer / 不做对话流 redesign**(R3 已论证;聚焦 toolview 卡片内进化);
- **不引入 AG Grid 级企业表格库**(依赖体积与主题改造成本高,当前场景 TanStack + 原生 table 足够;等宽表/透视需求出现再评估);
- **不做侧边 Artifact 双栏**(用户分层结论:取数域主用户是策划/运营,内联卡片 + 可展开已覆盖;分析师场景等真实需求出现再立项)。

## 6. 优先级建议

若只做三件事:**#1(修 parseTsv 协议+共享常量+真实夹具)→ #14(result-cache RPC 按 result_id 取全量)→ #6(排序+类型格式化)** —— 分别对应"数据是错的"、"数据是不全的"、"表格是死的"三个最痛的点;#14 完成后 #15-#17 几乎是顺手的。
