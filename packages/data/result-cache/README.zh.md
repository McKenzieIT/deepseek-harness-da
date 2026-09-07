# @deepseek-ai/dsh-result-cache

[English](README.md) | 中文

DeepSeek Harness 的抽象 result-cache seam（ctx.resultCache），按 result_id 存取查询/计算结果

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包贡献的内容仅追加到可复用请求前缀，不会使既有缓存条目失效。

## 已知限制与待办工作

- 抽象 seam：此处未附带默认内存实现；TTL 与淘汰由各提供方负责。
- `result_id` 冲突行为由提供方定义。
- 不存在跨进程失效。
