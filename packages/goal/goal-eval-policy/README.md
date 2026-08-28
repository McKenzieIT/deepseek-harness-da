# @deepseek-ai/dsh-goal-eval-policy

No-progress backstop for the autonomous goal loop. A function plugin
(`apply(ctx, config)`) that counts admitted goal rounds, triggers an eval run
every `goalEvalIntervalRounds` rounds (default 3), and force-blocks a goal
with code `'no-progress'` after `noProgressThreshold` consecutive eval runs
show zero improvement (0 cases flipped to correct).

## Overview

The plugin mounts two Cordis event listeners (both auto-disposed by the
mounting fiber):

- `ctx.on('goal/changed')` — resets per-goal state on `create`/`resume` and
  cleans it up on `clear`/`complete`.
- `ctx.on('session/event')` — counts round increments from `user/message`
  events whose source is `goal`, accumulates `roundsSinceLastEval`, and
  triggers `runEvalCheck` every K rounds.

Optional services are resolved lazily via `ctx.get`:

- `ctx.get('evalRunner')` — the eval-runner service (`@deepseek-ai/dsh-eval-runner`).
  When absent, the policy falls back to the latest persisted run in the
  evidence store.
- `ctx.get('agents')` — the agents service, used to resolve the live agent
  handle before calling `ctx.goals.block`.

Both reads handle `undefined` and degrade safely (no block, no eval).

## Configuration

Tunables are validated schemastery `Config` fields, changeable from
`cordis.yml`:

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

### No-progress block reason

#### What the model sees

When `consecutiveNoImprovement` reaches `noProgressThreshold`, the policy
calls `ctx.goals.block(agent, ref, { code: 'no-progress', message }) with a
human-readable message stating how many consecutive eval runs showed no
improvement. The blocked goal surfaces to the model/agent as a goal whose
`phase` is no longer `active`; downstream goal-round-driver logic observes the
block and stops admitting rounds for that goal.

##### Block message

```markdown
Goal blocked: N consecutive eval runs showed no improvement (0 cases flipped to correct).
```

#### Token effect

The block reason is a short, fixed-length string emitted once per blocked
goal; it does not scale with conversation history.

#### KV Cache effect

None directly; the block is a goal-state mutation, not a prompt append.

### Eval-run fan-out (indirect)

#### What the model sees

When `evalRunner` is present, `runEvalCheck` calls `evalRunner.runBatch()`,
which fans out to judge/answer/SQL-generation LLM calls inside
`@deepseek-ai/dsh-eval-runner`. These runs are **not** part of the agent
loop's conversation; they execute against the eval case set and persist
results to a JSONL file in the evidence store. The agent does not observe
the eval tokens in its own context.

#### Token effect

Eval runs consume `ctx.llm` tokens (judge + answer + SQL generation) outside
the agent's visible conversation; the spend is bounded by the eval case set
size and `passK`.

#### KV Cache effect

Eval-run LLM calls are independent of the agent's KV cache prefix; they do
not extend or invalidate the agent's reusable prefix.

## Known Limitations and Deferred Work

- **`roundsSinceLastEval` reset timing** — the counter is reset to `0` at the
  top of `runEvalCheck` before `evalRunner.runBatch()` runs; a chronically
  failing `runBatch` (catch path) therefore does not accumulate toward the
  no-progress threshold and can defer the backstop indefinitely. Intentional
  deferral-on-failure; flagged for a future success-path-only reset.
- **Per-goal counter divergence vs `goal-eval-context`** — this plugin tracks
  `consecutiveNoImprovement` per goal (Map keyed by goal id), whereas
  `@deepseek-ai/dsh-goal-eval-context` tracks a global counter. The divergence
  is intentional (per-goal backstop vs global signal) and documented in-code;
  a non-obvious maintainer constraint.
- **No abort-signal threading** — `runEvalCheck` calls
  `evalRunner.runBatch()` without forwarding an `AbortSignal`; an in-flight
  eval run cannot be cancelled from this plugin. The signal seam lives in
  `@deepseek-ai/dsh-tool-trigger-eval` / `@deepseek-ai/dsh-eval-runner-service`;
  threading it through here is deferred pending that upstream change.
- **Untyped `evalRunner` seam** — the local `EvalRunnerSeam` narrows the
  runBatch shape rather than importing the providing package's type
  augmentation, so `ctx.get('evalRunner')` is a structural cast, not a typed
  read.
- **Edit application unimplemented in `patrol-mode`** — out of scope for this
  package, but the autonomous improvement loop it participates in relies on
  `patrol-mode.executeEdit`, which is currently a no-op stub; see
  `@deepseek-ai/dsh-patrol-mode` Known Limitations.
