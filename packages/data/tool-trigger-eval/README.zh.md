# @deepseek-ai/dsh-tool-trigger-eval

[English](README.md) | 中文

面向 DeepSeek Harness data agent 的、面向模型的 `trigger_eval` 工具。针对 data agent 的 case set 触发一次 eval run，持久化结果，并报告 before/after delta。一个函数插件（`apply(ctx, config)`），通过 `ctx.tools.register` 注册单个工具。

## 概述

`trigger_eval` 是一个可由模型调用的工具。调用时：

- 当 `ctx.evalRunner` 已挂载时，通过 `EvalRunnerService` seam 运行一次完整 batch（health-gate → run → persist → delta），并返回 run summary 加上相对上一次 run 的 delta。
- 当仅有 results 目录存在历史 run 时，报告最后一次 run id（降级模式，不产生新 run）。
- 当两者都不可用时，返回 `not_configured` 状态，描述 host 必须接入的内容。

工具结果以文本形式渲染给模型（`formatTriggerEval`），其 meta 被投影（`projectMeta`）以便持久化/展示。

## 验证

```sh
tsc -b packages/data/tool-trigger-eval/tsconfig.json   # typecheck
pnpm vitest run packages/data/tool-trigger-eval         # unit specs
```

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 影响

本包的贡献对可复用的请求前缀是仅追加的，不会使既有 cache 条目失效。

## 已知限制与推迟工作

- **取消 seam 依赖下游 runner**：`trigger_eval` 将 `exec.signal` 传入 `EvalRunnerService.runBatch({ ..., signal })`，并在入口处重新检查 `exec.signal.aborted`。完整的运行中取消还要求 eval runner service 将该 signal 穿透到其 `ctx.llm.stream` / judge / answer 路径；该下游接线由 `@deepseek-ai/dsh-eval-runner-service` 负责，并已在那里 flag。
- **`report_last` / `not_configured` fallback**：当 `ctx.evalRunner` 未挂载时，工具降级为报告最后一次持久化的 run id（通过 `ctx.evidenceQuery`）或一个 `not_configured` 状态消息，而不是报错；这是有意的渐进式行为，不是失败。
- **未类型化的 `evalRunner` seam**：`ctx.get('evalRunner')` 被强转为本地 `EvalRunnerService` 接口。提供该能力的包（`@deepseek-ai/dsh-eval-runner-service`）未声明为对等依赖（peer dependency），因此该强转是结构性的，而非在 manifest（元数据清单）层 augmented；收紧该 seam（peer + type augmentation）被推迟。
- **无 `Config` 可调项**：`Config` 是一个空的 schemastery schema；该工具不暴露任何可通过 `cordis.yml` 修改的字段。`runId` 每次调用生成，`skip_health_gate` 是每次调用的参数，两者都不适合 manifest 层配置。
