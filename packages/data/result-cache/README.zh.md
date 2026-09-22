---
description: "TODO: translate: Abstract result-cache seam (ctx.resultCache) for the DeepSeek Harness — store and retrieve query/compute results by result_id"
kind: "package-reference"
---

# @deepseek-ai/dsh-result-cache

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Abstract result-cache seam (ctx.resultCache) for the DeepSeek Harness — store and retrieve query/compute results by result_id

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)


DeepSeek Harness 的抽象 result-cache seam（ctx.resultCache），按 result_id 存取查询/计算结果

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-result-cache` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包贡献的内容仅追加到可复用请求前缀，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- 抽象 seam：此处未附带默认内存实现；TTL 与淘汰由各提供方负责。
- `result_id` 冲突行为由提供方定义。
- 不存在跨进程失效。
