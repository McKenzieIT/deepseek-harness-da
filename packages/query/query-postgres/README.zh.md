# @deepseek-ai/dsh-query-postgres

[English](README.md) | 中文

Postgres 查询引擎提供方（ctx.query）：GA-GT2-D4 第二引擎桩（stub），验证引擎无关的抽象——getConventions 加载 Postgres 方言；execute/attach/cancel/getProgress 抛出未实现（seam 验证，而非真实的 PG 执行器）

## 模型体验

通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器间接实现。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

- 仅为桩——`getConventions` 加载 Postgres 方言，但 `execute`/`attach`/`cancel`/`getProgress` 抛出未实现。
- 这是引擎无关抽象的 seam 验证，而非真实的 Postgres 执行器。
