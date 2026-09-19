---
description: "为侧边栏和看板查询语义层覆盖率、缺口、可达性、评测结果和归一化资产可信度信号。"
kind: "package-reference"
---

# @deepseek-ai/dsh-evidence-query

[English](README.md) | 中文

## 概述

使用此包可通过同一后端为侧边栏和看板查询语义层覆盖率、缺口、可达性、评测记录、差异和资产健康度。Confirmation reporting 将 `draft` 和 `unreviewed` 归为 draft，将已确认词汇归为 confirmed，将 `rejected` 归为 rejected，并将未识别值归为 unknown。在存在持久的定义修改时间 owner 前，资产健康度返回 `lastModified: null`；它不会用文件系统 metadata 或 confirmation time 代替。

## 目录

- [可信度报告](#trust-reporting)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="trust-reporting"></a>
## 可信度报告

Coverage 与 asset-health 查询使用同一个 confirmation normalization。`confirmed`、`analyst_confirmed` 和 `business_confirmed` 报告为 `confirmed`；`draft` 和 `unreviewed` 报告为 `draft`；`rejected` 保持为 `rejected`；其他值报告为 `unknown`。Coverage 包含明确的 `unknown` 计数，因此新词汇不会静默增加 draft 计数。

`AssetHealthReport.lastModified` 可为空。Evidence-query 返回 `null`，因为 semantic definition model 尚未拥有持久的修改时间。[G9: semantic definition `lastModified` ownership](../../../wayfinder/semantic-layer/tickets/G9-definition-last-modified-ownership.md) 负责后续决策；file mtime 和 `confirmation.confirmed_at` 不能替代该字段。

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-evidence-query` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

-----

<a id="model-experience"></a>
## 模型体验

间接方式，通过 `@deepseek-ai/dsh-nl2sql-engine` 的 LLM 适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 只读投影，从不回写语义层。
- 缺口分析提出关系，但不持久化。
- 可达性以 BFS 为界，除默认值外无路径长度上限。
- 在 G9 指定持久 owner 前，定义修改时间保持 unavailable。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
