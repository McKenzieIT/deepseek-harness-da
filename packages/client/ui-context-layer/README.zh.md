---
description: "TODO: translate: Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-context-layer

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


上下文层关系图：基于 G6 v5 的交互式关系图，支持语义缩放与领域过滤

本地化：插件注册英语和简体中文的类型化 `contextLayer` 命名空间；slot 渲染的组件接收 `t`，导出的展示组件也要求传入同一翻译函数。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

无。该浏览器侧上下文层界面不注册任何面向模型的内容。

#### KV Cache 影响

该包不注册任何面向模型的内容，因此不会扩展或使任何 KV Cache 前缀失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- G6 v5 是硬依赖，没有它关系图无法渲染。
- 关系图在领域过滤变更时重新渲染（无增量 diff），因此大图在快速过滤变更时可能抖动。
- 语义缩放级别为手工调校的阈值，并非根据数据自动计算。
