---
description: "TODO: translate: Model-facing update_table_config tool: write a per-table ODPS project override to the semantic-layer substrate for the data agent's self-evolution loop (admin-only; Tier-2 audited)"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-update-table-config

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing update_table_config tool: write a per-table ODPS project override to the semantic-layer substrate for the data agent's self-evolution loop (admin-only; Tier-2 audited)

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)


面向模型的 update_table_config 工具：向语义层 substrate 写入按表的 ODPS 项目覆盖，用于 data agent 的自我进化循环（仅管理员；Tier-2 审计）

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-update-table-config` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使先前的缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 仅管理员（Tier-2 审计）。
- 仅支持按表的 ODPS 项目覆盖，无字段级配置。
- 写入与 substrate 耦合。
