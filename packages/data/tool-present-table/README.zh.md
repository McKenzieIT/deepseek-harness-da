# `@deepseek-ai/dsh-tool-present-table`

[English](README.md) | 中文

面向模型的 `present_table`：为 data agent 的 `INTERPRETATION` 阶段**呈现带展示元数据的查询结果表**（标题、列、排序、KPI 聚合、图表配置）。agent（智能体）调用它来指示 UI 如何渲染已执行的查询结果，包括展示哪些列、如何排序、在表上方显示哪些汇总 KPI 卡片，以及是否包含图表可视化。

这是一个**纯展示工具**（仅 `inject=['tools']`）：它记录表的展示意图并返回给 UI 渲染。它没有服务依赖，也不会探测 `ctx.schema` / `ctx.audit` / `ctx.identity`。阶段门禁的 `captureToolData` 通过 `tools/post-execute` 检测该调用。

## 配置

无需配置。纯展示。

## 验证

```sh
tsc -b packages/data/tool-present-table/tsconfig.json
pnpm vitest run packages/data/tool-present-table
pnpm verify-cordis-config
```

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包的 contributions 仅追加到可复用的请求前缀，不会使既有缓存条目失效。

## 已知限制与延后工作

- 仅记录意图。UI 层负责实际渲染；本工具仅声明意图。
- `result_id` 不针对任何结果存储做校验（UI 在展示时解析它）。
- 图表配置仅供参考；UI 可能对不支持的图表类型回退到仅表格展示。
