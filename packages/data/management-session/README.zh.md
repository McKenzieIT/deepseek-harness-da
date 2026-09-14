---
description: "TODO: translate: Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference"
kind: "package-reference"
---

# @deepseek-ai/dsh-management-session

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)


全屏图谱管理 UI 专用的管理 agent（智能体）会话：在 semantic-layer-management preset 下创建限定作用域的会话，并持有只读的父上下文引用。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包的贡献对可复用的请求前缀是仅追加的，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 父上下文引用为只读（不回写）。
- 管理 preset 是独立作用域，编辑在重新加载前不会自动反映到父会话中。
