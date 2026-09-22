---
description: "TODO: translate: Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)"
kind: "package-reference"
---

# @deepseek-ai/dsh-query-postgres

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


Postgres 查询引擎提供方（ctx.query）：GA-GT2-D4 第二引擎桩（stub），验证引擎无关的抽象——getConventions 加载 Postgres 方言；execute/attach/cancel/getProgress 抛出未实现（seam 验证，而非真实的 PG 执行器）

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-query-postgres` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器间接实现。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 仅为桩——`getConventions` 加载 Postgres 方言，但 `execute`/`attach`/`cancel`/`getProgress` 抛出未实现。
- 这是引擎无关抽象的 seam 验证，而非真实的 Postgres 执行器。
