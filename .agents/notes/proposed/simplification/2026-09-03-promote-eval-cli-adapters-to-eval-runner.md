# Agent Note: Promote the eval-cli ctx adapters to dsh-eval-runner and delete the fork

Status: proposed

## Problem

`packages/eval/eval-cli/src/context.ts` copy-forks five ctx→engine adapters from `@deepseek-ai/dsh-eval-runner` (the file header admits "forked from eval-runner-service"): `CtxLlmAdapter`, `CtxOdpsAdapter`, `CtxQueryExecutor`, `LlmJudgeExecutor`, `Nl2sqlAgentResponder`. The fork has **already diverged**: `eval-cli`'s `CtxOdpsAdapter` carried the bare `as unknown as EngineQueryOutcome` cast (every completed query misread as failed) that the original `eval-runner-service` had already fixed via `toEngineOutcome()` — a drift-induced bug that survived because the two copies are not shared. Production consumers: `eval-cli` is the live eval CLI (`eval.ts` / `runBatch` path) used to produce the pass_rate that feeds `experiment-audit-log.md`; `eval-runner-service` is the in-process service variant.

## Proposal

Promote the five adapters (plus the `toEngineOutcome` state-mapping helper) into a shared module under `@deepseek-ai/dsh-eval-runner` (e.g. `src/adapters.ts`); `eval-cli/context.ts` imports them and keeps only its CLI-specific wiring (responder config, harness boot). Delete the forked copies.

## What we give up

`eval-cli` and `eval-runner-service` would share one adapter implementation, so a change to either's adapter shape must be intentional (no silent local divergence). That divergence was a bug source, not a feature; the one place it arguably helped (fast CLI iteration without touching the service package) is a workflow cost worth paying for correctness.

## Alternatives considered

**Keep the fork so eval-cli can iterate without touching the service package.** A local fork lets the CLI change its adapters fast. It lost because the fork already diverged (`CtxOdpsAdapter` carried the bare `as unknown as EngineQueryOutcome` cast — every completed query misread as failed — that the original had fixed via `toEngineOutcome`), and the drift-induced bug survived precisely because the two copies are not shared — the fast-iteration benefit buys correctness divergence.

**Copy `toEngineOutcome` back into the fork without promoting.** Fix the drift locally by porting the state-mapping helper into eval-cli. It lost because it leaves the five adapters forked (the same drift can recur on any of them), and the proposal promotes all five plus `toEngineOutcome` to the shared `dsh-eval-runner` home so both the CLI and the service use one reconciled implementation.

## Acceptance criteria

- `eval-cli/context.ts` contains no `CtxLlmAdapter`/`CtxOdpsAdapter`/`CtxQueryExecutor`/`LlmJudgeExecutor`/`Nl2sqlAgentResponder` definition; it imports them from `dsh-eval-runner`.
- One `toEngineOutcome` lives in `dsh-eval-runner`; both the CLI and the service use it.
- `pnpm run lint && pnpm run typecheck && pnpm run test` green; a `--with-query` eval run against a `completed` MaxCompute outcome records `done`, not `failed`.

## Risks

Public API: `dsh-eval-runner` gains exported adapters (a new public surface) — acceptable, it is already the eval-runtime home. Behavior: none (the fork is reconciled to the fixed original). Dependency: `eval-cli` already depends on `dsh-eval-runner`; the move adds no edge.
