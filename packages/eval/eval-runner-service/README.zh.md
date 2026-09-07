# @deepseek-ai/dsh-eval-runner-service

[English](README.md) | 中文

连接 `ctx.evalRunner` seam 的 Cordis Service：驱动真实 NL2SQL 引擎、`ctx.query`、`ctx.llm` 协作者对 eval 用例集运行，以 `FileBackedEvalResultStore` 读取的格式持久化 JSONL，并跟踪 last / last-two 运行以做差量。激活自主 goal loop 的无进展兜底（`dsh-goal-eval-policy`）与 `trigger_eval` 的 full_run（`dsh-tool-trigger-eval`）。

## 概述

一个函数插件（`apply(ctx, config)`），把 `EvalRunnerService`（一个 Cordis `Service`）挂载到 `ctx.evalRunner`。该 Service：

- 发现位于配置 `caseDir` 下的 K11 用例 YAML，
- 从实时 ctx seam（`ctx.llm`、`ctx.query`、`ctx.nl2sql`、`ctx.schema`）构建协作者，
- 通过真实 `Nl2sqlEngine` 运行 `runBatch`（每用例 pass_k 次尝试），
- 以 evidence-query 记录格式每批持久化一个 JSONL 文件，
- 发出 `evidence/eval-run-completed`，并
- 跟踪 `lastRun` / `lastTwoRuns` 以做差量（`computeDelta`）与 `trigger_eval` 的 report_last。

## 关键设计决策

- **适配器优于重新实现**：`CtxLlmAdapter` / `CtxOdpsAdapter` / `CtxQueryExecutor` 把引擎的 `Llm` / `OdpsExecutor` 与 eval-runner 的 `QueryExecutor` / `JudgeExecutor` 约定桥接到 `ctx.llm` / `ctx.query`，使 eval 复用与生产相同的逻辑模块。
- **W3→W4 格式桥接**：`persistRunResultJsonl` 把 eval-runner `RunResult` 映射为 `FileBackedEvalResultStore` 解析的 `PersistedCaseRecord` 形状（二者字段命名 / 大小写不同）。
- **结果词表映射**：`CtxOdpsAdapter.toEngineOutcome` 把 dsh-query 的 `QueryOutcome` 状态（`completed` / `pending` / `failed`）映射为引擎的（`done` / `running` / `failed`），使已完成的查询不再落入 failed / decline 路径。

## 验证

```sh
tsc -b packages/eval/eval-runner-service/tsconfig.json   # typecheck
pnpm vitest run packages/eval/eval-runner-service          # mechanics + runBatch integration
```

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效应

eval-run LLM 调用走独立调用路径，不会延伸或失效 agent loop（智能体循环）的可复用请求前缀。

## 已知限制与待办

- **中止 signal 未贯穿**：`EvalRunnerService.runBatch` 接受 `{ runId?, skipHealthGate? }`，没有 `signal` 字段，且 `CtxLlmAdapter.complete` 构造 `ctx.llm.stream` 选项时未传入 `options.signal`。工具超时或用户 / 工具中止会触发 `AbortController.abort()`，但该 signal 在 `runBatch` seam 处被丢弃（该缺口横跨 `dsh-tool-trigger-eval` 的 `trigger_eval` 与本 Service）。因此一次进行中的 eval run 会运行到结束，无法在批执行中途取消。通过该 seam 贯穿 `signal?: AbortSignal` 属于待办（跨包修复）。
- **`runBatch` 无并发保护**：重叠的调用方（如 `trigger_eval` 与 `patrol-mode.triggerEval`，二者不协调）竞态 `lastRun` / `lastTwoRuns` 记账，可能为同一批持久化相互竞争的 JSONL 文件。仅 `dsh-goal-eval-policy` 对重叠有保护（每 goal `evalInFlight`）。Service 级 in-flight 保护属于待办。
- **硬编码可调参数**：`Config` 是一个普通 `interface`，无 schemastery schema；部署可变选择通过构造函数中的内联 `??` 取默认值（`provider ?? 'aga'`、`model ?? 'qwen3.7-max'`、`today ?? '20260825'`、`caseDir ?? 'packages/eval/eval/cases/k11-v2'`、`resultsDir ?? '.tmp/eval-results'`、`passK ?? 3`）。它们无法从 `cordis.yml` 修改，错误配置也无法在加载时快速失败。经校验的 schemastery `Config` schema 属于待办。
- **`ctx.get('schema')` 无类型**：`Nl2sqlAgentResponder` 通过内联 cast 读取 `ctx.get('schema')`；提供该能力的包既非声明的对等依赖（peer dependency），也未被作为类型增强引入，因此该访问类型松散。
- **`ctx.get('evalRunner')` seam 为鸭子类型**：该 Service 结构上满足 `dsh-tool-trigger-eval` 声明的 `EvalRunnerService` seam（经 `ctx.get('evalRunner')`）；两个包之间没有共享接口类型。
