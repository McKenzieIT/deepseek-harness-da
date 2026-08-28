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

### The `<eval_evidence>` system-prompt section

#### What the model sees

When a goal is active and the eval store has at least one run, the `eval-evidence` section (order 50) appends an `<eval_evidence>` block to the system prompt. With a single run it shows the baseline pass rate; with two or more runs it shows the latest pass rate, the most-recent delta (`+improved / -regressed / unchanged` vs the previous run), the consecutive no-improvement count, and a rule-based `Direction` hint. The hint escalates to "consider changing approach" once `consecutiveNoImprovement` reaches `hintEscalationThreshold`. When no goal is active or no runs exist, the section is suppressed (emits nothing). The model uses this evidence to self-adjust direction or decide to block.

```xml
<eval_evidence>
Pass rate: 18/22 (82%)
Last delta: +3 improved, -1 regressed, 0 unchanged (vs run r-0042)
Consecutive evaluations without improvement: 2
Direction: No improvement detected for 2 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.
</eval_evidence>
```

#### Token effect

The `<eval_evidence>` block is a bounded, fixed-length system-prompt section. Its token cost is constant per assembly and does not grow with conversation history; it changes only when the underlying eval store state (latest run, delta, or consecutive-no-improvement count) changes.

#### KV Cache effect

The section is part of the reusable system-prompt cache prefix while goal state and eval data are stable; it rewrites (invalidating the cache from this section onward) when a goal becomes active/inactive or when a new evaluation run changes the latest run, delta, or consecutive-no-improvement count.

### Direction hint

#### What the model sees

The `Direction` line is a pure rule-based hint (`computeDirectionHint`) — no LLM is consulted to produce it. It escalates from "continue current approach" (improvement detected) to "consider changing approach" once the consecutive-no-improvement count reaches `hintEscalationThreshold`, giving the model one step of warning before the goal policy blocks the goal at its (separately configured) threshold.

#### Token effect

The hint is text within the same bounded `<eval_evidence>` block; it adds no additional token cost beyond the section itself.

#### KV Cache effect

Same as the `<eval_evidence>` section above — the hint changes only when eval state changes.

## Known Limitations and Deferred Work

- **WARN-13 — global vs per-goal no-improvement counter (intentional divergence)** — `computeConsecutiveNoImprovement` walks the GLOBAL historical run sequence (every run pair in the eval store), whereas `@deepseek-ai/dsh-goal-eval-policy` tracks only its own per-goal, per-trigger counter. The two counts can differ by design: the context surface shows the model the full historical view so it can self-adjust, while the policy enforces a per-goal counter that gates round advancement. Keeping the counters separate prevents the context from accidentally shadowing policy state. This divergence is documented in-code and is intentional — do not unify without revisiting the policy boundary.
- **Section always evaluates on assemble** — the `text()` callback reads `ctx.evidenceQuery.getEvalStore()` and recomputes params on every system-prompt assembly. The render path is pure and cheap (no LLM, no I/O beyond the in-memory store), but it is not memoized across assemblies within a turn.
- **No explicit eval-trigger token attribution** — this plugin does not trigger evaluations itself; it only renders existing results. The token cost of running evaluations is owned by `@deepseek-ai/dsh-eval-runner-service`, not this package.
