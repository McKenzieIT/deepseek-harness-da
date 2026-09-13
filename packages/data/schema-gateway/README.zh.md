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
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


对 ctx.schema（SemanticLayerService）的只读远程投影，供客户端 UI 消费

<a id="dev-note"></a>
## 开发备注

无。


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
