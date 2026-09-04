# Agent Note: Fold compare.ts's drifted RunResult/CaseVerdict types into eval-runner's

Status: proposed

## Problem

`packages/eval/eval-cli/src/compare.ts` (the baseline-diff tool AGENTS.md cites for eval-run-recording) redefines `RunResult` + `CaseVerdict` types + a `loadRun()` reader locally instead of importing them from `@deepseek-ai/dsh-eval-runner`. It imports only `node:fs`/`node:path` + `js-yaml` (`compare.ts:13-15`) — NOT `dsh-eval-runner`. The local `RunResult` (`compare.ts:26`) summary is a drifted subset: `{ total, correct, wrong, pass_rate }` — missing `declined`, `unjudged`, `infra_failure` that eval-runner's `RunSummary` (`types.ts:88-96`) carries. `loadRun` (`compare.ts:57`) is a bare `JSON.parse`+cast with no shape validation, whereas eval-runner's `readRunResult` (`persistence.ts:50`) validates `run_id`/`timestamp`/`cases` and throws on malformed input. The drift means a malformed or schema-shifted run file is silently miscast — a `declined`/`unjudged` case is dropped from the diff silently.

## Proposal

Fold — `import { RunResult, CaseVerdict } type from '@deepseek-ai/dsh-eval-runner'` and replace `loadRun` with `readRunResult` (or re-export it). `compare.ts` already depends on `dsh-eval-runner` (`main.ts` imports from it; `compare.ts` can too). Keeps the local `RunResult` honest as eval-runner's summary evolves.

## What we give up

A local `RunResult` that `compare.ts` owns independently; folding commits it to eval-runner's shape. That independence already let the summary drift (missing `declined`/`unjudged`), so the lost flexibility is the flexibility to silently drop case categories from the diff.

## Alternatives considered

**Keep the local `RunResult`/`CaseVerdict` so `compare.ts` owns its own shape.** A local type lets the diff tool evolve independently of eval-runner. It lost because the local summary already drifted (missing `declined`/`unjudged` that eval-runner's `RunSummary` carries), and the bare `JSON.parse`+cast `loadRun` silently miscasts malformed or schema-shifted run files — the independence is what let case categories drop silently from the diff.

**Validate locally rather than reusing `readRunResult`.** Add shape validation to `loadRun` without importing eval-runner's reader. It lost because it duplicates validation logic that `readRunResult` already owns and tests, and `compare.ts` already depends on `dsh-eval-runner` via `main.ts`, so reusing the validated reader is one-way honest at no new dependency cost.

## Acceptance criteria

- `compare.ts` imports `RunResult`/`CaseVerdict` + `readRunResult` from `dsh-eval-runner` (grep confirms); no local `interface RunResult`/`interface CaseVerdict` or `loadRun` definition.
- `pnpm run lint && pnpm run typecheck && pnpm run test` green.
- A malformed run file now throws (`readRunResult`'s validation) instead of silently miscasting.
- A `declined`/`unjudged` case is no longer dropped from the diff.

## Risks

`compare.ts` is a baseline-diff tool — the shape-validation now fails loud on a malformed file, which may surface previously-silent bad run files (acceptable; better than silent miscast). If eval-runner's `RunSummary` gains fields `compare.ts` doesn't render, `compare.ts` stays correct (it just ignores them) — the fold is one-way honest.
