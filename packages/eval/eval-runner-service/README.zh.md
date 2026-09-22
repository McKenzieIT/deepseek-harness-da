---
description: "TODO: translate: Cordis Service wiring the EvalRunnerService seam: drives the real NL2SQL engine + ctx.query + ctx.llm collaborators against the case set, persists JSONL for evidence-query, and tracks last/last-two runs for delta. Activates the ③ autonomous goal loop (W6a no-progress backstop) + trigger_eval full_run."
kind: "package-reference"
---

# @deepseek-ai/dsh-eval-runner-service

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Cordis Service wiring the EvalRunnerService seam: drives the real NL2SQL engine + ctx.query + ctx.llm collaborators against the case set, persists JSONL for evidence-query, and tracks last/last-two runs for delta. Activates the ③ autonomous goal loop (W6a no-progress backstop) + trigger_eval full_run.

## 目录

- [Overview](#overview)
- [关键设计决策](#key-design-decisions)
- [配置](#configuration)
- [验证](#verification)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)


连接 `ctx.evalRunner` seam 的 Cordis Service：驱动真实 NL2SQL 引擎、`ctx.query`、`ctx.llm` 协作者对 eval 用例集运行，以 `FileBackedEvalResultStore` 读取的格式持久化 JSONL，并跟踪 last / last-two 运行以做差量。激活自主 goal loop 的无进展兜底（`dsh-goal-eval-policy`）与 `trigger_eval` 的 full_run（`dsh-tool-trigger-eval`）。

<a id="overview"></a>
## Overview

一个函数插件（`apply(ctx, config)`），把 `EvalRunnerService`（一个 Cordis `Service`）挂载到 `ctx.evalRunner`。该 Service：

- 发现配置 `caseDir` 下如 `k11v2_001.yaml` 的带编号 YAML/JSON 用例文件，
- 从实时 ctx seam（`ctx.llm`、`ctx.query`、`ctx.nl2sql`、`ctx.schema`）构建协作者，
- 通过真实 `Nl2sqlEngine` 运行 `runBatch`（每用例 pass_k 次尝试），
- 每批持久化一个带版本的 JSONL 文件，保存由 runner 组装的 run 配置、attempt evidence、preflight 结果与 case 来源字段，供 evidence-query 和离线重评分使用，
- 发出 `evidence/eval-run-completed`，并
- 跟踪 `lastRun` / `lastTwoRuns` 以做差量（`computeDelta`）与 `trigger_eval` 的 report_last。

<a id="key-design-decisions"></a>
## 关键设计决策

- **适配器优于重新实现**：`CtxLlmAdapter` / `CtxOdpsAdapter` / `CtxQueryExecutor` 把引擎的 `Llm` / `OdpsExecutor` 与 eval-runner 的 `QueryExecutor` / `JudgeExecutor` 约定桥接到 `ctx.llm` / `ctx.query`，使 eval 复用与生产相同的逻辑模块。
- **带版本的 W3→W4 格式桥接**：每条 version-2 记录保留 resolved run 配置、case preflight 结果、各 attempt 的 execution outcome/detail/artifact，以及已加载 case 的 source path、schema version、expected value、metadata 和 resolved reference SQL。`FileBackedEvalResultStore` 仍可读取旧的无版本记录。
- **结果词表映射**：`CtxOdpsAdapter.toEngineOutcome` 把 dsh-query 的 `QueryOutcome` 状态（`completed` / `pending` / `failed`）映射为引擎的（`done` / `running` / `failed`），使已完成的查询不再落入 failed / decline 路径。

<a id="configuration"></a>
## 配置

`Config` 是 Cordis 运行时 schema。`caseDir`、`passK`、`concurrency`、`maxInfraRetries`、`provider`、`model`、`today`、`columnSemantics` 与 `maxStoredRows` 都是显式运行策略，只有 `resultsDir` 保留已有且已记录的运行默认值。挂载 `ctx.query` 时还必须提供 `executorIdentity` 与 `queryWaitSeconds`。`CtxQueryExecutor` 会把 `queryWaitSeconds` 真正施加为 `ctx.query.execute` 的墙钟截止时间，将 abort signal 传给 provider；即使 provider 忽略取消，也会返回有类型的 timeout outcome。缺失或非法值会在 batch 开始前失败，因此持久化 artifact 描述的是实际执行策略。

<a id="verification"></a>
## 验证

```sh
tsc -b packages/eval/eval-runner-service/tsconfig.json   # typecheck
pnpm vitest run packages/eval/eval-runner-service          # mechanics + runBatch integration
```

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-eval-runner-service` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效应

eval-run LLM 调用走独立调用路径，不会延伸或失效 agent loop（智能体循环）的可复用请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- **中止 signal 未贯穿**：`EvalRunnerService.runBatch` 接受 `{ runId?, skipHealthGate? }`，没有 `signal` 字段，且 `CtxLlmAdapter.complete` 构造 `ctx.llm.stream` 选项时未传入 `options.signal`。工具超时或用户 / 工具中止会触发 `AbortController.abort()`，但该 signal 在 `runBatch` seam 处被丢弃（该缺口横跨 `dsh-tool-trigger-eval` 的 `trigger_eval` 与本 Service）。因此一次进行中的 eval run 会运行到结束，无法在批执行中途取消。通过该 seam 贯穿 `signal?: AbortSignal` 属于待办（跨包修复）。
- **`runBatch` 无并发保护**：重叠的调用方（如 `trigger_eval` 与 `patrol-mode.triggerEval`，二者不协调）竞态 `lastRun` / `lastTwoRuns` 记账，可能为同一批持久化相互竞争的 JSONL 文件。仅 `dsh-goal-eval-policy` 对重叠有保护（每 goal `evalInFlight`）。Service 级 in-flight 保护属于待办。
- **`ctx.get('schema')` 无类型**：`Nl2sqlAgentResponder` 通过内联 cast 读取 `ctx.get('schema')`；提供该能力的包既非声明的对等依赖（peer dependency），也未被作为类型增强引入，因此该访问类型松散。
- **`ctx.get('evalRunner')` seam 为鸭子类型**：该 Service 结构上满足 `dsh-tool-trigger-eval` 声明的 `EvalRunnerService` seam（经 `ctx.get('evalRunner')`）；两个包之间没有共享接口类型。
