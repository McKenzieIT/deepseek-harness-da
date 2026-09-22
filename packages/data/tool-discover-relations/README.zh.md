---
description: "TODO: translate: Model-facing discover_relations tool: AI-native DWS→DIM relation discovery over the semantic layer (G3 enrichment), for the data agent's enrichment phase"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-discover-relations

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing discover_relations tool: AI-native DWS→DIM relation discovery over the semantic layer (G3 enrichment), for the data agent's enrichment phase

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


面向模型的 discover_relations 工具：基于语义层（G3 enrichment）的 AI 原生 DWS→DIM 关系发现，用于 data agent 的 enrichment 阶段

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-discover-relations` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包的贡献仅向可复用的请求前缀追加，不会使已有的缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 纯建议：所提议的关系不会被持久化。
- 关系方向仅为 DWS→DIM。
- 不推断基数。
