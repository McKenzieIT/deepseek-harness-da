# @deepseek-ai/dsh-tool-resolve-term

[English](README.md) | 中文

面向模型的 resolve_term 工具：通过关系图的反向索引，从 SKOS pref_label/alt_labels 进行精确别名解析。

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器接入。

#### KV Cache 效果

本包以仅追加方式向可复用的请求前缀写入，不会使既有缓存条目失效。

## 已知限制与延期工作

- 仅支持精确别名解析，不支持模糊匹配或拼写容错。
- 解析依赖关系图可用。
- 受 scope 约束，不跨 scope 解析。
