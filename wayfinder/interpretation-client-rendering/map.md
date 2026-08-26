# wayfinder:map — INTERPRETATION client rendering

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储——决策详情在其 ticket。

## Destination

Ship three client-side rendering plugins (`packages/client/ui-present-table/`, `packages/client/ui-present-decomposition/`, `packages/client/ui-suggest-followups/`) that replace the generic tool-call row with rich, interactive visualizations when the INTERPRETATION-phase delivery tools fire — tables with KPI cards and charts, structured decomposition cards, and clickable follow-up suggestion chips. Follows Mode 3 (Repository Package) of `dsh-plugin-development`.

## Notes

- **域**：DSH Web UI client plugins（browser-side Cordis 插件），渲染 INTERPRETATION 阶段工具结果。
- **每会话应查 skills**：`dsh-plugin-development`（Mode 3）、`grilling`、`domain-modeling`。
- **常设原则**：
  - 三个 server-side 工具已 ship（`packages/data/tool-present-{table,decomposition}/`、`tool-suggest-followups/`）——client 插件只读它们的 tool/result 事件，不改 server。
  - 遵循 `packages/client/AGENTS.md` 全部 slot/props/styling/export 纪律。
  - 遵循 `ui-tool` 的 toolview 注册模式：`ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<tool_name>' }, Component))`。
  - `argsRaw`（tool call JSON）= 结构化 intent；`content`（tool result ContentBlock[]）= 渲染文本。client 从 `argsRaw` 解析 intent 渲染 UI。
  - `present_table` 的 `result_id` 引用 `query_data` 执行结果——数据行的获取路径是 R4 研究主题。
  - `compute` 延后（blocked on 安全计算环境）——本 map 不含。

## Decisions so far

- [R1: LLM agent UI rendering patterns](tickets/R1-llm-ui-rendering-patterns.md) — 数据 agent 全部 inline；follow-up chips 点击=立即提交；宽表格 horizontal scroll；旧 chips 变灰/隐藏
- [R2: Frontend table + chart libraries](tickets/R2-frontend-table-chart-libraries.md) — v1 表格用原生 `<table>`（虚拟滚动时升级 TanStack）；Chart.js 4 tree-shaken ~43KB 仅 chart intent 时加载
- [R3: DSH client rendering patterns](tickets/R3-dsh-client-rendering-patterns.md) — toolview 注册走 `tool.call.toolview` keyed slot；argsRaw 从 block.call 解析；数据行从同 turn query_data TSV 扫描；submit 通过 inject face → conversation.send；block.call===null 时 fallback generic card
- [G1: INTERPRETATION client rendering design decisions](tickets/G1-design-decisions.md) — LLM/UI 数据路径分离；horizontal scroll；数据不可用时显示提示+retry；旧 chips 完全隐藏；折叠 card 展示 title+KPI；decomposition 默认展开 <0.7 黄色提示；retry=重拉 result store；虚拟滚动 day-1 + 10000 行 cap + CSV 导出；result data 在 object layer LRU cache 管理
- [T1: Implement ui-present-decomposition package](tickets/T1-ui-present-decomposition.md) — packages/client/ui-present-decomposition/ 完成，toolview 注册 key='present_decomposition'，三态渲染（skeleton/fallback/rich card），15 tests green
- [T2: Implement ui-present-table package](tickets/T2-ui-present-table.md) — packages/client/ui-present-table/ 完成，toolview 注册 key='present_table'，TSV 解析 + KPI 聚合 + 虚拟滚动 + Chart.js lazy load + 折叠/展开 + CSV 导出，52 tests green，100% 覆盖率
- [T3: Implement ui-suggest-followups package](tickets/T3-ui-suggest-followups.md) — packages/client/ui-suggest-followups/ 完成，toolview 注册 key='suggest_followups'，inject face 提供 submit callback，chip 点击立即提交，旧 turn chips 从 DOM 移除，22 tests green，100% 覆盖率

## Not yet specified

- `present_table` 的 chart 渲染精度扩展（v1 仅 line/bar，后续是否加 area/pie/scatter）
- Object layer result cache 的具体实现位置（runtime 内 vs 独立 service 包）及 LRU eviction 策略（TTL / maxEntries）
- Result store server-side 设计（RPC 协议、存储后端、GC 策略）——client cache 的上游依赖，当前 v1 通过同 turn TSV 扫描 bypass

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research）
- result data caching service 的设计/实现（data infra 层面，非 client 插件责任）
- 对话流整体 redesign（only INTERPRETATION tools 的 toolview 替换）
