# @deepseek-ai/dsh-nl2sql-engine

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

## Deferred sub-item (honest)

The **`search_data_sources` model-facing tool registration via `ctx.tools`**
is the one piece NOT wired this ticket: it needs the
`@deepseek-ai/dsh-tools` tool-registration API grounded from the 88KB
`dsh-tools/src/index.ts`. The BM25 logic ships as the `Bm25Linker` export +
`ctx.nl2sql`; the preset's `tool-search-data-sources` row stays commented
meanwhile (forward-compatible per the preset's own note — an unregistered
whitelisted tool is simply uncallable, not a broken mount). A follow-up (or
P7b) grounds the API + wires the row.

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
