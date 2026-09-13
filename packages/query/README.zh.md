---
description: "query-engine 能力包组：用于 SQL 执行的抽象 ctx.query 接缝、MaxCompute 与 Postgres 提供方，以及数据代理面向模型的 query-tool 消费方。"
kind: "package-group"
---

# query/ — 查询引擎接缝家族

[English](README.md) | 中文

## 概述

`query/` 组拥有数据代理的 SQL 执行能力。核心 `query` 包定义抽象 `QueryEngine`（`ctx.query`）约定——四个接缝操作 `execute` / `attach` / `cancel` / `getProgress`、`getConventions()` 方言接地接缝以及三态 `QueryOutcome` 词汇（Completed / Pending / Failed）——是 query-trio 的 Def 半部分。`query-maxcompute` 是首个 Provider（经 stdio sidecar 的原始 MCP SDK client），`query-postgres` 是第二引擎，`query-tool` 是面向模型的消费方面。NL-to-SQL 翻译刻意不在范围内（C1：接缝接受严格 SQL；NL→SQL 属语义层）。均为 **product** 包，跨 P4 建设；每个 README 负责各自的包级约定。

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
