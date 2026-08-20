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

## Known Limitations and Deferred Work

- **F1 forced_load granularity** — `ctx.tools.execute` programmatic dispatch for retrieval tools fires at UNDERSTANDING completion when candidates are empty; finer auto-wire heuristics are deferred.
- **B10 — `onRequest` type** — `LlmCallConfig` vs `GenerateOptions` type nuance; tsc is green (types are compatible) but `adapterDefaults` interaction is deferred.
- **B11 — `step_count` enforcement** — step count increments but `max_steps` hard enforcement is not wired (dead-ish); deferred.
- **B13 — `onLlmStream` auxiliary skip** — skipping `options.purpose` auxiliary streams (compaction/session-title) requires `llm` types verification of the `purpose` field; deferred.
- **Persona package extraction** — phase-gate manages persona entirely (base + dynamic phase instructions); extracting to a separate `dsh-data-persona` package is a D2 留口 (deferred).
- **`honest_decline` user-facing delivery message** — model phase instructions cover common cases; a dedicated inject-decline message is deferred.
- **Type-aware oxlint findings** — 7 non-blocking type-aware findings from full oxlint (off at commit time, tsc clean); deferred polish.
