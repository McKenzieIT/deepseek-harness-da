# @deepseek-ai/dsh-client-ui-present-table

[English](README.md) | 中文

`present_table` INTERPRETATION 工具的工具视图卡片。将查询结果渲染为富数据表格，提供 KPI 汇总卡片、排序、虚拟滚动、SQL 透明展示与可选的 Chart.js 可视化。

## 渲染

当模型调用 `present_table` 时，本插件用一张富卡片替换通用工具行，展示：

- **顶部栏**：折叠开关 + 标题 + 行数（绑定的结果被截断时显示 `shown / total`）+ 行操作（复制 Markdown、下载 CSV）
- **SQL 折叠区**：一个收起状态的 "View SQL" 盒子，内容取自绑定的 `query_data` 调用参数
- **KPI 卡片**：来自 `kpi_columns` 的聚合值（sum, avg, max, min, count），当绑定的文本被显示截断时，附带一条明确的 "computed on a truncated sample" 提示
- **数据表格**：原生 `<table>`（≤100 行）或基于 ARIA grid 的虚拟表格（>100 行）；按列点击排序，使用类型感知比较（`column_types` 优先，否则对值做嗅探），数值列右对齐
- **图表**（可选）：Chart.js 4，通过 `React.lazy` 代码分割，因此在没有图表意图时 chart.js 永不加载。R4 原生类型集（line, bar, area, horizontal-bar, scatter, doughnut, bubble, radar, polarArea）渲染模型的 `chart.type`；客户端的列类型/基数校验器将不可行的选择降级为 bar，并附带一条如实提示的横幅（例如 scatter 数值列 <2、doughnut 类别 >8、line/area 的 x 不是日期）。工具栏提供按类型覆盖，以及 显示数值（通过自研的 `valueLabelsPlugin` 渲染数值标签，非径向点 >8 时跳过）和 仅数据（隐藏图表；上方的数据表格始终可见）
- **折叠/展开**：折叠状态显示标题 + KPI 卡片；展开状态显示 SQL + 完整表格 + 图表

数据绑定：主要行来源是结果存储的热缓存（`ctx.results`，一个会话级 LRU，基于 `result.get` RPC），通过 slot 的注入面（`fetchResult`）访问。`args.result_id` 解析完整条目；同一轮次内新鲜的 `query_data`（同一 id 的更高 `seq`）使陈旧条目失效并重新拉取（R5 fresh-vs-folded），因此卡片展示最新快照，而折叠/展开复用缓存条目，无需再次 RPC。同一轮次 `query_data` 的 TSV 扫描是缓存未命中的兜底：当结果缓存插件缺失（无 `fetchResult` 面）或宿主返回 `result-not-found` 时，卡片渲染它能看到的 TSV 行，保持既有的 `result_id` 不匹配 / `isError` 如实性。结果存储 RPC 已布线（R5/T8/T9）；TSV 扫描是过渡路径（见 wayfinder 工单 `R6-result-store-server-side`）。

兜底：工具运行中（或一次拉取在途）时显示骨架屏；当 `block.call === null`（窗口截断）时，`block.content` 以纯文本渲染；工具调用失败（`isError`）时渲染错误横幅；当没有查询结果绑定（结果存储不可用 / `result-not-found` 且同一轮次无 TSV）时，显示 "expired" 横幅加文本兜底和一个从结果存储重新拉取的重试按钮（G1 D2/D6：重试 = 重新拉取；重新执行查询是用户的事，不是卡片的）。

行数限制：最多 10,000 行；CSV 导出在任何行数下可用，导出当前已解析的行（截断在顶部行数中报告）。

本地化：卡片向 slot 注册 `present.table` locale 命名空间（zh/en），所有文案经 `t` 处理。

## 测试

4 个 spec 文件共 141 个测试；fixture（测试前置数据）使用真实的 `renderCompleted` 输出格式（result_id 行、省略标记、行数尾注），因此解析器约定不会与 `dsh-query-tool` 静默漂移，fetchResult 布线 spec 覆盖结果存储主路径、TSV 缓存未命中兜底、fresh-vs-folded 失效以及重试 = 重新拉取。R4 图表 spec 覆盖全部 9 种原生类型、`valueLabelsPlugin` 的绘制分支、校验器的降级为 bar 规则以及工具栏开关。

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包不扩展或失效 agent loop（智能体循环）的可复用请求前缀。

## 已知限制与延期工作

- **TSV 缓存未命中兜底是不完整的。** 当结果缓存插件缺失（无 `fetchResult` 面）或宿主返回 `result-not-found` 时，卡片兜底到同一轮次 `query_data` 的 TSV 扫描，只渲染工具结果文本携带的行——`renderCompleted` 格式在远低于 10,000 行完整结果上限处就显示截断（省略标记）。完整数据需要结果缓存（[R5](../../../wayfinder/interpretation-client-rendering/tickets/R5-object-layer-result-cache.md)/[T9](../../../wayfinder/interpretation-client-rendering/tickets/T9-result-cache-package-impl.md)）。
- **继承的 fresh-vs-folded 残余。** 卡片继承结果缓存的错过事件残余：一个在 `invalidateResult` 之后、在途拉取完成之前启动的 `fetchResult` 会合并到该在途拉取上，并接收到一次旧值。完整的 generation-token 加固推迟到缓存（R5 已知限制）；以 `freshSeq` 为键的失效是 v1 缓解。
- **重试是重新拉取，不是重新执行。** 重试按钮从结果存储重新拉取；重新执行查询是用户的事，不是卡片的（[G1](../../../wayfinder/interpretation-client-rendering/tickets/G1-design-decisions.md) D6）。
- **图表类型校验器降级为 bar。** 客户端列类型/基数检查将不可行的 `chart.type` 降级为 bar（scatter 数值列 <2、doughnut 类别 >8、line/area 的 x 既非日期也非有序数值序列、bubble 数值列 <3、radar/polarArea 不符合 entity × N-metric 形态）。line/area 接受日期 x 或数值 x（其单元格按行序单调非递减，即有序序列）；无序或非数值的 x 降级为 bar。模型侧启发式位于 `present_table` 工具描述中（[R4](../../../wayfinder/interpretation-client-rendering/tickets/R4-chart-type-expansion.md)）。
