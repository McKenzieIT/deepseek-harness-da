---
description: "TODO: translate: Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption"
kind: "package-reference"
---

# @deepseek-ai/dsh-schema-gateway

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption

## 目录

- [开发备注](#dev-note)
- [语义图投影](#semantic-graph-projection)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


对 ctx.schema（SemanticLayerService）的只读远程投影，供客户端 UI 消费

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-schema-gateway` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。

<a id="semantic-graph-projection"></a>
## 语义图投影

`getGraphData(query?, scopeId?)` 返回 `SemanticGraphData`（`SemanticGraphNode[]` 与 `SemanticGraphEdge[]`）。节点与关系 `kind` 是开放的 `string`，不是封闭 union，因此本包构建之后注册的 Semantic-Layer kind（`concept` 或任何未来/测试 kind）无需修改网关即可到达客户端。节点来自 `ctx.schema.projectGraphNodes()`——每个已注册 kind 的 `toGraphNode` 贡献加上唯一的派生 `metric` 贡献者——因此没有手写的三组平行循环；边来自 RelationGraph。节点 id 在此远程边界被 brand 为 `SemanticGraphNodeId`。

`query` 字段：`domain`（按单一 domain/group 过滤）、`focus`（BFS 根——当其指向的节点不在投影中时返回空子图）、`depth`（从 focus 起的有界 BFS；`0` 表示仅 focus）、`includeMetrics`（默认 false；丢弃 `metric` kind 节点）。未知 kind 不会被丢弃——客户端 presentation registry 以通用可访问形式渲染。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包的贡献对可复用请求前缀是仅追加的，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 只读：本网关无写入路径。
- BM25 linker 索引在语料版本升级时重建，无实时增量更新。
- 该投影面向客户端，不是真源。
