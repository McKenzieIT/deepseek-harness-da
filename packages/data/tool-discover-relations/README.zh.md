# @deepseek-ai/dsh-tool-discover-relations

[English](README.md) | 中文

面向模型的 discover_relations 工具：基于语义层（G3 enrichment）的 AI 原生 DWS→DIM 关系发现，用于 data agent 的 enrichment 阶段

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包的贡献仅向可复用的请求前缀追加，不会使已有的缓存条目失效。

## 已知限制与延后工作

- 纯建议：所提议的关系不会被持久化。
- 关系方向仅为 DWS→DIM。
- 不推断基数。
