# @deepseek-ai/dsh-client-ui-present-decomposition

[English](README.md) | 中文

`present_decomposition` INTERPRETATION 工具的 Toolview 卡片。该卡片是**查询的约定，而非结果卡片**：它展示 agent（智能体）理解了什么、理解到何种水准、有多大置信度——三层结构加一条信任带（wayfinder: interpretation-client-rendering R9 审计 + P1 原型结论）。

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包既不扩展也不使 agent loop 的可复用请求前缀失效。

## 已知限制与延期工作

- 最新轮次折叠为默认；过去轮次的卡片会折叠，除非用户切换。
- `block.call === null`（窗口截断）或格式错误的 `argsRaw` 会回退到纯文本 `block.content`，而非在渲染时抛出异常。
- 置信度由模型自报；信任带仅在低于 0.7 时告警，它不独立校验该分数。
