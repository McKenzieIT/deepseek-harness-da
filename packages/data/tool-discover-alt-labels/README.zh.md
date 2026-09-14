---
description: "TODO: translate: Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-discover-alt-labels

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)


面向模型的 discover_alt_labels 工具：在语义层之上进行 AI 原生的 SKOS 别名发现（CL-1 Phase 3 富集），用于 management agent 的富集阶段。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包向可复用请求前缀写入的内容为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 纯建议：发现的标签不写回语义层。
- 名称上限 200 字符。
- 仅在富集阶段可调用。
