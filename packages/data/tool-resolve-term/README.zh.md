---
description: "TODO: translate: Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-resolve-term

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)


面向模型的 resolve_term 工具：通过关系图的反向索引，从 SKOS pref_label/alt_labels 进行精确别名解析。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器接入。

#### KV Cache 效果

本包以仅追加方式向可复用的请求前缀写入，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 仅支持精确别名解析，不支持模糊匹配或拼写容错。
- 解析依赖关系图可用。
- 受 scope 约束，不跨 scope 解析。
