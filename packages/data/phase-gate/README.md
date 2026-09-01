# @deepseek-ai/dsh-phase-gate

English | [中文](README.zh.md)

Four-phase phase-gate orchestration plugin for the DeepSeek Harness data agent. Implements the RBI `DataAgentPipeline` (UNDERSTANDING -> GENERATION -> EXECUTION -> INTERPRETATION) re-expressed on harness Cordis event seams (additive-only, no core changes).

## Overview

A function plugin (`apply(ctx, config)`) that registers 7 hooks on the agent event system:

- `ctx.tools.guard` — hard tool whitelist per phase
- `agent/turn-stopping` — phase transitions, critic gate (GENERATION), stall watchdog, budget enforcement
- `tools/post-execute` — captures tool results for state (candidate_tables, event_params, partition_cols)
- `agent/request` — per-phase reasoning effort
- `system-prompt/assemble` — persona injection + dynamic phase instructions
- `llm/stream` — LLM call counting (F5)
- `agent/pre-step` — step counting + max_steps enforcement (F6)

## Key design decisions

- **Critic delegates to `@deepseek-ai/dsh-nl2sql-engine`** — `sqlSyntaxGate` + `extractSqlCandidate` from the nl2sql-engine package (P13b Q2 boundary: critic lives in nl2sql-engine, phase-gate delegates, one-directional no cycle).
- **Control via side-effects** — `agent/turn-stopping` is `serial` returning `void`; control is achieved by mutating per-agent state + `agent.inject(message)` for within-turn retry / phase advance.
- **F2 SQL same-source** — GENERATION `extractSqlCandidate` captures to `last_sql`; EXECUTION `query_data` post-execute verifies `sql === last_sql`.
- **F4 question-start** — `agent/status` idle->running resets question-scoped counters (not `turn/start`, which would break per-kick budgets across multi-turn kicks).

## Verification

```sh
tsc -b packages/data/phase-gate/tsconfig.json   # typecheck
pnpm vitest run packages/data/phase-gate         # 14 specs
pnpm verify-cordis-config                        # preset mount resolves
```

## Model Experience

### System prompt assembly

#### What the model sees

The `system-prompt/assemble` waterfall hook delegates downstream, then additively appends a base persona shadow section plus a dynamic `phase-instruction` section keyed to `current_phase` (and a `sql-conventions` section during GENERATION). Terminal phases (`DECLINED`/`COMPLETE`) clamp to UNDERSTANDING so the instruction set is never empty. The base persona is fixed across the run; the phase instruction swaps on every advance or fallback.

##### Base persona

```markdown
You are a data agent for a per-game analytics platform. You answer natural-language data questions over a semantic layer (events/tables/terminology) by running a four-phase pipeline: UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION. Follow the per-phase instructions injected at runtime. If you cannot answer, emit a honest decline (the 【incomplete】 marker in INTERPRETATION); never fabricate tables, fields, or results.
```

#### Token effect

The persona, phase-instruction, and SQL-conventions sections add a bounded, fixed-length block of system-prompt tokens per request; they do not grow with conversation history.

#### KV Cache effect

The base persona is constant across the run and extends the reusable cache prefix; the `phase-instruction` section rewrites on a phase transition, invalidating the cache from that section onward.

### Per-phase tool whitelist

#### What the model sees

The `ctx.tools.guard` hook hard-rejects any tool call whose `name` is not in the current phase's `PHASE_TOOLS` whitelist before execution, returning a reason such as `phase-gate: "query_data" not in understanding whitelist [...]`. The model therefore experiences the active phase as the set of tools whose calls succeed; out-of-phase calls return only the rejection feedback, not a tool result.

#### Token effect

A rejected call charges only the rejection-feedback tokens (the gated tool never executes); an allowed call charges the normal tool-result tokens.

#### KV Cache effect

The rejected-call feedback returns as a tool-result message that extends the context append-only without invalidating the prefix.

### Per-phase reasoning effort

#### What the model sees

The `agent/request` waterfall hook delegates downstream, then overrides `reasoningEffort` to `high` for UNDERSTANDING and GENERATION and `medium` for EXECUTION and INTERPRETATION per the `REASONING_EFFORT` map. The model does not see this as text; it experiences it as the per-call thinking budget for the current phase.

#### Token effect

The effort dial changes the reasoning-token budget per call; it does not alter the visible prompt or result token counts.

#### KV Cache effect

None directly; reasoning effort does not change the request prefix, so the cache prefix is unaffected by the effort dial itself.

### Phase transition and retry injections

#### What the model sees

The `agent/turn-stopping` serial hook drives control by side effect: on a gate pass it `agent.inject`s a `[phase advance → GENERATION]` user message; on a within-budget gate failure it injects a `[phase ... retry]` correction; on a fallback it injects a `[fallback → ...]` steer. The model sees these as ordinary user-role turns that keep the kick alive and direct the next step.

#### Token effect

Each injected message adds a short, fixed user-role turn to the conversation history; the count scales with phase advances, retries, and fallbacks within the per-kick budgets (`max_fallbacks`, `max_state_turns`).

#### KV Cache effect

The injected user messages are append-only; any cache invalidation on a phase advance comes from the coincident `phase-instruction` rewrite, not from the appended message.

## Known Limitations and Deferred Work

- **F1 forced_load granularity** — `ctx.tools.execute` programmatic dispatch for retrieval tools fires at UNDERSTANDING completion when candidates are empty; finer auto-wire heuristics are deferred.
- **B10 — `onRequest` type** — `LlmCallConfig` vs `GenerateOptions` type nuance; tsc is green (types are compatible) but `adapterDefaults` interaction is deferred.
- **B11 — `step_count` enforcement** — step count increments but `max_steps` hard enforcement is not wired (dead-ish); deferred.
- **B13 — `onLlmStream` auxiliary skip** — skipping `options.purpose` auxiliary streams (compaction/session-title) requires `llm` types verification of the `purpose` field; deferred.
- **Persona package extraction** — phase-gate manages persona entirely (base + dynamic phase instructions); extracting to a separate `dsh-data-persona` package is a D2 留口 (deferred).
- **`honest_decline` user-facing delivery message** — model phase instructions cover common cases; a dedicated inject-decline message is deferred.
- **Type-aware oxlint findings** — 7 non-blocking type-aware findings from full oxlint (off at commit time, tsc clean); deferred polish.
