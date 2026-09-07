# @deepseek-ai/dsh-tool-list-domains

[English](README.md) | 中文

面向模型的 list_domains 工具：枚举语义层域，并按种类给出资产数量

## 模型体验

间接，经由 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存项失效。

## 已知限制与延后工作

- 仅枚举：本工具无域 CRUD。
- 计数按种类，而非按关系。
- `alt_labels` 会返回但不解析。
