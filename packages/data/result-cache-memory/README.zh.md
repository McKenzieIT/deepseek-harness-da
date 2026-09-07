# @deepseek-ai/dsh-result-cache-memory

[English](README.md) | 中文

`@deepseek-ai/dsh-result-cache` 中 `ctx.resultCache` 存储 seam 的内存式、会话级实现。将条目存入以 `result_id` 为键的 `Map`，并挂载 `tools/post-execute` 以自动捕获 `query_data` 的已完成结果，使模型可在后续 `present_table` / `compute` 调用中按 id 引用某次查询的行。

## 概述

Cordis 函数插件（`name` / `inject` / `apply`），实例化 `MemoryResultCache` 并注册 `tools/post-execute` waterfall（瀑布式事件）监听器。该监听器检查已完成的 `query_data` 结果，由 SQL 字符串派生确定性 `qr_<hash>` id，缓存 `{ columns, rows, metadata }` 条目，并将 `result_id` 注入返回值。

结果 id 前缀：

- `qr_`：查询引擎结果，从 `query_data` 自动捕获。由 SQL 派生；多次执行间行可能变化（时间窗口 / 实时查询），因此条目被最新结果覆盖（未变化时幂等）。post-execute 监听器绝不抛错：它运行在 `execute` 的外层 try/catch 内，一旦抛错会把一次成功查询变为 `isError`，并在返回的 `result_id` 下返回陈旧行。
- `cr_`：compute 派生结果，由 `@deepseek-ai/dsh-tool-compute` 通过显式 `put` 存储。写入后不可变：`put` 遇到冲突条目时抛错，强制执行确定性 compute 约定。

## 验证

```sh
tsc -b packages/data/result-cache-memory/tsconfig.json   # typecheck
pnpm vitest run packages/data/result-cache-memory         # unit specs
```

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 影响

本包的贡献对可复用请求前缀为仅追加，且不会使既有缓存条目失效。

## 已知限制与延期工作

- **会话级、无持久性**：条目存于插件上下文上的 `Map` 中，随其一同被 GC；跨进程重启或会话无持久化。持久后端（例如建立在 `storage-domain` 之上）延期实现。
- **此处无行/字节上限**：本存储仅强制 `cr_` 不可变性；不限制缓存条目的行数或总大小。`tool-compute` 对其 `put` 的 compute 结果强制自身上限；存储级上限延期至未来的加固阶段。
- **`qr_` 覆盖为后写覆盖**：若同一 SQL 跨执行返回不同行（实时查询），最新结果会在同一 `result_id` 下遮蔽较早结果；从较早轮次缓存了 `result_id` 的模型可能呈现此后已变化的行。版本化 id 延期实现。
- **导出形态**：本包以函数插件形态（`name` / `inject` / `apply`）作为唯一导出形态；移除了 `export default`，因为 cordis Loader 的 `unwrapExports` 在存在 `default` 时会丢弃函数插件命名空间（以及 `tools/post-execute` 自动捕获钩子）。
