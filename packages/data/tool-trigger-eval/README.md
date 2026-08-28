# @deepseek-ai/dsh-tool-trigger-eval

Model-facing `trigger_eval` tool for the DeepSeek Harness data agent. Triggers a semantic layer eval run against the data agent's case set, persists results, and reports a before/after delta. A function plugin (`apply(ctx, config)`) that registers a single tool via `ctx.tools.register`.

## Overview

`trigger_eval` is a model-callable tool. On invocation it:

- When `ctx.evalRunner` is mounted — runs a full batch (health-gate -> run -> persist -> delta) via the `EvalRunnerService` seam and returns the run summary plus a delta against the previous run.
- When only a results directory has past runs — reports the last run id (degraded mode, no new run).
- When neither is available — returns a `not_configured` status describing what the host must wire.

The tool result is rendered to the model as text (`formatTriggerEval`) and its meta is projected (`projectMeta`) for persistence/presentation.

## Verification

```sh
tsc -b packages/data/tool-trigger-eval/tsconfig.json   # typecheck
pnpm vitest run packages/data/tool-trigger-eval         # unit specs
```

## Model Experience

### `trigger_eval` tool result

#### What the model sees

Calling `trigger_eval` returns a tool result whose text (`formatTriggerEval`) reports, for a `full_run`: the run id, the pass rate (`correct/total` plus a percentage), wrong/declined/infra-failure counts, and a delta block listing improved/regressed/unchanged case counts plus up to 10 per-case flip lines (`old_verdict -> new_verdict`). In `report_last` mode it reports the last run id and its pass rate; in `not_configured` mode it reports a configuration-status message. The model therefore experiences the tool as a quality probe it can invoke after making changes to assess impact.

#### Token effect

A `full_run` drives the `EvalRunnerService` to execute the case set, which consumes `ctx.llm` tokens out-of-band (judge, answer, and SQL-generation calls performed by the eval runner service). These tokens are charged against the eval-time LLM call path, not against the agent loop's per-turn budget for the triggering model. The tool's own result text is a bounded, fixed-shape block appended to the conversation history.

#### KV Cache effect

The eval run's LLM calls happen on a separate call path from the agent loop's conversation and do not extend or invalidate the agent's conversation KV-cache prefix. The tool's returned text is appended as a tool-result message, extending the context append-only without invalidating the cache prefix.

## Known Limitations and Deferred Work

- **Cancellation seam depends on the downstream runner** — `trigger_eval` forwards `exec.signal` into `EvalRunnerService.runBatch({ ..., signal })` and re-checks `exec.signal.aborted` at entry. Full mid-run cancellation additionally requires the eval runner service to thread that signal into its `ctx.llm.stream` / judge / answer paths; that downstream wiring is owned by `@deepseek-ai/dsh-eval-runner-service` and is flagged there.
- **`report_last` / `not_configured` fallbacks** — when `ctx.evalRunner` is not mounted the tool degrades to reporting the last persisted run id (via `ctx.evidenceQuery`) or a `not_configured` status message rather than erroring; this is intentional progressive behavior, not a failure.
- **Untyped `evalRunner` seam** — `ctx.get('evalRunner')` is cast to the local `EvalRunnerService` interface. The providing package (`@deepseek-ai/dsh-eval-runner-service`) is not declared as a peer, so the cast is structural rather than augmented at the manifest level; tightening the seam (peer + type augmentation) is deferred.
- **No `Config` tunables** — `Config` is an empty schemastery schema; the tool exposes no `cordis.yml`-changeable fields. `runId` is generated per call and `skip_health_gate` is a per-call parameter, neither appropriate for manifest-level config.
