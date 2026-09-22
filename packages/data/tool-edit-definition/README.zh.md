---
description: "TODO: translate: Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-edit-definition

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


面向模型的 edit_definition 工具：对语义层资产定义应用部分补丁，并记录审计轨迹

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-edit-definition` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效应

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 仅支持部分补丁，没有全量替换模式。
- 审计轨迹为仅追加；撤销受 `revert_edit` 约束，且没有分支历史。
- 资产名称上限为 200 个字符。
