---
description: "TODO: translate: Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption."
kind: "package-reference"
---

# @deepseek-ai/dsh-evidence-query

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption.

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


统一的 evidence-query 后端层：提供覆盖率、缺口分析、可达性、评估结果与资产健康度，供侧边栏与看板消费。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接方式，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 只读投影，从不回写语义层。
- 缺口分析提出关系，但不持久化。
- 可达性以 BFS 为界，除默认值外无路径长度上限。
