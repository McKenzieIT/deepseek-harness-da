# `@deepseek-ai/dsh-tool-evaluate-sql-quality`

Model-facing `evaluate_sql_quality`: **0-100 SQL quality score over the folded-regex critic findings + basic heuristics** for the data agent's `GENERATION` phase. The agent calls it alongside `critique_sql_tool` to score a SQL candidate. The phase-gate's `captureToolData` captures `last_quality` from the returned `score`; the GENERATION gate (P-DA2, re-tightened when `critic_tools_registered`) requires `last_quality >= 60` (`PipelineConfig.quality_score_floor`) to advance to EXECUTION.

This is the **(b) root-cause fix** — paired with `critique_sql_tool`: the model calls both on its SQL before `query_data`; after a `TABLE_NOT_FOUND`, it corrects the SQL + RE-calls `critique_sql_tool` (re-critique → `last_sql` updates → F2 passes) + RE-calls `evaluate_sql_quality` (→ `last_quality` updates).

It mirrors [`@deepseek-ai/dsh-tool-critique-sql`](../tool-critique-sql) for the registration shape and the `criticCtx` injection design (structural `CriticCtxProvider` interface + `ctx.get('criticCtx')` soft probe).

## Status: registered + callable

The tool is registered by the data-agent preset (`tool-evaluate-sql-quality` row, uncommented) and named in the phase-gate `GENERATION` whitelist. It probes `ctx.get('criticCtx')` — the same `CriticCtxService` the phase-gate registers.

Phase 1: the score is derived from the folded-regex critic findings (`critiqueSql`): errors (-30 each), warnings (-5 each), clamped to [0, 100]. A clean SQL scores 100; 1 error scores 70 (above the 60 floor); 2 errors scores 35 (below). The full rbi 100-score rule-deduction table is a later Phase 2 refinement.

## Config

No knobs. The critic guard context is owned by the phase-gate's per-agent state (`criticCtx` service), not this tool.

## Verification

```sh
tsc -b packages/data/tool-evaluate-sql-quality/tsconfig.json
pnpm vitest run packages/data/tool-evaluate-sql-quality
pnpm verify-cordis-config
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- **Phase-1 score from folded-regex findings only** — the score derives from the folded-regex critic (`critiqueSql`) + basic heuristics (a SELECT must be present). The full rbi 100-score rule-deduction table is a later Phase 2 refinement; Phase 1 unblocks the gate floor.
- **Fail-closed when ungrounded (open contract decision)** — the `EMPTY_CRITIC_CTX` fallback (empty candidate tables) is used when `ctx.get('criticCtx')` is undefined (the phase-gate is not mounted) or `forAgent` returns undefined (the agent has no harvested state yet). With empty candidate tables the critic's table rule emits an error for every FROM-table, so a normal SQL scores 0 and the path blocks — the opposite of the originally documented "fail-open" behavior. The intended contract (fail-open pass-through vs. fail-closed enforcement) is unresolved; a true fail-open fix (a pass-through verdict that skips the table/partition/json rules when no guard data is present) is deferred. Conservative Phase-1 ships the behavior as-is and documents it here. This mirrors the same open decision in `@deepseek-ai/dsh-tool-critique-sql`.
