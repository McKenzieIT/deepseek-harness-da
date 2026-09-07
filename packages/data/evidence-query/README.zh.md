# @deepseek-ai/dsh-evidence-query

[English](README.md) | 中文

统一的 evidence-query 后端层：提供覆盖率、缺口分析、可达性、评估结果与资产健康度，供侧边栏与看板消费。

## 模型体验

间接方式，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

- 只读投影，从不回写语义层。
- 缺口分析提出关系，但不持久化。
- 可达性以 BFS 为界，除默认值外无路径长度上限。
