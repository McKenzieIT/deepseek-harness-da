---
description: "TODO: translate: Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-get-coverage

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)


面向模型的 get_coverage 工具：语义层覆盖率统计（各类型资产总数、领域分布、确认状态）

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-get-coverage` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 影响

本包以仅追加方式向可复用请求前缀添加内容，不会使既有 cache 条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- 只读计数；不会修改语义层。
- 覆盖率反映磁盘上的语义层：进行中的编辑在持久化前不计入。
- 领域分布仅按领域标签划分。
