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

（none yet）

## Not yet specified

- `present_table` 的 chart 渲染精度（line/bar 两种 minimal，后续是否加 area/pie/scatter）
- 大数据量虚拟滚动策略是否需要独立 infra 包还是包内 inline
- 多 session 恢复时 result_id 指向的缓存数据 TTL / 过期 fallback
- suggest_followups 点击后是否复用 InputHub shell（keyboard.submit）还是直接调 conversation.send

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research）
- result data caching service 的设计/实现（data infra 层面，非 client 插件责任）
- 对话流整体 redesign（only INTERPRETATION tools 的 toolview 替换）
