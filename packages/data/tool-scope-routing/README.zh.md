---
description: "TODO: translate: Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-scope-routing

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)


面向 data agent 的 scope 路由工具：list_scopes、switch_scope，以及系统提示词中基于 alias 的提示，用于自动检测 scope。

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-scope-routing` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包的贡献以仅追加方式附加到可复用的请求前缀，不会使已有的缓存项失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 基于 alias 的 scope 提示仅供参考：模型仍可能误路由。
- `list_scopes`/`switch_scope` 会修改会话 scope 状态。
- 此处不提供 scope CRUD。
