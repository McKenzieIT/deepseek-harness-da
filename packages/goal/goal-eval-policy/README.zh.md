# @deepseek-ai/dsh-goal-eval-policy

[English](README.md) | 中文

为自主 goal loop 提供无进展兜底。它是一个函数插件（`apply(ctx, config)`），统计已准入的 goal round，每 `goalEvalIntervalRounds` 个 round（默认 3）触发一次 eval 运行，并在 `noProgressThreshold` 次连续 eval 运行显示零改进（0 个用例翻转为正确）后，以 `'no-progress'` 代码强制 block 该 goal。

## 概述

该插件挂载两个 Cordis 事件监听器（均由挂载 fiber 自动 dispose（资源释放））：

- `ctx.on('goal/changed')` — 在 `create`/`resume` 时重置 per-goal 状态，并在 `clear`/`complete` 时清理该状态。
- `ctx.on('session/event')` — 统计来自 source 为 `goal` 的 `user/message` 事件的 round 自增，累加 `roundsSinceLastEval`，并每 K 个 round 触发一次 `runEvalCheck`。

可选服务通过 `ctx.get` 延迟解析：

- `ctx.get('evalRunner')` — eval-runner 服务（`@deepseek-ai/dsh-eval-runner`）。当缺失时，策略回退到 evidence store 中最近一次持久化的运行。
- `ctx.get('agents')` — agents（智能体）服务，用于在调用 `ctx.goals.block` 前解析实时 agent 句柄。

两次读取都能处理 `undefined` 并安全降级（不 block、不 eval）。

## 配置

可调项是经 schemastery 校验的 `Config` 字段，可在 `cordis.yml` 中修改：

| 字段 | 默认值 | 效果 |
| --- | --- | --- |
| `goalEvalIntervalRounds` | `3` | 每 K 个已准入的 round 运行一批 eval。 |
| `noProgressThreshold` | `3` | 在 N 次连续无改进的 eval 后 block 该 goal。 |

## 验证

```sh
tsc -b packages/goal/goal-eval-policy/tsconfig.json   # typecheck
pnpm vitest run packages/goal/goal-eval-policy          # unit + integration
```

## 模型体验

间接经由 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

eval 运行中的 LLM 调用在独立的调用路径上执行，不会扩展或使 agent loop（智能体循环）的可复用请求前缀失效。

## 已知限制与延期工作

- **`roundsSinceLastEval` 重置时机** — 计数器在 `runEvalCheck` 顶部、`evalRunner.runBatch()` 运行之前被重置为 `0`；因此长期失败的 `runBatch`（catch 路径）不会向无进展阈值累加，可能无限期推迟兜底。这是有意在失败时推迟；已标记为未来改为仅成功路径重置。
- **per-goal 计数器与 `goal-eval-context` 的分歧** — 本插件按 goal 跟踪 `consecutiveNoImprovement`（以 goal id 为键的 Map），而 `@deepseek-ai/dsh-goal-eval-context` 跟踪一个全局计数器。该分歧是有意的（per-goal 兜底 vs 全局信号）并在代码中记录；这是一条非显然的维护者约束。
- **未串联 abort signal** — `runEvalCheck` 调用 `evalRunner.runBatch()` 时不转发 `AbortSignal`；进行中的 eval 运行无法从本插件取消。该 signal seam 位于 `@deepseek-ai/dsh-tool-trigger-eval` / `@deepseek-ai/dsh-eval-runner-service`；在此处串联它被推迟，等待上游变更。
- **未类型化的 `evalRunner` seam** — 本地 `EvalRunnerSeam` 收窄了 runBatch 的形状，而非导入提供方包的类型增强，因此 `ctx.get('evalRunner')` 是一次结构化 cast，而非类型化读取。
- **`patrol-mode` 中 edit 应用未实现** — 超出本包范围，但其参与的自主改进 loop 依赖 `patrol-mode.executeEdit`，后者当前是 no-op stub；见 `@deepseek-ai/dsh-patrol-mode` 已知限制。
