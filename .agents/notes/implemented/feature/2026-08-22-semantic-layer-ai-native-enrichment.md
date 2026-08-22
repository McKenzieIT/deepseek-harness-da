# Agent Note: semantic-layer AI-native enrichment (G3) + K11 migration (T1)

Status: implemented

## Problem

The K11 seed (`examples/k11-semantic-layer/`, migrated from RBI `reverse-bi/resources/semantic-layer/10000251/`) carried 321 tables + 445 loadable events but **zero `dimension_refs`/`external_refs`** — relations had to be discovered from scratch. G3 (resolved 2026-08-22) decided a two-round discovery (deterministic PK-name match + LLM semantic match), direct-write (no approval), an on-write auto-trigger, a Service method + an agent tool, DWS-first, plus mechanical metrics extraction. The blocker: this environment has **no LLM API key** (DEEPSEEK/DASHSCOPE/OPENAI unset, no provider mounted at `ctx.schema`), so the LLM round could not run via `ctx.llm`.

## Decision

Implemented the G3 design across the substrate + a new tool package, and ran the K11 relation discovery with **session subagents acting as the `llmCall`** (per the user's direction — cover all tables, record the process as a prerequisite report):

- **`packages/data/semantic-layer/src/enrichment.ts`** — `discoverRelationsFor` (deterministic PK-name round + an injected `llmCall` semantic round, merged via `mergeRefs` deduped by `dim_table` with join-key union) + `enrichAllDwsTables` (`tables?` filter, `mergeExisting` option, `writeTable(raw+refs)` preserving physical types). `llmCall` is an injected `(prompt)=>Promise<string>` so the substrate stays zod + js-yaml only (no `dsh-llm` import).
- **`src/metrics.ts`** — `extractMetricsFromTables` mechanically converts inline `metrics:` blocks to standalone `MetricDefinition` (kind=metric) YAMLs under `metrics/`, with an auto `derived_from → source` relation + `<source>__<key>` naming.
- **`src/index.ts`** (Service) — `ctx.schema.discoverRelations({tables?})` + `setLlmCall` + `autoEnrich` config; `syncWrite`/`updateTableMeta` fire an on-write hook that **merges** discovered refs with existing (so auto-trigger never wipes human-curated joins the deterministic round does not rediscover — code-review B2).
- **`packages/data/tool-discover-relations/`** — the `discover_relations` agent tool (`defineTool` + `ctx.tools.register`, `tables?` filter, path-traversal guard, not-mounted honest fallback).
- **K11 run** — a Workflow fanned 21 subagents over all 162 DWS batches (each read its batch via `mcp__local__read_file` + the 159-DIM inventory, emitting schema-validated `DimensionRef[]`); a second round of write-agents persisted the per-batch results to disk verbatim; a tsx script validated each ref + wrote `dimension_refs` back into the DWS YAMLs.

## Verification

- 138 semantic-layer + tool tests green (enrichment.spec 16, metrics.spec 15, discover-relations.spec 4, k11-graph.spec 4 [real K11 joins + metrics derived_from], k11-seed.spec 9, + the pre-existing P2 suite; tool-discover-relations.spec 11). Code review (subagent) verdict: yes-with-nits — all nits fixed (pairKey collision-proof via `JSON.stringify`, on-write hook merge-not-replace, `@param` JSDoc, `any`→`TableDefinition`).
- K11 enrichment: **126/162 DWS gained 225 `dimension_refs` across 34 DIMs** (0 dropped invalid refs; top: `dim_..._server_info` 99). 36 DWS declared `[]` (no plausible join under precision-over-recall). Subagents captured semantic matches the deterministic round misses (`act_server_id_fst`→`server_id`, `card_id`→`id`, `play_func_id`→`function_id`).
- Metrics: 3916 `MetricDefinition` YAMLs extracted (auto `derived_from`). RelationGraph (`k11-graph.spec`) builds from real K11 joins + metrics derived_from; join paths reachable.

## Alternatives considered

- **Defer the LLM round until a key is mounted.** Rejected per the user's direction: use session subagents as the `llmCall` now, covering all tables, with the process recorded.
- **One big write-agent reproducing all results.** Rejected: the full result (~100k+ chars) exceeds any single agent's output cap; instead per-batch write-agents persisted small result files, then a tsx script wrote the YAMLs.
- **On-write hook replaces dimension_refs.** Rejected (code-review B2): the auto-trigger would wipe human-curated joins; the hook merges instead (`mergeExisting=true`), while the explicit `discoverRelations` entry still replaces (re-discover, G3 direct-write).

## Consequences

- K11 is now a relation-bearing seed: 162 DWS carry `dimension_refs` (126 populated), 3916 metrics with `derived_from`, all loadable through the substrate. The `discover_relations` tool + on-write hook make enrichment repeatable.
- The subagent run is a **one-time seed**, not the production `ctx.llm` path. **F1** (`wayfinder/semantic-layer/tickets/F1-dws-dim-discovery-formalization.md`) captures production `makeLlmCall(ctx.llm)` wiring + bundle registration + multi-alternative-FK representation refinement; events `external_refs` (G3 第二轮) + DIM→DIM remain deferred.
- Data-quality notes: 1 malformed event (`activity/funcPoint_activity.yaml`, RBI duplicate mapping key) + 1 subagent table-name typo (`churn_pred`→`churnpred`, fixed) — both in the [prerequisite report](../../../../../wayfinder/semantic-layer/research/dws-dim-discovery-report.md).
