# @deepseek-ai/dsh-nl2sql-engine

English | [中文](README.zh.md)

> P13b — the NL→SQL engine for the data agent (production graduation of the throwaway `wayfinder/data-agent/prototypes/p13-nl2sql-engine/`). Resolves wayfinder ticket `phase-3/P13b-nl2sql-engine-prod-hardening.md`.

An additive Cordis `Service` (`ctx.nl2sql`) over the data-agent's NL→SQL pipeline: **BM25 schema-linking** + **SQL-generation prompt** (RBI `v2-baseline.md` staged SOP) + **regex/JSON-path critic** (the `sql_syntax_gate`, replacing sqlglot AST — no TS equivalent) + **execution-feedback self-correction** + **eval-gate-minimal**. The extreme-(B) path on the P6 semantic-layer substrate (research `p6-nl2sql-feasibility.md`: complete (C) is single-period infeasible — RBI's own L1 ~9%).

## What ships (P13b grilling — 5 decisions)

- **Q1 P5/P6 gap** → local `RetrievalLinker` / `CriticGuardData` interfaces + thin in-process defaults (`Bm25Linker`, YAML substrate reader). Declares NO `ctx.retrieval`/`ctx.schema` seams (P5/P6 own them). Graduates **P5b/P6b** production tickets; P13b additive-swaps when they ship.
- **Q2 critic ownership** → critic logic + `critiqueSql(sql, guardCtx) → GateResult` + the `GateResult` type live HERE. P7b's phase-gate `sql_syntax_gate` slot delegates (one-directional `phase-gate → nl2sql-engine`, no cycle); the engine's self-correction loop calls its own critic directly.
- **Q3 package shape + eval timing** → logic modules + component exports for P7b (GENERATION prompt-section content, `critiqueSql`, `Bm25Linker`) + eval-only `generate()` + eval-gate-minimal (ships now; F6's real `MultiTurnSession` runner → P11). Production runtime is **agent-loop-driven** (P7): the agent LLM generates SQL; the phase-gate runs the critic.
- **Q4 critic exposure** → gate-only (`sql_syntax_gate`); `search_data_sources` is the sole model-facing tool; `evaluate_sql_quality` dropped.
- **Q5 scope** → in-scope: engine + critic(gate-only) + conventions + bundle + `search_data_sources` + eval-gate-minimal + code-review-low fixes. Deferred: F3 (vector swap — seam unchanged, BM25-only) / F4 (session-level near-dup → Not-yet-specified query-trio; engine-internal thin stays) / F5 (keep regex + JSON-path + execution-feedback; fail-open + documented residual risks; NOT sqlglot) / F6 (real runner → P11).

## Seams consumed

- `ctx.query` (P4b `@deepseek-ai/dsh-query`) — execution (3-state `QueryOutcome`), via the agent loop in production; the eval runner uses the in-package `StandInOdps`.
- `@deepseek-ai/dsh-query-maxcompute` — the maxcompute `loadConventions` loader + `conventions.yaml` is the eval-only conventions path (the P4 per-engine conventions seam, F1); production `Nl2sqlEngineService` obtains conventions via `ctx.query.getConventions()` (engine-injected, engine-neutral — see the `ctx.query` seam above).
- `@deepseek-ai/cordis` + `@deepseek-ai/schemastery` — `Service`, `Context`, `z` (the Service shell + `ctx.nl2sql` seam).

## Run

```
pnpm test packages/data/nl2sql-engine           # the 9 scenarios (vitest)
pnpm typecheck                              # tsc -b (host)
```

The 9 scenarios (S1–S9) validate BM25 linking + prompt + critic gate + JSON-path + feedback self-correction + near-dup gate + eval-gate L1 pass-rate + honest decline + the `sql_syntax_gate` slot. Deterministic (dsh-llm-replay stand-in + stand-in engine); no external LLM/engine key.

## Code-review-low fixes (baked in)

#1 `hasPartitionFilter` greedy cross-statement/clause → scoped to the WHERE clause of each `;`-split statement. #2 `hasSelectStar` missed `t.*` + `SELECT a, *` → parses the select list. #3 `running` → continues via `attach` (check_query) up to 3×. #4 `FailureKind` normalized lower_snake. #5 `NearDupGate.hash` removes ALL whitespace. #6 `Bm25Linker` uses the hit's payload directly (no redundant re-find). #7 c07's dead `__never__` ODPS entry removed (`odps` optional).

## Model Experience

### NL→SQL generation prompt

#### What the model sees

`buildPrompt` (in `src/prompt.ts`) assembles the GENERATION-phase prompt section the model receives: the user question, a textual tool catalog (`search_data_sources`, `load_event_definition`, `query_data`, `check_query`, `critique_sql_tool`, `load_table_dimensions`, `save_accumulated_definition`, `resolve_term`), the staged direct-answer SOP (§3 prepare/generate/validate/execute), the honest-decline rule (§5), the eight SQL rules (§6), the rendered engine dialect conventions, the BM25-linked candidate data sources, and the event definition. In production P7b injects this section via `ctx.systemPrompt.assemble` at `phase=generation`; the eval runner's `Nl2sqlEngine.run` calls `this.llm.generate` directly with the same prompt.

#### Token effect

The full prompt is rebuilt and sent per query attempt; token cost scales with the candidate-data-source count (`topK: 5`) and the rendered conventions cheatsheet, plus the fixed SOP, eight-rules, and tool-catalog blocks.

#### KV Cache effect

Per-query prompt, not durably cached across runs; the stable prefix (tool catalog + SOP + eight rules + dialect conventions) is reusable across queries in a session when it repeats, but the candidate list, event definition, and question form the per-query tail that changes every query.

### engine dialect conventions

#### What the model sees

`renderConventionsPrompt` (in `src/conventions.ts`) renders the loaded `EngineConventions` into a markdown dialect cheatsheet injected into the GENERATION prompt's dialect section: `key_differences` bullets, available `functions` with signatures, a `cast_map` (logical type → CAST) table, and named `sql_templates` as fenced SQL blocks; a null `EngineConventions` renders a `（无 conventions）` placeholder. In production the `Nl2sqlEngineService` obtains the `EngineConventions` via `ctx.query.getConventions()` (engine-injected, engine-neutral); the eval runner loads them via `@deepseek-ai/dsh-query-maxcompute` `loadConventions` (the eval-only path).

#### Token effect

The conventions cheatsheet adds tokens proportional to the function count, cast-map rows, and SQL templates; it is part of the stable prefix for every query on the same engine.

#### KV Cache effect

The conventions section is constant across queries for one engine instance, so it sits in the stable prefix and is cacheable when the prompt prefix repeats across queries in a session.

## Known Limitations and Deferred Work

- **F3 — Vector swap** — BM25-only retrieval; the seam is unchanged but the real vector provider (`ctx.retrieval` via P5b) is not yet wired. Schema-linking accuracy is bounded by BM25 recall until then.
- **F4 — Session-level near-duplicate gate** — the engine-internal thin `NearDupGate` is retained, but cross-turn session-level dedup is deferred to the Not-yet-specified query-trio.
- **F5 — Residual risk (execution feedback)** — regex + JSON-path + execution-feedback critic is retained (fail-open); sqlglot has no TS equivalent and no engine dialect. Documented residual risk: the critic may pass syntactically invalid SQL that only fails at execution time.
- **F6 — Eval runner** — eval-gate-minimal ships now; the real `MultiTurnSession` eval runner is deferred to P11.
- **`search_data_sources` tool registration** — the model-facing tool registration via `ctx.tools` was initially deferred (needed `@deepseek-ai/dsh-tools` API grounding); now shipped as `packages/data/tool-search-data-sources/`. Corpus is empty until P6b `ctx.schema` substrate is wired.
