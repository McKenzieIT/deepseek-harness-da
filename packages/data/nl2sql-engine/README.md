# @deepseek-ai/dsh-nl2sql-engine

English | [中文](README.zh.md)

> P13b — the NL→SQL engine for the data agent (production graduation of the
> throwaway `wayfinder/data-agent/prototypes/p13-nl2sql-engine/`). Resolves
> wayfinder ticket `phase-3/P13b-nl2sql-engine-prod-hardening.md`.

An additive Cordis `Service` (`ctx.nl2sql`) over the data-agent's NL→SQL
pipeline: **BM25 schema-linking** + **SQL-generation prompt** (RBI
`v2-baseline.md` staged SOP) + **regex/JSON-path critic** (the `sql_syntax_gate`,
replacing sqlglot AST — no TS equivalent) + **execution-feedback
self-correction** + **eval-gate-minimal**. The extreme-(B) path on the P6
semantic-layer substrate (research `p6-nl2sql-feasibility.md`: complete (C) is
single-period infeasible — RBI's own L1 ~9%).

## What ships (P13b grilling — 5 decisions)

- **Q1 P5/P6 gap** → local `RetrievalLinker` / `CriticGuardData` interfaces +
  thin in-process defaults (`Bm25Linker`, YAML substrate reader). Declares NO
  `ctx.retrieval`/`ctx.schema` seams (P5/P6 own them). Graduates **P5b/P6b**
  production tickets; P13b additive-swaps when they ship.
- **Q2 critic ownership** → critic logic + `critiqueSql(sql, guardCtx) →
  GateResult` + the `GateResult` type live HERE. P7b's phase-gate
  `sql_syntax_gate` slot delegates (one-directional `phase-gate →
  nl2sql-engine`, no cycle); the engine's self-correction loop calls its own
  critic directly.
- **Q3 package shape + eval timing** → logic modules + component exports for
  P7b (GENERATION prompt-section content, `critiqueSql`, `Bm25Linker`) +
  eval-only `generate()` + eval-gate-minimal (ships now; F6's real
  `MultiTurnSession` runner → P11). Production runtime is **agent-loop-driven**
  (P7): the agent LLM generates SQL; the phase-gate runs the critic.
- **Q4 critic exposure** → gate-only (`sql_syntax_gate`); `search_data_sources`
  is the sole model-facing tool; `evaluate_sql_quality` dropped.
- **Q5 scope** → in-scope: engine + critic(gate-only) + conventions + bundle +
  `search_data_sources` + eval-gate-minimal + code-review-low fixes. Deferred:
  F3 (vector swap — seam unchanged, BM25-only) / F4 (session-level near-dup →
  Not-yet-specified query-trio; engine-internal thin stays) / F5 (keep regex +
  JSON-path + execution-feedback; fail-open + documented residual risks; NOT
  sqlglot) / F6 (real runner → P11).

## Known Limitations and Deferred Work

- **F3 — Vector swap** — BM25-only retrieval; the seam is unchanged but the real vector provider (`ctx.retrieval` via P5b) is not yet wired. Schema-linking accuracy is bounded by BM25 recall until then.
- **F4 — Session-level near-duplicate gate** — the engine-internal thin `NearDupGate` is retained, but cross-turn session-level dedup is deferred to the Not-yet-specified query-trio.
- **F5 — Residual risk (execution feedback)** — regex + JSON-path + execution-feedback critic is retained (fail-open); sqlglot has no TS equivalent and no MaxCompute dialect. Documented residual risk: the critic may pass syntactically invalid SQL that only fails at execution time.
- **F6 — Eval runner** — eval-gate-minimal ships now; the real `MultiTurnSession` eval runner is deferred to P11.
- **`search_data_sources` tool registration** — the model-facing tool registration via `ctx.tools` was initially deferred (needed `@deepseek-ai/dsh-tools` API grounding); now shipped as `packages/data/tool-search-data-sources/`. Corpus is empty until P6b `ctx.schema` substrate is wired.

## Seams consumed

- `ctx.query` (P4b `@deepseek-ai/dsh-query`) — execution (3-state
  `QueryOutcome`), via the agent loop in production; the eval runner uses the
  in-package `StandInOdps`.
- `@deepseek-ai/dsh-query-maxcompute` — `loadConventions` + `conventions.yaml`
  (the P4 per-engine conventions seam, F1).
- `@deepseek-ai/cordis` + `@deepseek-ai/schemastery` — `Service`, `Context`,
  `z` (the Service shell + `ctx.nl2sql` seam).

## Run

```
pnpm test packages/nl2sql-engine           # the 9 scenarios (vitest)
pnpm typecheck                              # tsc -b (host)
```

The 9 scenarios (S1–S9) validate BM25 linking + prompt + critic gate +
JSON-path + feedback self-correction + near-dup gate + eval-gate L1 pass-rate +
honest decline + the `sql_syntax_gate` slot. Deterministic (dsh-llm-replay
stand-in + stand-in ODPS); no external LLM/ODPS key.

## Code-review-low fixes (baked in)

#1 `hasPartitionFilter` greedy cross-statement/clause → scoped to the WHERE
clause of each `;`-split statement. #2 `hasSelectStar` missed `t.*` +
`SELECT a, *` → parses the select list. #3 `running` → continues via
`attach` (check_query) up to 3×. #4 `FailureKind` normalized lower_snake. #5
`NearDupGate.hash` removes ALL whitespace. #6 `Bm25Linker` uses the hit's
payload directly (no redundant re-find). #7 c07's dead `__never__` ODPS entry
removed (`odps` optional).
