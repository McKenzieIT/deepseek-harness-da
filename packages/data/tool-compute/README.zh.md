# @deepseek-ai/dsh-tool-compute

[English](README.md) | 中文

面向模型的 `compute` 工具，用于 data-agent 的 INTERPRETATION 阶段。通过 `ctx.codeRuntime` 对缓存的查询结果执行 LLM（大语言模型）生成的 Python/pandas 代码，经 `ctx.resultCache` 以 `cr_` 前缀存储派生结果，并返回 `result_id` 供下游 `present_table` 渲染。

## 服务

| 服务 | 职责 |
|---------|------|
| `ctx.tools` | 工具注册 |
| `ctx.codeRuntime` | Python 执行（data-python Provider） |
| `ctx.resultCache` | 加载源数据 + 存储派生结果 |

## 组合包

Preset 行：`tool-compute` → `@deepseek-ai/dsh-tool-compute`

Phase-gate：`INTERPRETATION_TOOLS` 已包含 `'compute'`。

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 影响

本包的贡献仅追加到可复用的请求前缀，不会使既有缓存条目失效。

## 已知限制与延后工作

- 沙箱是一个无 GPU 访问的 Python 子进程。
- `result_id` 在 `present_table` 解析前未经校验：陈旧或冲突的 id 在此处暴露，而非在计算时。
- 源数据仅通过 `data.load_result()` 绑定加载；此处没有临时 SQL/文件摄入路径。
