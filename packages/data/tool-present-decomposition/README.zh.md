# `@deepseek-ai/dsh-tool-present-decomposition`

[English](README.md) | 中文

面向模型的 `present_decomposition`：为数据 agent（智能体）的 `INTERPRETATION` 阶段**呈现结构化的查询分解**（摘要、指标、维度、时间范围）。在继续执行之前，agent 调用它向用户展示其自然语言问题是如何被理解的，即将计算哪些指标、按哪些维度、对应什么时间范围。

这是一个**纯展示工具**（仅 `inject=['tools']`）：它记录分解结果并返回给 UI 展示。它没有服务依赖，也不会探查 `ctx.schema` / `ctx.audit` / `ctx.identity`。phase-gate 的 `captureToolData` 通过 `tools/post-execute` 检测该调用。

## 配置

无任何开关。纯展示。

## 验证

```sh
tsc -b packages/data/tool-present-decomposition/tsconfig.json
pnpm vitest run packages/data/tool-present-decomposition
pnpm verify-cordis-config
```

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效应

本包的贡献对可复用的请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知限制与待办事项

- 仅记录意图：无下游副作用或服务交互。
- 置信度分数为模型自报；尚无 ground-truth 校准。
- 指标的 `value` 是自由文本表达式，并非经过校验的 SQL。
