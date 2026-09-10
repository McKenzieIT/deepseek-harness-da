# @deepseek-ai/dsh-schema-gateway

[English](README.md) | 中文

对 ctx.schema（SemanticLayerService）的只读远程投影，供客户端 UI 消费

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包的贡献对可复用请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知限制与延后工作

- 只读：本网关无写入路径。
- BM25 linker 索引在语料版本升级时重建，无实时增量更新。
- 该投影面向客户端，不是真源。
