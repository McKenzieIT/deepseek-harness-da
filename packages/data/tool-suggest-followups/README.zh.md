# `@deepseek-ai/dsh-tool-suggest-followups`

[English](README.md) | 中文

面向模型的 `suggest_followups`：为取数 agent（智能体）的 `INTERPRETATION` 阶段**建议用户接下来可能提出的问题**。agent 在展示结果后调用它，提供可执行的后续步骤：下钻、对比、时间位移，以及用户可点击以继续对话的相关查询。

这是一个**纯展示工具**（仅 `inject=['tools']`）：它记录建议并返回给 UI 以显示为可点击的 chip。它没有服务依赖，也不探测 `ctx.schema` / `ctx.audit` / `ctx.identity`。阶段门禁的 `captureToolData` 通过 `tools/post-execute` 检测该调用。

## 配置

无可调参数。纯展示。

## 验证

```sh
tsc -b packages/data/tool-suggest-followups/tsconfig.json
pnpm vitest run packages/data/tool-suggest-followups
pnpm verify-cordis-config
```

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包的贡献以仅追加方式写入可复用的请求前缀，不会使已有的缓存条目失效。

## 已知限制与延期工作

- 仅记录意图；点击查询交互由 UI 层负责。
- 建议值是自由文本查询，不针对任何 schema 校验。
- 5 条建议的上限是 UX 约束（chip 溢出）；模型须排定优先级。
