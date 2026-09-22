---
description: "query-engine 能力包组：用于 SQL 执行的抽象 ctx.query 接缝、MaxCompute 与 Postgres 提供方，以及数据代理面向模型的 query-tool 消费方。"
kind: "package-group"
---

# query/ — 查询引擎接缝家族

[English](README.md) | 中文

## 概述

`query/` 组拥有 data agent 的 SQL 执行能力。`query` 定义 `ctx.query`、方言约定，以及 completed、pending、failed 三类结果。`query-maxcompute` 与 `query-postgres` 提供执行引擎，`query-tool` 向模型公开执行能力。自然语言翻译仍归语义层；本组只接收明确 SQL，并负责执行、取消、attach、进度与方言 grounding。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`query/`](query/README.zh.md) | 抽象 `QueryEngine` 接缝（Def）：4 个接缝操作 + `getConventions()` + `QueryOutcome` | `ctx.query` |
| [`query-maxcompute/`](query-maxcompute/README.zh.md) | 经 stdio MCP sidecar 的 MaxCompute Provider，含每次调用凭证推送 | 注册到 `ctx.query` |
| [`query-postgres/`](query-postgres/README.zh.md) | Postgres 查询引擎 Provider | 注册到 `ctx.query` |
| [`query-tool/`](query-tool/README.zh.md) | 基于 `ctx.query.execute` 的面向模型查询工具消费方面 | 消费 `ctx.query` |

-----

<a id="related-documentation"></a>
## 相关文档

- [数据代理子系统 — `ctx.query`](../../docs/subsystems/data-agent.zh.md#ctxquery--queryengine-abstract-seam)——查询引擎接缝生成的 Cordis-surface 约定及其在 data-agent overlay 中的位置。

<a id="dev-note"></a>
## 开发备注

无。
