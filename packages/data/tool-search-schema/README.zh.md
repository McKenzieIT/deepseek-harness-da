# @deepseek-ai/dsh-tool-search-schema

[English](README.md) | 中文

面向模型的 search_schema 工具：在语义层上进行 BM25 检索，供管理 agent（智能体）通过自然语言查询发现资产。

## 模型体验

通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器间接使用。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

- 仅 BM25 词法检索，无语义 embedding 重排。
- `topK` 默认为 20。
- 语料受 scope 约束，不支持跨 scope 检索。
