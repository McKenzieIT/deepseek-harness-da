# @deepseek-ai/dsh-goal-eval-context

Context plugin for the DeepSeek Harness data agent: injects evaluation evidence into the goal round context so the model can self-adjust direction before a no-progress block fires.

## Overview

A function plugin (`apply(ctx, config)`) that registers:

- `ctx.systemPrompt.section({ name: 'eval-evidence', order: 50, ... })` — appends an `<eval_evidence>` XML block to the system prompt when a goal is active and evaluation runs exist.
- `ctx.on('goal/changed', ...)` — tracks whether a goal is currently `active` so the section suppresses itself when no goal is in flight.

Both registrations are fiber-scoped and auto-disposed by Cordis (the listener and the section tear down with the mounting context). The plugin owns no persistent registry slot — it reads `ctx.evidenceQuery` and `ctx.systemPrompt` and writes only the prompt section.

The section text is produced by a pure render function (`renderEvalEvidence`) from structured params (`buildEvalEvidenceParams`); no LLM call is made to render the block.

### Configuration

```yaml
# cordis.yml
goal-eval-context:
  hintEscalationThreshold: 2 # default; the hint escalates one step before the goal policy blocks at N=3
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

Eval-run LLM calls execute on a separate call path and do not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- **WARN-13 — global vs per-goal no-improvement counter (intentional divergence)** — `computeConsecutiveNoImprovement` walks the GLOBAL historical run sequence (every run pair in the eval store), whereas `@deepseek-ai/dsh-goal-eval-policy` tracks only its own per-goal, per-trigger counter. The two counts can differ by design: the context surface shows the model the full historical view so it can self-adjust, while the policy enforces a per-goal counter that gates round advancement. Keeping the counters separate prevents the context from accidentally shadowing policy state. This divergence is documented in-code and is intentional — do not unify without revisiting the policy boundary.
- **Section always evaluates on assemble** — the `text()` callback reads `ctx.evidenceQuery.getEvalStore()` and recomputes params on every system-prompt assembly. The render path is pure and cheap (no LLM, no I/O beyond the in-memory store), but it is not memoized across assemblies within a turn.
- **No explicit eval-trigger token attribution** — this plugin does not trigger evaluations itself; it only renders existing results. The token cost of running evaluations is owned by `@deepseek-ai/dsh-eval-runner-service`, not this package.
