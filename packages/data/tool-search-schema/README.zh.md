---
description: "TODO: translate: Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-search-schema

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


面向模型的 search_schema 工具：在语义层上进行 BM25 检索，供管理 agent（智能体）通过自然语言查询发现资产。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器间接使用。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 仅 BM25 词法检索，无语义 embedding 重排。
- `topK` 默认为 20。
- 语料受 scope 约束，不支持跨 scope 检索。
