---
description: "TODO: translate: Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-revert-edit

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


面向模型的 revert_edit 工具：将语义层资产回滚到先前的定义快照

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效应

本包的贡献仅追加到可复用的请求前缀，不会使既有的缓存项失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 只能回滚到先前的快照，无分支历史。
- 快照可用性依赖审计轨迹。
- 回滚操作本身会被审计。
