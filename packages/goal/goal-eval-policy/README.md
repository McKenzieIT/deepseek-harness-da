# @deepseek-ai/dsh-goal-eval-policy

English | [中文](README.zh.md)

No-progress backstop for the autonomous goal loop. A function plugin (`apply(ctx, config)`) that counts admitted goal rounds, triggers an eval run every `goalEvalIntervalRounds` rounds (default 3), and force-blocks a goal with code `'no-progress'` after `noProgressThreshold` consecutive eval runs show zero improvement (0 cases flipped to correct).

## Overview

The plugin mounts two Cordis event listeners (both auto-disposed by the mounting fiber):

- `ctx.on('goal/changed')` — resets per-goal state on `create`/`resume` and cleans it up on `clear`/`complete`.
- `ctx.on('session/event')` — counts round increments from `user/message` events whose source is `goal`, accumulates `roundsSinceLastEval`, and triggers `runEvalCheck` every K rounds.

Optional services are resolved lazily via `ctx.get`:

- `ctx.get('evalRunner')` — the eval-runner service (`@deepseek-ai/dsh-eval-runner`). When absent, the policy falls back to the latest persisted run in the evidence store.
- `ctx.get('agents')` — the agents service, used to resolve the live agent handle before calling `ctx.goals.block`.

Both reads handle `undefined` and degrade safely (no block, no eval).

## Configuration

Tunables are validated schemastery `Config` fields, changeable from `cordis.yml`:

| Field | Default | Effect |
| --- | --- | --- |
| `goalEvalIntervalRounds` | `3` | Run an eval batch every K admitted rounds. |
| `noProgressThreshold` | `3` | Block the goal after N consecutive no-improvement evals. |

## Verification

```sh
tsc -b packages/goal/goal-eval-policy/tsconfig.json   # typecheck
pnpm vitest run packages/goal/goal-eval-policy          # unit + integration
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

Eval-run LLM calls execute on a separate call path and do not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- **`roundsSinceLastEval` reset timing** — the counter is reset to `0` at the top of `runEvalCheck` before `evalRunner.runBatch()` runs; a chronically failing `runBatch` (catch path) therefore does not accumulate toward the no-progress threshold and can defer the backstop indefinitely. Intentional deferral-on-failure; flagged for a future success-path-only reset.
- **Per-goal counter divergence vs `goal-eval-context`** — this plugin tracks `consecutiveNoImprovement` per goal (Map keyed by goal id), whereas `@deepseek-ai/dsh-goal-eval-context` tracks a global counter. The divergence is intentional (per-goal backstop vs global signal) and documented in-code; a non-obvious maintainer constraint.
- **No abort-signal threading** — `runEvalCheck` calls `evalRunner.runBatch()` without forwarding an `AbortSignal`; an in-flight eval run cannot be cancelled from this plugin. The signal seam lives in `@deepseek-ai/dsh-tool-trigger-eval` / `@deepseek-ai/dsh-eval-runner-service`; threading it through here is deferred pending that upstream change.
- **Untyped `evalRunner` seam** — the local `EvalRunnerSeam` narrows the runBatch shape rather than importing the providing package's type augmentation, so `ctx.get('evalRunner')` is a structural cast, not a typed read.
- **Edit application unimplemented in `patrol-mode`** — out of scope for this package, but the autonomous improvement loop it participates in relies on `patrol-mode.executeEdit`, which is currently a no-op stub; see `@deepseek-ai/dsh-patrol-mode` Known Limitations.
