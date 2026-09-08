# @deepseek-ai/dsh-tool-get-definition

[English](README.md) | 中文

面向模型的 get_definition 工具：按名称从语义层加载统一的数据资产定义（表、事件或指标）

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用的请求前缀的贡献是仅追加的，不会使既有缓存条目失效。

## 已知限制与延后工作

- 单资产查找：不存在批量变体。
- 名称必须通过精确匹配解析；不支持模糊匹配。
- 名称上限为 200 个字符。
