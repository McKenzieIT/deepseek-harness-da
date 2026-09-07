# @deepseek-ai/dsh-eval-runner-service

Cordis Service wiring the `ctx.evalRunner` seam: drives the real NL2SQL engine + `ctx.query` + `ctx.llm` collaborators against the eval case set, persists JSONL in the format `FileBackedEvalResultStore` reads, and tracks last / last-two runs for delta. Activates the autonomous goal loop's no-progress backstop (`dsh-goal-eval-policy`) and `trigger_eval` full_run (`dsh-tool-trigger-eval`).

## Overview

A function plugin (`apply(ctx, config)`) that mounts the `EvalRunnerService` (a Cordis `Service`) onto `ctx.evalRunner`. The Service:

- discovers K11 case YAMLs under the configured `caseDir`,
- builds collaborators from the live ctx seams (`ctx.llm`, `ctx.query`, `ctx.nl2sql`, `ctx.schema`),
- runs `runBatch` (pass_k attempts per case) through the real `Nl2sqlEngine`,
- persists one JSONL file per batch in the evidence-query record format,
- emits `evidence/eval-run-completed`, and
- tracks `lastRun` / `lastTwoRuns` for delta (`computeDelta`) and `trigger_eval` report_last.

## Key design decisions

- **Adapters over reimplementation** — `CtxLlmAdapter` / `CtxOdpsAdapter` / `CtxQueryExecutor` bridge the engine's `Llm` / `OdpsExecutor` and the eval-runner's `QueryExecutor` / `JudgeExecutor` contracts to `ctx.llm` / `ctx.query`, so the eval reuses the same logic modules as production.
- **W3→W4 format bridge** — `persistRunResultJsonl` maps the eval-runner `RunResult` to the `PersistedCaseRecord` shape `FileBackedEvalResultStore` parses (the two differ in field naming/casing).
- **Outcome vocabulary mapping** — `CtxOdpsAdapter.toEngineOutcome` maps the dsh-query `QueryOutcome` states (`completed` / `pending` / `failed`) to the engine's (`done` / `running` / `failed`) so completed queries no longer fall to the failed/decline path.

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
- **Hardcoded tunables** — `Config` is a plain `interface` with no schemastery schema; deployment-varying choices default via inline `??` in the constructor (`provider ?? 'aga'`, `model ?? 'qwen3.7-max'`, `today ?? '20260825'`, `caseDir ?? 'packages/eval/eval/cases/k11-v2'`, `resultsDir ?? '.tmp/eval-results'`, `passK ?? 3`). They cannot be changed from `cordis.yml` and misconfiguration cannot fail loud at load. A validated schemastery `Config` schema is deferred.
- **`ctx.get('schema')` is untyped** — `Nl2sqlAgentResponder` reads `ctx.get('schema')` via an inline cast; the providing package is neither a declared peer nor imported as a type augmentation, so the access is loosely typed.
- **`ctx.get('evalRunner')` seam is duck-typed** — the Service structurally satisfies the `EvalRunnerService` seam declared by `dsh-tool-trigger-eval` via `ctx.get('evalRunner')`; there is no shared interface type across the two packages.
