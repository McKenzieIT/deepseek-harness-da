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

**派生 metric。** `metric` kind 节点是虚拟的——不是已注册 kind。它们来自派生 metric 贡献者（`projectMetricGraphNodes`），从宿主表/事件的 `metrics:` 块提取。`includeMetrics: false`（默认）丢弃它们，使图只展示策展资产；`true` 会添加它们及一条指向源表/事件的 `derived_from` 边。

**Null 退出。** 一个 kind 的 `toGraphNode(def)` 返回 `null` 即声明该定义不是图节点——不产生节点，也不产生从它出发的边。这样，一个 kind 可以为语料/检索索引注册而不进入可视化图。

**输入与生命周期。** `SemanticGraphQuery` 输入是纯可序列化对象（`domain?`、`focus?`、`depth?`、`includeMetrics?`）——没有 fiber 或 context 句柄跨进程传递。关系图缓存在 kind 增删时失效（registry 的 `onChange` 监听），因此已销毁 kind 的节点/边不会残留，重新注册的 kind 无需重启即可流过。节点投影（`projectGraphNodes`）不缓存——它迭代活跃 registry，新注册 kind 的节点在下次调用即出现。


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
