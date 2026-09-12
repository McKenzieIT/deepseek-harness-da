# @deepseek-ai/dsh-eval-runner-service

English | [中文](README.zh.md)

Cordis Service wiring the `ctx.evalRunner` seam: drives the real NL2SQL engine + `ctx.query` + `ctx.llm` collaborators against the eval case set, persists JSONL in the format `FileBackedEvalResultStore` reads, and tracks last / last-two runs for delta. Activates the autonomous goal loop's no-progress backstop (`dsh-goal-eval-policy`) and `trigger_eval` full_run (`dsh-tool-trigger-eval`).

## Overview

A function plugin (`apply(ctx, config)`) that mounts the `EvalRunnerService` (a Cordis `Service`) onto `ctx.evalRunner`. The Service:

- discovers K11 case YAMLs under the configured `caseDir`,
- builds collaborators from the live ctx seams (`ctx.llm`, `ctx.query`, `ctx.nl2sql`, `ctx.schema`),
- runs `runBatch` (pass_k attempts per case) through the real `Nl2sqlEngine`,
- persists one versioned JSONL file per batch with run configuration, attempt evidence, and case provenance for evidence-query and offline rescoring,
- emits `evidence/eval-run-completed`, and
- tracks `lastRun` / `lastTwoRuns` for delta (`computeDelta`) and `trigger_eval` report_last.

## Key design decisions

- **Adapters over reimplementation** — `CtxLlmAdapter` / `CtxOdpsAdapter` / `CtxQueryExecutor` bridge the engine's `Llm` / `OdpsExecutor` and the eval-runner's `QueryExecutor` / `JudgeExecutor` contracts to `ctx.llm` / `ctx.query`, so the eval reuses the same logic modules as production.
- **Versioned W3→W4 format bridge** — each version-2 record retains the resolved run configuration, every attempt's execution outcome/detail/artifact, and the loaded case's source path, schema version, expected values, metadata, and resolved reference SQL. `FileBackedEvalResultStore` continues to read legacy unversioned records.
- **Outcome vocabulary mapping** — `CtxOdpsAdapter.toEngineOutcome` maps the dsh-query `QueryOutcome` states (`completed` / `pending` / `failed`) to the engine's (`done` / `running` / `failed`) so completed queries no longer fall to the failed/decline path.


## Configuration

When `ctx.query` is mounted, `executorIdentity` and `queryWaitSeconds` are required. `executorIdentity` is the stable deployment-provided name of the concrete query provider or sidecar; `queryWaitSeconds` records the execution wait policy that affects whether a slow query completes or becomes environment-blocked. Missing or invalid values fail before the batch starts, so a real-execution artifact cannot claim an unnamed executor.

## Verification

```sh
tsc -b packages/eval/eval-runner-service/tsconfig.json   # typecheck
pnpm vitest run packages/eval/eval-runner-service          # mechanics + runBatch integration
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

Eval-run LLM calls execute on a separate call path and do not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- **Abort signal not threaded** — `EvalRunnerService.runBatch` accepts `{ runId?, skipHealthGate? }` with no `signal` field, and `CtxLlmAdapter.complete` builds `ctx.llm.stream` options without `options.signal`. A tool-timeout or user/tool abort fires `AbortController.abort()`, but the signal is dropped at the `runBatch` seam (the gap spans `dsh-tool-trigger-eval`'s `trigger_eval` and this Service). An in-flight eval run therefore runs to completion and cannot be cancelled mid-batch. Threading `signal?: AbortSignal` through the seam is deferred (cross-package fix).
- **No concurrency guard on `runBatch`** — overlapping callers (e.g. `trigger_eval` and `patrol-mode.triggerEval`, which do not coordinate) race the `lastRun` / `lastTwoRuns` bookkeeping and may persist competing JSONL files for the same batch. Only `dsh-goal-eval-policy` guards against overlap (per-goal `evalInFlight`). A service-level in-flight guard is deferred.
- **Partial configuration validation** — `Config` remains a plain interface rather than a schemastery schema. The service validates `executorIdentity` and `queryWaitSeconds` itself and requires them for real execution; the remaining deployment choices still resolve in the constructor instead of through one schema-owned resolution step.
- **`ctx.get('schema')` is untyped** — `Nl2sqlAgentResponder` reads `ctx.get('schema')` via an inline cast; the providing package is neither a declared peer nor imported as a type augmentation, so the access is loosely typed.
- **`ctx.get('evalRunner')` seam is duck-typed** — the Service structurally satisfies the `EvalRunnerService` seam declared by `dsh-tool-trigger-eval` via `ctx.get('evalRunner')`; there is no shared interface type across the two packages.
