---
description: "TODO: translate: Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-get-definition

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


面向模型的 get_definition 工具：按名称从语义层加载统一的数据资产定义（表、事件或指标）

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-get-definition` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用的请求前缀的贡献是仅追加的，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 单资产查找：不存在批量变体。
- 名称必须通过精确匹配解析；不支持模糊匹配。
- 名称上限为 200 个字符。
