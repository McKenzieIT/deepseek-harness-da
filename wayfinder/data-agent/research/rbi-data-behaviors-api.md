# reverse-bi Data-Agent Behaviors, API Surface, and Eval Harness

> Research note for the wayfinder chart: migrating `deepseek-harness-da` →
> `deepseek-harness-data-agent` by porting reverse-bi's data-agent capabilities
> as plugins. Source = primary code/docs in `/Users/mckenzie/workspace/reverse-bi`.
> All citations are `path` or `path:line`. Inferences labelled `INFERENCE`.

## 0. What reverse-bi IS (frame for every section below)

AI-native **ad-hoc data-retrieval (取数) platform** for game designers/operators.
Core value = **precision** (准官方数据 outlet: "宁可少答不可错答" — when
uncertain, honestly reject). Two data sources: **event-tracking logs (埋点)** and
the **general data warehouse (数仓, MaxCompute DWS tables)**. Routes each query
to the best source (warehouse preferred; event data as fallback). See
`README.md` (architecture diagram + 定位) and `CONTEXT.md` (Core Concepts:
Personalized Data Request, Event Tracking Data, General Data Warehouse, Data
Source Resolution Order, Honest Rejection, System Trust Level).

Three-stage query pipeline (ADR-0007): **Understand → Confirm → Analyze**,
mirrored in the agent as 4 phases (§3). `resources/agent-protocol.md` declares
the role ("游戏数据分析 Agent"), the 3 core principles (准官方/诚实拒绝/AI 原生
非模仿分析师), and funnels all execution rules to `prompts/v2-baseline.md` as the
single source of truth.

---

## 1. API Surface (openapi.json — 79 paths, 26 tag groups)

Parsed from `openapi.json` (OpenAPI 3.1, title "Reverse BI Web", FastAPI-generated).
Groups by purpose:

**Data-agent core (the conversation + execution path):**
- `agent` (9 endpoints): `POST /api/agent/tasks` submit, `POST /api/agent/batch`,
  `GET /api/agent/tasks/{id}/events` SSE stream, `GET .../result`, `POST .../cancel`,
  `GET /api/agent/sessions`, `GET/PUT /api/agent/config`. — The async agent task
  runner (the "harness" surface that drives the LLM+MCP loop).
- `chat` (6): session CRUD + `GET /api/chat/search`. — Chat sessions.
- `audit` (5): `GET /api/audit/records`, `PATCH .../{log_id}`, `POST .../{log_id}/repair`,
  `GET .../{log_id}/trace`. — Query audit queue + repair workflow.
- `verified-answers` (4): create/search/get/delete. — Cached high-confidence
  answers (lighter than Golden Cases).
- `retrieval` (2): `POST /api/retrieval/search`, `GET /api/retrieval/status`. —
  Semantic-layer retrieval HTTP surface.
- `rag` (4): entries CRUD + `POST /api/rag/sync-verified`. — RAG entry store.

**Semantic-layer + knowledge management:**
- `semantic` (5) + `tables` (5): `GET /api/semantic/domains|events|tables`,
  `GET /api/semantic/tables/dim-list`, `GET .../tables/{name}/xray`,
  `PUT .../events|tables/{name}`, `GET .../events/{name}/history`. — Semantic
  layer CRUD + xray + history.
- `accumulated-definitions` (4): CRUD. — Project-level persisted metric/dim defs.
- `golden` (2): `GET /api/golden`, `GET .../{case_id}`. — Golden Case corpus.
- `dataset` (4): candidates list/get/update, `POST .../contrastive`. — Eval
  candidate management.
- `prompts` (8) + `format-templates` (7): prompt + template versioning/activate/
  rollback. — Prompt-evolution & format-template subsystems.
- `skills` (8) + `flows` (5) + `scopes` (5): Query Skills CRUD + invoke +
  record-usage + suggest-params; Flow runner; multi-tenant Scope admin.
- `context` (4): fragments/preview/sync. — Context-engineering (prompt assembly).
- `user-preferences` (3): CRUD.
- `suggestions` (1), `drill-suggestions` (1), `feedback` (1), `downloads` (1),
  `eval` (1): drill suggestions, followup suggestions, card feedback, CSV export
  download, eval dashboard.

**Ops/auth:** `auth` (4), `dashboard` (5: summary/events/flywheel-liveness/
table-health), `untagged` (1: `/api/health`).

**Migration signal:** The agent/chat/audit/retrieval/semantic/verified-answers
groups are the data-agent behaviors to reproduce as plugins. `prompts`/
`format-templates`/`flows`/`context` are prompt-evolution + context-engineering
superstructure that may be out-of-scope for a minimal data-agent harness.
`openapi.json` (the file itself, parsed via python json.load).

---

## 2. Data-Source Connectors

### 2a. Engines (3 registered, 1 production)

`libs/rbi-query/src/rbi_query/registry.py` — `_ENGINE_MODULES` dict registers
`maxcompute`, `mysql`, `hologres`. `valid_engines()` returns only engines whose
`execute` capability is `SUPPORTED` (hologres is `NOT_IMPLEMENTED`, so it's
hidden from the agent). `verify_capability_claims()` runs at startup to assert
declared `SUPPORTED` dimensions have corresponding methods. `get_engine(name,
scope_id)` constructs per-scope; an override factory registered by rbi-mcp
(`register_engine`) takes precedence in production.

`libs/rbi-query/src/rbi_query/engines/__init__.py` — "MaxCompute engine
package." (single-line; the maxcompute engine is the only fully-realized one).

### 2b. MaxCompute connector (the production data source)

`libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`:
- **3-tier credential resolution** (`resolve_connection`): tier 0 = injected
  `credential_resolver` callback (host registers one; rbi-mcp's reads DB
  `odps_configs`); tier 1 = scope `config.yaml` `maxcompute.config_file` +
  `environment` (domestic vs overseas endpoints); tier 2 = `ODPS_ACCESS_ID/
  KEY/PROJECT/ENDPOINT` env vars. `EngineNotConfigured` if all three miss.
- `OdpsCredential` dataclass: `access_id, access_key, project, endpoint, origin`.
- `ScopeConnection`: per-scope cached, lazily constructs the `pyodps.ODPS` object
  (`acquire()`), remembers failure (no retry on config errors).
- `get_scope_connection(scope_id)` / `invalidate_scope_connection(scope_id)` —
  per-scope connection cache. **INFERENCE:** the docstring admits this per-scope
  path is not yet hit in production (rbi-mcp's override factory short-circuits
  it); the override factory resolves credentials via `state.get_odps()` each
  query.

`libs/rbi-query/src/rbi_query/engines/maxcompute/executor.py`:
- `CAPABILITIES` declares `execute, cost_estimate, cancel, progress,
  async_handle, partition_guard` all `SUPPORTED` (dialect="maxcompute").
- `PATIENCE_SECONDS = 30.0` — sync-wait threshold before handing back a
  `QueryPending` handle (NOT a timeout, NOT a cancel).
- `OdpsExecutor.execute(sql)`: `asyncio.to_thread(self._acquire)` →
  `odps.run_sql(sql, project=...)` (non-blocking submit, NOT `execute_sql`
  which blocks) → polls `instance.is_terminated()` every 2s up to 30s → if
  terminated: `results.read_rows(instance, max_rows)` → `QueryCompleted`; else
  `QueryPending(instance_id, stage, engine_detail_url=logview)`.
- `estimate_cost(sql)`: `odps.execute_sql_cost(sql)` → `CostEstimate(input_bytes)`
  or `CostUnavailable` (4 server-side cases: external tables / UDF partition
  indeterminacy / script mode / estimation timeout — API-indistinguishable).
- `cancel()`: `instance.stop()` (server-side stop, D1 ③). `canceller_for(id)`
  returns a closure bound to a specific instance (prevents the per-query
  executor's `self._instance` from being overwritten by a later `execute` —
  the C4 bug). `attach(instance_id)` re-connects to a running/finished job
  (instance_id = handle; results persist 14 days server-side).
- `for_scope(scope_id)`: new executor per query; connection cached per-scope
  (shared executor would let query B overwrite query A's `_instance` and
  `cancel()` the wrong job).

### 2c. MySQL + Hologres

`libs/rbi-query/src/rbi_query/engines/mysql/executor.py` and
`.../hologres/executor.py` exist. Hologres is a `NOT_IMPLEMENTED` stub (hidden
from `valid_engines()`); MySQL is `SUPPORTED` but **INFERENCE:** not used for the
game data (all 531 semantic-layer tables are maxcompute, per
`phases.py` `_DEFAULT_ENGINE = "maxcompute"` comment). MySQL likely serves
internal/operational stores, not the analytic warehouse.

### 2d. What data lives where

`CONTEXT.md` (Event Tracking Data, General Data Warehouse):
- Event logs: `ods_{game_id}_all_view` (MaxCompute) — raw SDK events, schema
  changes per patch, fallback source, max granularity.
- Warehouse: `dws_{game_id}_*` tables — pre-aggregated KPIs (retention, funnels,
  LTV, ARPU). Preferred source when tables can answer.
- Cross-system query: JOIN warehouse dimension → event data (T+1 freshness
  boundary for warehouse dims).

---

## 3. Query / Analysis Pipeline (NL → SQL via LLM, NOT a fixed parser)

### 3a. The agent is a 4-phase, phase-gated, tool-calling loop

`libs/rbi-agent/src/rbi_agent/data_agent/phases.py`:
- `Phase` enum: `UNDERSTANDING, GENERATION, EXECUTION, INTERPRETATION`.
- `_DEFAULT_ENGINE = "maxcompute"` (single source of truth; agent pipeline does
  NOT resolve engine per-table — all tables are maxcompute).
- Each phase has a **tool whitelist** (`PhaseConfig.tools`):
  - `UNDERSTANDING_TOOLS`: `search_data_sources, load_table_definition,
    load_event_definition, load_table_dimensions, present_clarification,
    save_accumulated_definition` + universal.
  - `GENERATION_TOOLS`: `critique_sql_tool, evaluate_sql_quality` + universal.
  - `EXECUTION_TOOLS`: `query_data` + universal.
  - `INTERPRETATION_TOOLS`: `present_decomposition, present_table, compute,
    record_template_usage, suggest_followups` + universal.
  - `UNIVERSAL_TOOLS`: `lookup_terminology, get_user_preferences,
    load_accumulated_definition`.
- `PipelineConfig`: `max_fallbacks=2, max_subquestions=4, max_executions_per_turn=8,
  max_llm_calls_per_turn=60, critique_confidence_floor=0.6, quality_score_floor=60,
  disambiguation_timeout_seconds=300, forced_table_load_timeout_seconds=30,
  max_state_turns=20`.
- Markers: `_DECOMPOSITION_MARKER="【拆解】"`, `_INCOMPLETE_MARKER="【未完成】"`
  (parsed by `gates.py` to detect compound-question decomposition and honest
  decline in INTERPRETATION).

`libs/rbi-agent/src/rbi_agent/data_agent/pipeline.py` — `DataAgentPipeline`
orchestrates: `AgentLoop` (core/loop.py) drives LLM tool-calls;
`assemble_system_prompt`; `QueryRewriter`; `forced_load` (forces
`load_table_definition`/`load_event_definition` after UNDERSTANDING);
`build_time_context` (time_resolver); `TemplateShortCircuit` (Query Skills);
`LearningStore`/`QueryLearning`. Imports `rbi_query.conventions.render_conventions_markdown`
(SQL dialect rules injected into the system prompt — the only allowed
rbi-query→rbi-agent import, per ADR-0028 D3).

### 3b. NL → data-source matching is semantic retrieval (hybrid), not NL→SQL direct

`resources/tool-reference.md` (Tool 1: search_data_sources) + `README.md`
(retrieval stack): `search_data_sources(query)` returns ranked candidates from
events + tables via **hybrid retrieval: BM25 (jieba Chinese tokenizer) +
sqlite-vec (text2vec-base-chinese-paraphrase, dim=768) + RRF fusion**, nDCG@10=0.816.
Also returns `verified_hit` (cached verified answer) and `query_matches` (golden
few-shot examples + template matches). The LLM then writes SQL itself grounded
by `load_event_definition` / `load_table_definition` / `load_table_dimensions`.

**So: NL → (semantic retrieval) → candidate sources → (LLM) → SQL → (guard
chain) → MaxCompute → result.** No fixed NL→SQL parser; no direct query
without SQL generation.

### 3c. SQL generation is gated by two pre-exec critics

`resources/tool-reference.md` (critique_sql_tool, evaluate_sql_quality) +
`phases.py` `GENERATION_TOOLS`:
- `critique_sql_tool(sql, question, dsl_json, semantic_fields_json,
  event_params_json)`: 3-layer pre-exec critic — (1) sqlglot AST clause-level
  vs semantic-layer fields + DSL intent; (2) JSON-path check vs event
  `params_fields` (catches fabricated/renamed `GET_JSON_OBJECT` fields); (3)
  Registry-grounded (R1 source口径 / R2 column profile / R3 FK cardinality).
  Returns `verdicts, registry_findings, summary, confidence, recommendation
  (KEEP/FIX)`. confidence ≥ 0.8 + no error → proceed; < 0.6 (`critique_confidence_floor`)
  → reject; `clarify` → disambiguation.
- `evaluate_sql_quality`: 100-point score, -5..-20 per rule violation;
  < 60 (`quality_score_floor`) → reject.

### 3d. Query execution: rbi-query pipeline + 3-state outcome + guard chain

`libs/rbi-query/src/rbi_query/pipeline.py` — `run_query_async` is the **single
formal entry** (D2: async-only; `run_query` is a deprecated sync wrapper for
rbi-eval). Flow: `get_engine(engine, scope_id)` → `load_guard_config_merged`
(3-level config + provenance) → `load_conventions(engine).sqlglot_dialect`
(hive) → `build_chain(executor.capabilities, guard_config, is_ambiguous_fn,
progress_cb)` → `QueryContext(sql, engine, scope_id, required_predicates,
timeout, config, dialect, purpose)` → `chain.run_async(ctx)`.

`QueryOutcome` is a **3-state union** (`core/protocol.py`): `QueryCompleted
(columns, rows, row_count, truncated, sql, execution_meta)`, `QueryPending
(instance_id, stage, elapsed_ms, engine_detail_url, hint, cost_check)`,
`QueryFailed(error, parse_failed, timed_out, instance_id, engine_detail_url,
sql, failure_kind)`. Adding a 4th state is a compile error at every match
site (`assert_never`).

`purpose` param: `"primary"` (full timeout budget) or `"probe"` (budget =
`min(patience×2, full_budget)`) — gates get the probe budget so a gate's
cost ≤ the main query's. `required_predicates`: `table_name → required
predicate field names` (e.g. `ds` partition), assembled by rbi-mcp from the
semantic layer; `RequiredPredicateGuard` enforces them (fail-closed).

Guard chain (`libs/rbi-query/src/rbi_query/core/guards/`): `select_only`
(SELECT-only, fail-closed parse — no regex fallback), `ambiguity` (session-
level disambiguation, only if `is_ambiguous_fn` provided), `timeout`
(TimeoutGuard = sole timeout authority, `instance.stop()` on hard timeout),
`cost` (CostGuard, `max_scan_bytes`), `retry` (RetryGuard, only `transient`
failure_kind retried), `required_predicate`, `adr`.

### 3e. The query_data MCP tool runs 3 executions per call

`libs/rbi-mcp/src/rbi_mcp/servers/execution.py:586` — `@mcp.tool(task=True)
async def query_data(...)`. Gates run in order: **G1** `pre_sampling_gate`
(`quality_gate`, `:783-790`) → **G5** `count_estimate_gate` (`limit_gate`,
`:794-798`, a `COUNT(*)` row-count pre-estimate for detail queries) → main
query. Each gate calls `run_query_async` separately (so up to 3 supervised
ODPS jobs per `query_data`, 3× billing). Also: near-duplicate detection,
fingerprint gate, **G3** LIMIT gate, query cache (key includes engine), **G8**
hh-between告知, **D6** reference-passing (returns `result_id` handle + tiered
preview, not full rows). Detail queries that exceed the row-estimate ceiling
return `gate.verdict="clarify"` → `present_clarification` (narrow scope or
export CSV).

### 3f. Result tiering (D6 reference-passing)

`resources/tool-reference.md` (Tool 7): `query_data` returns `{result_id,
columns, row_count, truncated, preview, preview_reason, sample_rows,
column_quality, hint, sql}`. Aggregation + rows ≤ 100 → `preview:"full"` with
full `rows`; detail/high-cardinality → `preview:"summary"` with metadata +
per-column quality (null_rate, distinct, min/max) + 5 sample rows. Downstream
(`present_table`, `compute`) take `result_id` — never re-run or hand-copy rows.

---

## 4. Result Rendering (tables, charts, KPIs, followups)

`libs/rbi-mcp/src/rbi_mcp/tools/presentation.py` (`register(mcp)` registers
all presentation tools):

- **`present_table(title, result_id, columns, column_types, sort_column,
  kpi_columns, chart, headers, rows)`**: **passes INTENT not data** (ADR-0029
  D6). Gives `query_data`'s `result_id`; system renders from result cache.
  Three intent fields: `sort_column` (0-based col index for "most/least/ranking"
  queries, -1 = no sort), `kpi_columns` (which metric columns to highlight in
  collapsed view, `[{column, aggregation, label, format}]`), `chart`
  (`{type:"line"|"bar", x_column, y_columns}` — line for trends, bar for
  comparisons). System computes actual values deterministically from cache
  (LLM does NOT compute aggregations). Returns `{presented:"table", view_id,
  result_id, ...}` — `view_id` is the materialized delivery-view handle.
- **`present_decomposition(summary, metrics, dimensions, time_range, source,
  filters, confidence)`**: shows the agent's understanding decomposition (replaces
  text 【我的理解】); updates top context bar + decomposition card. Mandatory
  first step of delivery.
- **`present_clarification(understood, questions, options)`**: structured
  ask-back. Returns `action:"HALT_TURN"` — caller must end the turn immediately.
- **`compute(operation, params, result_id, result_ids)`**: deterministic
  pandas-based calc from result cache. Operations: `comparison` (period-over-
  period, 2 result_ids), `ratio` (numerator/denominator), `rank`, `percentile`,
  `custom` (restricted arithmetic expression, `_safe_eval_expression` via ast
  parse — only `+-*/`, column Names, numeric Constants; no function calls).
- **`suggest_followups(suggestions)`**: 2-3 followup directions as
  `[{label, value}]` (value = the question text sent back). `_normalize_followups`
  dedupes + strips.
- **`log_audit(record)`**: terminal tool; records the full audit trail
  (identity/retrieval/confirmation/plan/execution/delivery/escalation_context).
  Server auto-injects log_id/timestamp/session_id/model/auto_tags/
  preliminary_root_cause/classification_confidence.

Frontend rendering (`README.md` 技术栈 + 功能页面): React 18 + ECharts 6.1
(`echarts-for-react`) for charts; shadcn-ui tables; GSAP 3.15 animations. Pages:
`/chat` (streaming chat + chart/table/SQL artifact panels), `/dashboard`
(coverage/confirmation/risk/evolution), `/audit` + `/audit/:id`, `/semantic`,
`/context`, `/experiment`, `/dataset`, `/analytics` (pinned-chart aggregation).

---

## 5. Eval Harness (what's scored and how)

### 5a. EvalCase corpus schema (schema_version: 3)

`libs/rbi-eval/src/rbi_eval/models/eval_case.py` — `EvalCase` (`_ClosedModel`:
strict + `extra="forbid"` so unknown keys are errors, not silently dropped):
- `input`: `{question, scope_id, turns?}`. `turns` (multi-turn) must contain ≥1
  user turn or validation rejects.
- `expected`: `{sql | sql_steps (mutually exclusive), result_value,
  behavior: "direct_answer"|"clarify"|"reject"|"degrade", match_mode:
  "scalar_exact"|"set_equal"|"ordered_subset"|"row_count_range"|"multi_scalar_exact"}`.
- `dimensions`: `sql_complexity (L1-L4)`, `interaction_complexity (I1-I4)`,
  `data_source (event|dws|cross_system|dim)`, `domain`, `time_complexity
  (single_day|range|comparison|realtime)`, `ambiguity_type (none|A-F)`,
  `semantic_coverage (covered|partial|uncovered)`, `query_intent
  (metric_lookup|trend|comparison|ranking|distribution|proportion|cohort)`.
- `meta`: `roles (eval|regression|capability|fewshot|adversarial, min 1)`,
  `tier (draft|verified|confirmed|curated)`, `provenance
  (synthetic|production|manual|migrated)`, `anchor_ds` (date for template
  resolution or `full_history` sentinel), `needs_repin`, `retired`, etc.

Sample: `eval-cases/10000334/eval_10000334_001.yaml` — question "看下司测期间
每天有多少人在玩", expected SQL on `ods_10000334_all_view` WHERE
`event='game.role.online'`, `behavior: direct_answer`, `match_mode:
multi_scalar_exact`, dimensions `L2/I1/event/用户生命周期/range/none/covered/ranking`,
meta `roles:[eval], tier: verified, provenance: migrated`. `business_context`
records the disambiguation rationale ("多少人"→ role_id vs account_id, both
output; "司测期间"→ exact window; events-only game has no DWS active wide table).

Corpus distribution (`eval-cases/_migration_report.md`): 143 files migrated
(5 scope subdirs: 10000147, 10000251, 10000312, 10000329, 10000334); 36-row DB
delta pending (19 golden_real + 15 t7 stubs to delete + 2 multi-turn deferred) +
17 synthetic. `query_intent` distribution: metric_lookup 86, proportion 34,
ranking 16, trend 6, distribution 1 (5/7 categories present — PASS).

### 5b. Three-level scoring

`libs/rbi-eval/src/rbi_eval/models/case_score.py` + `scoring/l1.py`:

**L1 — deterministic assertions** (`scoring/l1.py`, `score_l1`): 7 assertions:
1. `sql_executable` — did the SQL run? (multi-step: every parseable step)
2. `result_non_empty` — rows returned?
3. `behavior_match` — agent's behavior matches expected? (skipped on l1 layer
   — comparing expected vs itself is a free pass)
4. `result_match` — result value matches per `match_mode` (see 5c)
5. `field_coverage` — AST check: generated SQL covers expected fields?
6. `limit_reasonable` — row count ≤ `REASONABLE_ROW_CEILING` (1000)?
7. `partition_compliant` — SQL has `ds` partition predicates? (uses
   `SemanticContract` from semantic layer; fallback `_MINIMAL_PARTITION_COLUMNS
   = {"ds"}`)

Verdict: `pass` (all pass) / `partial` (any skipped) / `fail` / `error` (parse
failure). `normalized=True` if sqlglot auto-fix flipped whitelist assertions to
pass. `ExecutionFailureClass` (`syntax_error|infrastructure|timeout|guard_rejected|
patience`) distinguishes "the evaluated SQL is broken" from "the environment
broke" — only `syntax_error` triggers auto-fix. `classify_execution_failure`
message-matches; default `infrastructure` (fewest consequences).

Two eval layers (`EvalLayer`): **`l1` (语料自检 / corpus self-check)** — the
"generated" SQL IS the golden SQL, so behavior_match is skipped; **`l2`
(能力评测 / capability eval)** — an agent produced SQL+behavior, all assertions
real. `derive_eval_layer(generate_sql)` (`run.py:241`) infers which.

**L2 — LLM judge** (`case_score.py` `L2Result`): 4 dimension scores (0-1 floats):
`sql_semantic, disambiguation, honesty, completeness` + `avg` + `judge_model`
+ `reasoning`. `fast_path=True` if generated SQL == golden SQL char-identically
(skip judging, derive score). `error` if judge ran but failed after retries
(scored-vs-errored is exclusive-or enforced).

**L3 — judge agent** (`case_score.py` `L3Result`): 5-step judge:
`semantic_analysis → datasource_verification → sql_execution_comparison →
equivalence_judgment → attribution_report`. Returns `final_score,
error_attribution, root_cause, steps_completed, judge_agent`. `error` if judge
failed.

`CaseScore` = `{case_id, run_id, l1: L1Result, l2: L2Result?, l3: L3Result?,
multi_turn_diagnostic?, latency_ms}`. `l2=None` means no judge ran (L1-only
run); a judge that ran-and-failed carries `error`. `latency_ms` includes
execution + judging (retry backoff inside the interval).

### 5c. Result matching (5 match modes)

`libs/rbi-eval/src/rbi_eval/scoring/match_modes.py` — `check_result_match`:
- `scalar_exact`: `{"value": <scalar>}` — first row's first value == target.
- `multi_scalar_exact`: `{"fields": {<name>: <expected>}}` — first row's
  named fields all match.
- `row_count_range`: `{"min, "max"}` — row count within [min, max].
- `set_equal`: `{"rows": [<row_dict>, ...]}` — actual rows == expected set
  (order-insensitive).
- `ordered_subset`: `{"rows": [...]}` — expected rows appear in order.

### 5d. SQL template rendering (date placeholders)

`libs/rbi-eval/src/rbi_eval/orchestration/template.py` — 112 cases carry
`{{ds_yesterday}}`/`{{ds_7d_ago}}`/`{{ds_14d_ago}}`/`{{ds_30d_ago}}` placeholders
(`_OFFSET_DAYS` dict: 1/7/14/30 days from `anchor_ds`). `render(sql, anchor_ds)`
does `datetime.date` arithmetic (never string surgery — handles month boundaries).
Output format matches input (`20260806`→`20260805`; `2026-08-06`→`2026-08-05`).
`FULL_HISTORY` sentinel = "no reference date" (mutually exclusive with
placeholders). Unresolved placeholder → `TemplateError` (never sent to warehouse
as literal `{{...}}`).

### 5e. Run lifecycle

`libs/rbi-eval/src/rbi_eval/orchestration/run.py`:
- `run_one_case` (`:499`): execute → score L1 → (if `judge_provider`) score L2+L3
  unconditionally (SPEC §5.8) → persist. Never raises per-case failures (returns
  unscored `CaseRunOutcome`), except `AuthenticationAbort` (bad credential =
  not a per-case failure). Two repetition knobs: `pass_k` (multi-turn, all-must-
  pass, rewrites verdict) and `sample_k` (single-turn pass@k estimation, first
  sample persisted, rest in `samples`). `_retrying_executor` wraps with backoff.
- `run_batch` (`:1084`): lifecycle `start_run` → per-case `run_one_case` →
  `finalize_run`. Computes `partial_run, coverage_rate, scored_count,
  available_count`. `_assert_judge_has_a_real_generator` refuses a sanctioned
  generator + judge combo. `_assert_l2_distribution_is_not_degenerate` refuses
  degenerate judge score distributions.
- `execute_case` (`orchestration/case_execution.py`): single-step → run the one
  SQL; multi-step → run each parseable step in order, skip placeholder pseudo-SQL.
  `final` = last step's result ONLY if last step itself ran (else None — earlier
  step's rows are not the case's answer).
- Multi-turn: `orchestration/multi_turn.py` + `multi_turn/session.py` —
  `MultiTurnSession` drives scripted conversations; `MultiTurnDiagnostic`
  records `session_id, total_turns, streak, terminal_verdict, derailed_at_turn`
  (diagnostic only, doesn't influence pass/fail).

### 5f. Two additional capability evals (derived, not hand-authored)

`eval-cases/disambiguation/README.md` — disambiguation ground truth derived
from `tests/golden/eval_pairs.yaml`: 35 `near_miss` (should_disambiguate: true)
+ 34 `synonym` (should_disambiguate: false) = 69 (≥50 ✅, ≥25 each side ✅).
`adversarial` excluded (correct outcome = no_strong_match reject, not clarify).
Tests whether the agent asks clarifying questions when metric/dimension intent
is ambiguous.

`eval-cases/reuse/README.md` — reuse ground truth: 34 `synonym`
(should_reuse: true) + 69 `near_miss`+`adversarial` (should_reuse: false) = 103
(≥20 ✅). Reuse precision > recall: false-positive = confident wrong number;
false-negative = only extra token cost. `adjudicate_reuse` LLM failure falls
back to "refuse reuse".

### 5g. Eval CLI + observability

`libs/rbi-eval/src/rbi_eval/cli/` — `run_cmd, baseline_cmd, comparison_cmd,
coverage_cmd, dashboard_cmd, diagnose_cmd, gate_cmd, health_cmd, case_cmd,
obs_cmd, main`. Observability: `observability/` (metrics, store, health,
alerting, correlation, dashboard_gen, trigger + webhook/log channels). Runs
persisted under `eval-cases/_runs/run_<timestamp>_<id>.json` (13 runs visible).
Coverage tracked in `eval-cases/_coverage/latest.json`. Diagnostics:
`diagnostics/` (aggregation, diff, evidence, report_builder, stability, trend).

---

## 6. Implications for migration (reverse-bi → harness data-agent plugins)

1. **The data-agent is NOT one plugin — it's a stack of ~6 cooperating layers:**
   (a) semantic-layer retrieval (`search_data_sources` + BM25/vec/RRF); (b)
   semantic-layer loaders (`load_table_definition/event_definition/dimensions`);
   (c) SQL generation + pre-exec critics (`critique_sql_tool`,
   `evaluate_sql_quality`); (d) query execution + guard chain (`query_data` +
   rbi-query pipeline: SelectOnly/Cost/Timeout/RequiredPredicate/Retry); (e)
   presentation (`present_table/decomposition/clarification`, `compute`,
   `suggest_followups`); (f) audit (`log_audit`). Each must become a plugin (or
   plugin-group) to preserve the phase-gated tool whitelists in `phases.py`.
2. **The MaxCompute connector is the hardest dependency to port** — 3-tier
   credential resolution, per-scope connection cache, 30s patience + 3-state
   outcome + server-side cancel + orphan tracking (`connection.py`, `executor.py`).
   The harness's plugin contract must carry `scope_id` explicitly (rbi-query's
   `run_query_async` requires it; it does NOT read ContextVars —
   `pipeline.py` docstring). Per-query executor (not shared) is load-bearing for
   cancel correctness.
3. **NL→SQL is LLM-driven, not parser-driven.** The harness must expose the
   semantic-layer retrieval + loaders as tools the LLM calls, NOT build a
   NL→SQL translator. The 4-phase pipeline (Understanding→Generation→Execution→
   Interpretation) with tool whitelists (`phases.py`) is the behavior to
   reproduce — the harness's agent loop must enforce per-phase tool gating.
4. **Guard chain is non-negotiable for precision.** The "宁可少答不可错答" value
   is upheld by: SelectOnly (fail-closed parse), RequiredPredicate (ds partition),
   CostGuard (scan limit), TimeoutGuard (sole timeout authority), critique_sql_tool
   (AST + JSON-path + registry grounding, confidence ≥ 0.6), evaluate_sql_quality
   (≥ 60/100). A data-agent plugin without these is not precision-grade.
5. **Result rendering is intent-passing, not data-passing** (ADR-0029 D6).
   `present_table` takes `result_id` + sort/kpi/chart intent; the system renders
   from cache. The harness must provide a result-cache + view-materialization
   layer; plugins pass intent, never hand-copy rows.
6. **Eval harness must come with the migration** — without it, precision claims
   are unverifiable. The 3-level scoring (L1 deterministic 7 assertions / L2 LLM
   judge 4 dims / L3 judge agent 5 steps), 5 match modes, 2 eval layers, and
   derived disambiguation/reuse ground-truth are the acceptance gates. The
   `EvalCase` schema v3 (`eval_case.py`) is the contract a migrated plugin must
   satisfy.
7. **Honest-rejection is a behavior, not a fallback.** `behavior: "clarify"|
   "reject"|"degrade"` are first-class expected outcomes in eval cases (not just
   `direct_answer`). `present_clarification` returns `HALT_TURN`. The `_INCOMPLETE_MARKER
   ="【未完成】"` + `HONEST_DECLINE` channel let INTERPRETATION declare "can't
   answer" without a clarify tool. The harness must model these as first-class
   turn outcomes.
8. **Out-of-scope superstructure** (likely NOT needed for a minimal data-agent):
   `prompts`/`format-templates` versioning+activate+rollback, `flows` runner,
   `context` fragment assembly, `dashboard`/`experiment`/`monitor` pages, the
   Prompt-Evolution + Golden-Corpus-Evolution flywheels. These are maturity-stage
   optimizations; the harness can defer them.

## 7. Open questions

- Does the harness's plugin contract support **per-phase tool whitelists**
  (the `PhaseConfig.tools` frozensets)? If not, the migration must add a gating
  layer or the agent loses the Understanding/Generation/Execution/Interpretation
  isolation that prevents e.g. calling `query_data` before `critique_sql_tool`.
- The MaxCompute override-factory short-circuits the per-scope connection cache
  in production (`connection.py` + `registry.py` docstrings admit zero production
  callers). Should the migration wire the tier-0 credential resolver properly,
  or carry forward the override-factory pattern?
- The 3-executions-per-`query_data` (G1/G5/main) triple-billing is a known cost
  (`executor.py` + `registry.py` C4 docstring). Does the harness want to
  preserve this gating, or collapse it?
- `anchor_ds` + `{{ds_*}}` template rendering (`template.py`) is eval-only (the
  production agent resolves dates via `time_resolver`). The migration must
  decide whether eval-template rendering is a plugin or stays in the eval harness.
- Multi-turn eval (`multi_turn/session.py`, pass_k) requires an
  `AgentResponder` injection — does the harness's agent runner expose the
  response hook needed for multi-turn scripted eval?
