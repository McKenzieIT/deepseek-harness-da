# @deepseek-ai/dsh-query

[English](README.md) | 中文

抽象查询引擎接缝（`ctx.query`）：用于可替换引擎提供方上执行 NL-to-SQL 的 Service Definition（MaxCompute 优先）。

## 概述

定义抽象 `QueryEngine extends Service` 契约，包含四个抽象方法：`execute`、`attach`、`cancel`、`getProgress`，以及三态 `QueryOutcome` 词汇（Completed / Pending / Failed）。`estimate_cost` 为 CostGuard 内部使用，不出现在接缝公开面上。本包是 query-trio 的 Def 半部分（Def + Provider + Consumer）；Provider 为 `query-maxcompute`，Consumer `tool-query` 延后。

## Model Experience

间接，通过延后的 tool-query Consumer：它将 `ctx.query.execute` 结果作为模型可见的 tool 面暴露，本抽象接缝自身不注册任何 prompt、tool 或 session 事件。

#### KV Cache effect

无直接影响；本接缝不拥有任何前缀，查询结果仅作为消费方 tool 的结果内容进入对话。

## Known Limitations and Deferred Work

- **tool-query Consumer 未实现** — 将 `ctx.query.execute` 以会话门（G1 采样 / G5 COUNT / 预算 / 近似去重 / 终止 / 缓存 / required_predicates）暴露给模型的工具延后。与 engine-wrapper guard chain 合并，构成 query-trio 剩余生产工作。
- **Engine-wrapper guard chain** — CostGuard（`estimate_cost`）/ TimeoutGuard（`signal`）/ RetryGuard / OrphanReaper 为 A1-split 关注点，应落在具体 `ctx.query.execute` 包装器中；Def 当前为极简抽象，未实现。
- **Guard 放置决策待定** — 会话门与 guard chain 是落在 Def 的具体 `execute` 中还是作为独立 guard 插件，需进一步 grilling。
- **NL-to-SQL 不在范围** — C1 决策：tool-query 接受严格 SQL；自然语言到 SQL 翻译属于语义层（P6/P13）。
- **health_check** — 提供方健康检查延后（P4 B 决策）。
