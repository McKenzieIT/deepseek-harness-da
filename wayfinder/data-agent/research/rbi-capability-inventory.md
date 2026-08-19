# reverse-bi Capability Inventory — Migration Source

> Subagent: /research (wayfinder chart). Destination: migrate reverse-bi capabilities into
> `deepseek-harness-da` (a plugin-based agent harness on vendored Cordis) as PLUGINS.
> Method: primary sources only (source code, first-party manifests). Every claim cited to the
> file that owns it. Inferences labelled INFERENCE.
>
> Scope: enumerate every discrete reverse-bi capability that could each become a harness plugin.
> reverse-bi = `/Users/mckenzie/workspace/reverse-bi` ; harness = `/Users/mckenzie/workspace/deepseek-harness-da`.
> reverse-bi is an AI-native game-data query platform (track2data upstream) over MaxCompute:
> 3-stage pipeline Understand → Confirm → Analyze (README.md:1-44).
>
> Harness plugin model (AGENTS.md:1-40): "everything is a plugin"; a **capability seam** =
> Service Definition / Service Provider / Consumer (3 roles, complete, never one); every
> contribution goes through `ctx.effect()`/`ctx.on()`; "Plugins, not loop changes". Seam
> groups observed: llm, shell, subprocess, fs, lsp, skill, web, compaction, subagent, workflow,
> context, guard, interaction, plan, preset, todo, session-query, settings, mcp-client, storage,
> sandbox, extensions, e2b, spill, jobs, code-runtime, host, boot, util, hooks, identity.

## Workspace topology (pyproject.toml — dependency DAG is the migration substrate)

Source: `pyproject.toml`. uv workspace = 12 members (`[tool.uv.workspace].members`). The
import-linter contracts encode the layering — this is the source of truth for "what depends on
what", which determines migration order.

Layering (bottom-up), each line is a `[tool.importlinter.contracts]` entry in `pyproject.toml`:

- **Leaves (no internal deps):**
  - `rbi-core` — "rbi-core has no internal deps (R2)" — forbidden to import any rbi-*.
  - `rbi-guard` — "rbi-guard has no internal deps (C7, ADR-0029 D1)" — generic guardrail pure
    functions, deps limited to sqlglot+pydantic.
  - `rbi-llm` — "rbi-llm has no internal deps (D1 §6)".
- **Mid layer (depend on leaves only):**
  - `rbi-query` → rbi-core + rbi-guard; "rbi-query does not import rbi-mcp (unidirectional)".
  - `rbi-semantic` → rbi-core; "rbi-semantic does not import rbi-data/rbi-mcp/rbi-web (R4)".
  - `rbi-data` → rbi-core; "rbi-data does not import rbi-semantic/rbi-mcp/rbi-web (R4)".
- **Composite-retrieval layer:**
  - `rbi-retrieval` → rbi-core + rbi-data + rbi-semantic; "rbi-retrieval never imports apps (R1)".
- **Top lib (heavy stack):**
  - `rbi-mcp` → all libs; "base libs never import rbi-mcp (C6)" — pandas/pyodps/sentence-transformers
    must not leak down. The `rbi` CLI entrypoint (`[project.scripts] rbi = "rbi_mcp.cli.__main__:main"`).
  - `rbi-eval` → rbi-semantic; "rbi-eval forbidden from evaluated pipeline + heavy stack (D9 R4)".
- **Agent (talks over MCP, not import):**
  - `rbi-agent` → rbi-llm + rbi-query.conventions (the ONE directed exception, "ADR-0028 D3
    Amendment"); "rbi-agent has no internal deps (ADR-0028 D3 + Amendment)" — talks to the system
    only over MCP HTTP, swappable/independently deployable. Internal layering: "rbi-agent core
    does not import data_agent" (core kernel vs domain layer).
- **Tooling:** `rbi-tools` → rbi-core/rbi-data/rbi-retrieval/rbi-agent/rbi-eval; "rbi-tools never
  imports apps (R4b)".
- **App:** `rbi-web` (FastAPI + React) — top of stack.

INFERENCE: This layering is the migration blueprint. Leaves (rbi-core/guard/llm) port first as
foundational plugins; rbi-query/semantic/data port as capability seams; rbi-retrieval composes
them; rbi-mcp's tool modules become harness tool-plugins; rbi-agent's `core/` is largely
redundant with the harness `core/agent-loop` (already exists) — only `data_agent/` is unique
domain logic; rbi-web is replaced by the harness apps/web+cli.

---

## Capability Catalog

Format: **name** | what it does | inputs/outputs | key deps | location | plugin-migration note.

### LIBS

#### 1. rbi-core — shared types, enums, config base
- **What:** Pydantic models + enums + config base classes (RbiPaths). The shared vocabulary
  every other package speaks. Leaf lib (R2).
- **I/O:** Config objects in; typed models/enums out.
- **Deps:** pydantic, pydantic-settings (`libs/rbi-core/pyproject.toml` dependencies).
- **Location:** `libs/rbi-core/src/rbi_core/` (e.g. `AuditRecord` at `rbi_core/models/audit.py`,
  imported by `tools/audit.py`).
- **Migration note:** INFERENCE — not a standalone plugin; these are shared types. Harness
  equivalent: `packages/util/brand` (Branded ids), `packages/core/scope`. Port RbiPaths/config
  into a `packages/util/` or `packages/data/` shared-types package. Low blast radius; port first.

#### 2. rbi-guard — correctness guardrails (pure functions, leaf)
- **What:** Unified behavior vocabulary, gate-signal schema, SQL-judgment pure functions
  (ADR-0029 D1). The "Guard Chain" predicates. Modules: `null_rules`, `limit_rules`, `signal`,
  `sql_rules`, `partition_rules`, `business_rules`, `intent_rules`, `vocabulary`
  (`libs/rbi-guard/src/rbi_guard/*.py`).
- **I/O:** SQL string + context → `GateSignal`/`Verdict` (REJECT/DEGRADE/PASS). Pure functions,
  no I/O.
- **Deps:** pydantic, sqlglot (`libs/rbi-guard/pyproject.toml`). No internal deps (C7).
- **Location:** `libs/rbi-guard/src/rbi_guard/` — e.g. `partition_rules.hour_between_signal`,
  `limit_rules.truncation_signal`, `limit_rules.limit_signal`, `intent_rules`, `business_rules`.
- **Migration note:** INFERENCE — maps to the harness `guard/` seam
  (`packages/guard/timeout-policy`, `packages/guard/repeat-tool-reminder`). These are loop/tool
  guardrail plugins. rbi-guard's SQL-predicate pure functions become a `guard` plugin (or a new
  `packages/query-guard/` capability) that hooks tool execution via `ctx.on()`/waterfall. Leaf
  purity makes it an ideal first port. The `GateSignal` schema becomes a typed event in the
  harness `SessionEventMap`.

#### 3. rbi-llm — LLM Provider abstraction (Protocol + impls, leaf)
- **What:** LLM provider Protocol + multiple implementations. Factory
  `create_provider(name)` (`libs/rbi-llm/src/rbi_llm/providers/__init__.py`). Providers:
  `dashscope` (DashScopeProvider), `fake` (FakeProvider, record-replay test double); `openai`
  extra (`libs/rbi-llm/pyproject.toml` `[project.optional-dependencies]`).
- **I/O:** `LLMProvider.chat(messages, tool_schemas) → LLMResponse` (with `reasoning`,
  `tool_calls`, `finish_reason`).
- **Deps:** httpx, pydantic, pydantic-settings. No internal deps (D1 §6).
- **Location:** `libs/rbi-llm/src/rbi_llm/protocol.py` (LLMProvider Protocol),
  `providers/dashscope.py`, `providers/fake.py`, `providers/__init__.py` (`_PROVIDERS` dict,
  `create_provider`).
- **Migration note:** INFERENCE — direct map to harness `llm/` capability seam. Harness already
  has `packages/llm/llm` (Service Definition/Consumer) + `llm-deepseek`, `llm-pi-ai`,
  `llm-retry`, `token-meter`. DashScope becomes a new **Provider** plugin
  (`packages/llm/llm-dashscope/`) implementing the harness LLM Service Definition. The
  `rbi_agent.core.providers.base` Protocol (Message/ToolSchema/ToolCall/LLMResponse) is a
  near-duplicate of the harness LLM seam — adopt the harness types, retire rbi's. The `fake`
  record-replay provider maps to `packages/test-support/llm-replay`.

#### 4. rbi-query — query engine abstraction (Guard chain + multi-engine executor)
- **What:** Multi-engine SQL executor + Guard chain + dialect conventions. The "decide what to
  check" layer (rbi-mcp owns "decide what to query"). Modules: `core/protocol.py`
  (`QueryOutcome` = `QueryCompleted|QueryPending|QueryFailed`, `QueryEngine` protocol,
  `ExecutionMeta`), `core/guards/` (ambiguity, select_only, timeout, adr, retry, cost,
  required_predicate — the Guard Chain), `engines/` (maxcompute/OdpsExecutor, hologres, mysql),
  `core/exceptions.py` (`EngineNotConfigured`), plus `registry` (capability matrix:
  `valid_engines()`, `capabilities_for()`, `verify_capability_claims()`, `register_engine()`,
  `get_engine()`, `run_query_async()`, `load_conventions()`).
- **I/O:** SQL + engine name + scope_id → `QueryOutcome` (completed columns/rows, pending
  instance_id, or failed). Dialect conventions YAML → SQL-glue.
- **Deps:** rbi-core, rbi-guard, sqlglot, pymysql, pydantic, pyyaml
  (`libs/rbi-query/pyproject.toml`).
- **Location:** `libs/rbi-query/src/rbi_query/` — `core/protocol.py`, `core/guards/*.py`,
  `engines/maxcompute/executor.py` (`OdpsExecutor`), `engines/hologres/executor.py`,
  `engines/mysql/executor.py`, `registry.py`, `conventions.py` (the ONE rbi-agent-visible symbol,
  `render_conventions_markdown`).
- **Migration note:** INFERENCE — this is a **capability seam** (Service Definition =
  `QueryEngine` protocol + `QueryOutcome` contract; Providers = maxcompute/hologres/mysql
  executors; Consumer = a `query_data` tool plugin). Maps to a new `packages/query/` group
  (mirrors `packages/shell/` and `packages/web/` patterns: Service Definition + Providers +
  tool Consumer). The Guard chain (`core/guards/`) composes with the ported `rbi-guard` plugin.
  `run_query_async` is async-only (D2 ③) — fits the harness async tool model. The engine
  registry's capability matrix (`verify_capability_claims`, "declared vs implemented" self-check)
  is a harness-idiomatic "misconfiguration fails loud" pattern (AGENTS.md). `conventions.py` is
  already isolated (only imports pathlib/yaml) — cleanest seam for dialect config.

#### 5. rbi-semantic — semantic layer read/write + index
- **What:** Version-controlled YAML semantic layer (events/tables/domains) reader/writer +
  schema validation + retrieval index. Modules: `reader.py`, `writer.py`, `index.py`,
  `scope.py`, `sync.py`, `sql_evaluator.py` (`libs/rbi-semantic/src/rbi_semantic/*.py`). 1450
  events, 117 tables, 11 domains (README.md).
- **I/O:** YAML files → typed event/table definitions; query → indexed matches.
- **Deps:** pydantic, pyyaml, sqlglot, rbi-core (`libs/rbi-semantic/pyproject.toml`).
- **Location:** `libs/rbi-semantic/src/rbi_semantic/` — `reader.py`, `writer.py` (write path
  has built-in schema validation), `index.py`, `scope.py`.
- **Migration note:** INFERENCE — maps to harness `storage/` capability (it already has
  `storage-sqlite`, `storage-json`, `storage-domain`) OR a new `packages/semantic-layer/`
  domain package. The YAML store is a `storage-json`-style provider; the reader/writer are a
  capability seam (Service Definition = semantic-layer read/write; Provider = local YAML
  filesystem). `scope.py` (per-game scope) maps to harness `packages/core/scope`. The
  version-controlled YAML philosophy (ADR-0001) fits the harness "source plane vs artifact
  plane" rule (AGENTS.md). Admin write tools (`register_admin` in `servers/semantic.py`) map to
  Tier-1 approval-gated interaction (harness `interaction/` + `guard/`).

#### 6. rbi-data — data access layer (SQLAlchemy ORM + audit store)
- **What:** SQLAlchemy 2 ORM models, engine/session factory, audit store, typed query
  functions. Exports `Base, get_db, get_engine, get_session_factory`
  (`libs/rbi-data/src/rbi_data/__init__.py`). Modules: `engine`, `models`, `queries`, `audit`
  (incl. `classify_root_cause`, `record_override`, `FIXTURE_TAG`), `migrations/`
  (rename_game_to_scope, add_dataset_candidate_frustration_signals, add_golden_multi_turn).
- **I/O:** Python objects → SQLite rows (WAL, 35+ tables, FTS5 trigram). Audit records in/out.
- **Deps:** rbi-core, sqlalchemy, sqlglot, pyyaml (`libs/rbi-data/pyproject.toml`).
- **Location:** `libs/rbi-data/src/rbi_data/__init__.py` (exports), `engine.py`, `audit.py`,
  `queries.py` (`persist_query_match_log`, `persist_journey_candidate`), `migrations/*.py`.
- **Migration note:** INFERENCE — maps to harness `storage/` capability. Harness has
  `storage-sqlite` (a Provider). rbi-data's ORM + audit store become a storage Provider +
  domain models. The harness already uses monotonic `SCHEMA_VERSION` (AGENTS.md pre-release
  stance) — rbi-data's migrations align. `classify_root_cause` (audit root-cause classifier)
  is domain logic that belongs in a data-agent-specific storage plugin. The
  `pytest_db_guard` entry-point (`rbi_tools.pytest_db_guard`, test/prod isolation) has no
  harness analogue — port as a test-support util.

#### 7. rbi-retrieval — hybrid retrieval / query-understanding kernel
- **What:** Independently deployable capability lib (ADR-0027). Hybrid retrieval: BM25 (jieba
  CN tokenization) + sqlite-vec (text2vec-base-chinese semantic embeddings, dim=768) + RRF
  fusion. nDCG@10 = 0.816. Modules under `semantic/`: `layer.py` (the retrieval API:
  `search_data_sources`, `load_event_definition`, `load_table_definition`,
  `load_linked_dimensions`), `index.py`, `query_index.py`, `pattern_index.py`, `embedder.py`,
  `scoring.py`, `unified_search.py`, `auto_suggest.py`, `event_view.py`, `xray.py`,
  `render_markers.py`, `retrieval.py`, `constants.py`. Plus `matching` module
  (`build_query_matches`, `detect_candidate_disambiguation`, disambiguation detectors).
- **I/O:** natural-language query + scope_id → ranked candidate data sources (tables+events)
  with tiering (analyst_confirmed/business_confirmed/draft) + disambiguation signals.
- **Deps:** rbi-core, rbi-data, rbi-semantic, rank-bm25, sqlite-vec, jieba,
  sentence-transformers (`libs/rbi-retrieval/pyproject.toml`).
- **Location:** `libs/rbi-retrieval/src/rbi_retrieval/semantic/*.py` — `layer.py`,
  `matching.py`, `embedder.py`, `index.py`, `query_index.py`, `scoring.py`.
- **Migration note:** INFERENCE — a **capability seam** (Service Definition = retrieval;
  Provider = hybrid BM25+vec engine; Consumer = `search_data_sources` tool). The heavy
  deps (sentence-transformers ~2.3GB bge-m3) must stay in the Provider, not leak down
  (mirrors the C6 "base libs never import rbi-mcp" discipline → harness "no hardcoded
  tunables in plugins", deployment-varying config in cordis.yml). The `realmodel` test marker
  + `RBI_ALLOW_REAL_MODEL=1` gate maps to the harness `test:coverage`/`test:e2e` keyless
  distinction (AGENTS.md testing policy). Disambiguation detectors + MRTR
  (`InputRequiredResult`) elicitation map to harness `interaction/` (ask-user) capability —
  the `present_clarification` HALT semantics are a harness `interaction/user-approval` +
  `guard` composition.

#### 8. rbi-agent — self-built Agent Runtime (core + data_agent)
- **What:** Two layers. `core/` = generic ReAct agent loop (swappable, talks over MCP HTTP).
  `data_agent/` = domain 3-phase pipeline (Understand→Confirm→Analyze).
- **core/ modules:** `loop.py` (`AgentLoop` — ReAct loop with tool execution, `ToolResultCache`
  per-turn, `TurnBudget`/`TurnBudgetExceeded`, `MaxStepsExceeded`, hooks
  before/after_llm_call/after_tool_call, jsonschema arg validation, tool-health circuit
  breaker), `providers/` (`base.py` = LLMProvider/Message/ToolSchema/ToolCall/LLMResponse
  Protocol, `dashscope.py`), `mcp/` (`http_client.py` = `MCPHttpClient`/RetrievalTurnContext,
  `client.py`, `server_manager.py`, `schema_converter.py`), `session.py` (SessionStore,
  TurnRecord), `active_turn.py`, `turn_context.py` (TurnContext), `context.py`,
  `context_overflow.py` (observer), `capabilities.py`, `tool_health.py`
  (`ToolHealthTracker`, circuit breaker), `events.py` (AgentEvent types: TURN_START, LLM_START,
  TOOL_INVOKE, TOOL_RESULT, REASONING, etc.), `trace.py`.
- **data_agent/ modules:** `pipeline.py` (`DataAgentPipeline` — phase-gated orchestration,
  the main `run()` entry), `phases.py` (phase definitions + `UNIVERSAL_TOOLS`),
  `gates.py`, `steering.py`, `forced_load.py` (EVENT_SPEC/TABLE_SPEC forced definition
  loading), `metric_grounding.py`, `time_resolver.py`, `rewriter.py`/`rewrite_prompt.py`/
  `rewrite_confidence.py`/`rewrite_types.py` (SQL rewrite/recovery), `recovery.py`,
  `delivery.py` (`attach_delivery_declaration`), `presentation.py`, `prompt.py`,
  `template_cache.py`, `learning.py`, `state.py`/`state_store.py`, `user_facing_text.py`.
- **I/O:** user question (str) → streamed AgentEvents (TURN_START…TURN_COMPLETE) + delivery
  artifacts. LLM drives; tools execute via MCP.
- **Deps:** httpx2, pydantic, mcp>=2.0, jsonschema, sqlglot, rbi-llm, rbi-query.conventions
  (`libs/rbi-agent/pyproject.toml`). Zero other internal deps (ADR-0028 D3).
- **Location:** `libs/rbi-agent/src/rbi_agent/core/loop.py` (AgentLoop class + run()),
  `core/providers/base.py`, `core/mcp/http_client.py`, `data_agent/pipeline.py`
  (DataAgentPipeline), `data_agent/phases.py`.
- **Migration note:** INFERENCE — **core/ is largely redundant**: the harness already owns
  `packages/core/agent-loop`, `packages/core/agent`, `packages/core/session`, `packages/mcp/mcp-client`,
  `packages/llm/`. Retire rbi-agent's `core/` and adopt the harness equivalents (the harness loop
  is the "product API spine", AGENTS.md). `tool_health.py` circuit-breaker maps to harness
  `packages/guard/` (loop-hygiene + tool-timeout). `context_overflow.py` observer maps to
  `packages/compaction/`. The `events.py` AgentEvent taxonomy maps to the harness
  `SessionEventMap` (typed events, declaration merging — AGENTS.md). **data_agent/ is the
  unique value**: it becomes a harness `preset/` (agent-presets) composition + a `skill/`
  (the reverse-bi-analyze behavior). The phase-gated pipeline + forced-load + rewriter +
  metric-grounding are domain logic that belong in a `packages/data-agent/` plugin or a
  skill-driven workflow. `TurnBudget`/`ToolResultCache` per-turn isolation discipline maps to
  harness session-scoped state (the "opaque ids are branded" + "model-visible ⟺ logged"
  invariants).

#### 9. rbi-mcp — MCP tool server (the 55-tool composite)
- **What:** FastMCP 4 composite server mounting logical sub-servers + internal tool modules.
  55 tools composite (33 data tools for the agent gate; eval/obs skipped on agent gate)
  (`servers/composite.py` `build_composite()` docstring). The `rbi` CLI
  (`[project.scripts] rbi = "rbi_mcp.cli.__main__:main"`). Top lib layer (heavy stack).
- **Structure:** `servers/` (composite, execution, semantic, retrieval, eval, obs,
  query_resume, guard_override, eval_prompts, eval_errors, obs_errors), `tools/`
  (presentation, audit, flywheel, preference, template, prompt), `middleware/` (auth, audit,
  scope = `ScopeMiddleware`), `contracts/` (execution, semantic, retrieval, common, obs, eval),
  `cli/` (serve, seed, __main__), plus `audiences.py`, `settings.py`, `state.py`,
  `gate_state.py`, `turn_context.py`, `request_scope.py`, `query_cache.py`, `result_view.py`,
  `intent_gate.py`, `quality_gate.py`, `limit_gate.py`, `required_predicates.py`,
  `disambiguation_mode.py`, `credentials.py`, `write_tiers.py`, `journey_extractor.py`,
  `query_evaluator.py`, `delivery_compute.py`, `observability.py`.
- **Tools enumerated (primary-source):**
  - **retrieval server** (`servers/retrieval.py` `register()`): `load_event_definition`,
    `load_table_definition`, `search_data_sources` (MRTR dual-track disambiguation:
    `InputRequiredResult` elicitation on modern clients; degraded path on legacy),
    `load_table_dimensions`. (4 tools)
  - **execution server** (`servers/execution.py` `register()`): `query_data` (async,
    `@mcp.tool(task=True)`, engine enum, halt/budget/near-dup/fingerprint/G3-LIMIT/G1-sampling/
    G5-row-estimate gates, turn_context self-load, 3-state `QueryOutcome` match),
    `evaluate_sql_quality` (read_only, rule-based 0-100 scoring), `check_query`
    (from `servers/query_resume.py` — async query resumption), `set_guard_override`
    (from `servers/guard_override.py` — Tier-1 admin). (4 tools)
  - **presentation tools** (`tools/presentation.py` `register()`): `present_table`
    (handle-based, intent-only: sort_column/kpi_columns/chart), `compute` (comparison/ratio/
    rank/percentile/custom over pandas), `suggest_followups`, `set_session_title`,
    `present_decomposition` (G2 contract gate), `present_clarification` (HALT turn). (6 tools)
  - **audit tools** (`tools/audit.py` `register()`): `log_audit` (Tier-1 auto-tagging,
    root-cause classification, high-water SQL ledger), `get_audit_record` (scoped),
    `update_audit_record` (analyst_verdict/remediation), `replay_query` (sql|full replay),
    `query_audit_logs` (flywheel diagnosis). (5 tools)
  - **semantic server** (`servers/semantic.py`): `update_table_meta`, `save_accumulated_definition`,
    `lookup_terminology`, `suggest_event_yaml`/`approve_event_yaml` (Tier-1 admin via
    `register_admin`). (referenced across composite.py + execution.py)
  - **remaining tool modules:** `tools/preference.py` (`save_user_preference` — Tier-2),
    `tools/flywheel.py` (flywheel diagnose→fix→verify→deploy), `tools/template.py`,
    `tools/prompt.py` (`suggest_prompt_rule`/`approve_prompt_rule` — Tier-1 admin).
  - **eval/obs servers:** eval run/scoring tools; 6 `obs_*` observability tools (read-only
    `var/eval/history.db` mirror).
- **I/O:** MCP tool calls (JSON args) → Contract-typed returns (`QueryDataOutput`/
  `QueryDataPending`/`QueryDataRejection`, `SearchDataSourcesOutput`, `InputRequiredResult`,
  JSON strings). Turn-context echo round-trips via `X-RBI-Turn-Context` header.
- **Deps:** all libs + fastmcp, fastmcp-tasks, pyodps, pandas, pydantic, opentelemetry
  (api/sdk/exporter-otlp-proto-http) (`libs/rbi-mcp/pyproject.toml`).
- **Location:** `libs/rbi-mcp/src/rbi_mcp/servers/composite.py` (`build_composite`),
  `servers/execution.py` (`register` + `query_data` + `evaluate_sql_quality`),
  `servers/retrieval.py` (`register`), `tools/presentation.py` (`register`),
  `tools/audit.py` (`register`), `servers/semantic.py`, `servers/eval.py`, `servers/obs.py`,
  `middleware/scope.py` (`ScopeMiddleware`).
- **Migration note:** INFERENCE — the harness is itself the agent runtime, so rbi-mcp's role
  as "the tool server the agent calls" transforms: each rbi-mcp **tool** becomes a harness
  **tool plugin** (Consumer) in `packages/data/` or similar, registered via `ctx.effect()`.
  The harness already has `packages/mcp/mcp-client` (Client) — if a standalone MCP server is
  still wanted (e.g. for the ODPS heavy stack to run out-of-process), rbi-mcp server stays as
  an MCP server the harness mcp-client connects to (the "rbi-agent talks over MCP HTTP, not
  import" discipline ADR-0028 D3 makes this the natural seam). Mapping:
  - `query_data` + `check_query` → a `packages/query/tool-query/` tool plugin (Consumer of the
    rbi-query capability seam).
  - `search_data_sources` + `load_*` → `packages/retrieval/tool-search/` tool plugins.
  - `present_*` + `compute` + `suggest_followups` → `packages/data-presentation/` tool plugins
    (the harness "tool UI render intent is part of its design" rule, AGENTS.md, fits the
    intent-based `present_table` perfectly).
  - `log_audit` + `replay_query` → `packages/audit/` or compose onto `packages/session-query/`
    (the harness already has session-query + session-log-export).
  - `set_guard_override` + `approve_*` (Tier-1) → harness `interaction/user-approval` +
    `guard/` (approval-gated writes).
  - `ScopeMiddleware` (scope/tenant/session/noninteractive binding) → harness
    `packages/context/` (request-context plugins) + `packages/core/scope`.
  - `TasksExtension` (task=True for long-running `query_data`) → harness
    `packages/workflow/` (worker-thread provider) or `packages/jobs/`.
  - `RequestStateSecurity` (MRTR elicitation encrypt/sign/restore) → harness session/crypto
    infra.
  - OpenTelemetry → harness session telemetry (`packages/session/`).

#### 10. rbi-eval — evaluation engine (pure-Python, no MCP deps)
- **What:** The eval/observability flywheel. Huge: `models/` (eval_case, run_result,
  case_score, coverage_report, weakness_signal, diagnostic_report, health,
  semantic_contract), `runner/` (regression, aggregation, baseline, comparison, lifecycle,
  validation), `scoring/` (judge, l1, match_modes, normalize, statistics, health_check),
  `orchestration/` (run, multi_turn, case_execution, health, diagnostics, template),
  `coverage/` (matrix, metrics, gaps, directives, na_manager), `diagnostics/` (report_builder,
  stability, aggregation, trend, diff, evidence), `synthesis/` (validators, complexity, dedup,
  coverage_gain), `evolution/` (pull, regression_check), `adapters/` (sql_generator, llm, agent,
  sql, verifier, optional), `observability/` (store, metrics, config, health, correlation,
  alerting, trigger, `dashboard_gen.py` + prebuilt/, channels/{webhook,log,protocol}),
  `migration/` (case_migrate), `store/` (case_store, run_store, coverage_store,
  diagnostic_store, lock), `cli/` (main + run/baseline/coverage/diagnose/health/gate/obs/
  dashboard/case cmds), `semantic/reader.py`, `multi_turn/session.py`. CLI:
  `rbi-eval` (`[project.scripts]`). Extras: `runtime` (rbi-query/llm/agent), `cli` (click/tqdm),
  `obs` (watchfiles).
- **I/O:** eval cases (YAML) + adapters (SQL-gen/LLM/agent/verifier) → run results, scores,
  coverage matrices, diagnostic reports, dashboard HTML. Flywheel: diagnose→fix→verify→deploy.
- **Deps:** pydantic, pydantic-settings, pyyaml, sqlglot, rbi-semantic, plotly
  (`libs/rbi-eval/pyproject.toml`). Runtime extra pulls rbi-query/llm/agent.
- **Location:** `libs/rbi-eval/src/rbi_eval/` (90+ files across 13 subpackages).
- **Migration note:** INFERENCE — maps to harness `packages/test-support/` (already has
  `loader-smoke`, `acp-snapshot`, `client-runtime`, `llm-replay`, `llm-mock-server`,
  `agent-loop-testkit`) + a new `packages/eval/` capability. The scoring/judge +
  snapshot/replay discipline matches the harness "keyless snapshot test" policy (AGENTS.md:
  `test:snapshot`, replay on macOS/Linux, fix fixtures not normalizers). The observability
  dashboard (`dashboard_gen.py` prebuilt HTML, no node at runtime) maps to harness
  `packages/host/frontend-static`. The `adapters/` (pluggable SQL-generator/LLM/agent/verifier)
  is a clean seam — each adapter is a Provider. `evolution/` (regression-check before deploy)
  maps to harness `packages/guard/` (loop-hygiene) + CI gates. This is the largest single
  migration unit; likely staged last.

### APPS

#### 11. rbi-web — FastAPI backend + React frontend
- **What:** The web app. FastAPI backend (routers + services) + React 18/Vite 6 frontend.
  Routers (~35): chat, agent_ws (WebSocket), dashboard, audit, semantic, context, dataset,
  eval, retrieval, agent, pipeline, flywheel, evolution, preferences, prompts, tables, golden,
  feedback, verified_answers, drill_suggestions, accumulated_definitions, skills, flows, rag,
  downloads, odps_config, sync, admin, games, auth, ws. Services (~90): connectors
  (`odps_pyodps`, `odps_maxc` — MaxCompute backends), agents (`qodercli_adapter`,
  `rbi_agent_adapter`, `generic_cli_adapter`, `turn_runner`, `session_manager`,
  `context_builder`), harness (`error_classifier`, `tracer`, `self_healer`), evolution
  (`runner`, `scheduler`, `strategy_tracker`, `graduation`, `rule_manager`, `broadcaster`,
  `memory`, `run_context`), flywheel (`runner`, `scheduler`, `liveness`, `rule_hits`),
  delivery (`assembler`, `sanitizer`, `table`), session (`orchestrator`, `event_bus`,
  `state_store`, `sqlite_session_store`, `agent_session_service`), retrieval_kernel,
  context_assembly_service, llm_provider, mcp_gate/agent_mcp_gate, tool_presenter,
  process_manager, etc.
- **I/O:** REST + WebSocket. Chat stream → artifacts (tables/charts/SQL panels).
- **Deps:** all libs (workspace member `apps/rbi-web`).
- **Location:** `apps/rbi-web/src/rbi_web/routers/*.py`, `apps/rbi-web/src/rbi_web/services/*.py`,
  `apps/rbi-web/src/rbi_web/agents/*.py`, `apps/rbi-web/frontend/` (React).
- **Migration note:** INFERENCE — the harness IS the web app now (`apps/web`, `apps/cli` +
  `packages/client/ui-*`). Most rbi-web routers are subsumed by harness client UI packages
  (`ui-conversation`, `ui-trajectory`, `ui-tool`, `ui-deliverables`, `ui-settings-*`,
  `ui-workspace`, `ui-jobs`). The `agents/` adapters (`rbi_agent_adapter`,
  `qodercli_adapter`) become unnecessary — the harness runs its own agent-loop. Domain
  services (evolution/flywheel/delivery/connectors) are the unique value: port as harness
  plugins (`packages/evolution/`, `packages/flywheel/`, `packages/data-delivery/`,
  `packages/odps-connector/`). The ODPS connectors (`odps_pyodps`, `odps_maxc`) feed the
  rbi-query maxcompute Provider. `self_healer`/`error_classifier`/`tracer` (the harness subdir)
  map to harness `packages/guard/` + session telemetry. This is the decomposition boundary,
  not a single plugin.

### TOOLS

#### 12. rbi-tools — eval/dataset/migration toolset
- **What:** Golden set, coverage, synthetic case generation, schema migration. `registry/`
  (`ingest_golden`, `generate_synthetic_cases`, `build_column_profile`,
  `build_fk_cardinality`, `gen_source_caliber`, `gen_fk_cardinality_sql`,
  `gen_column_profile_sql`, `activation_gate`). Plus `pytest_db_guard` (pytest11 entry-point:
  test/prod DB isolation guard), `uvicorn_harness` (shared HTTP test scaffold),
  `event_bootstrap` (xlsx event-definition parser, openpyxl), `audit_eval_corpus`.
- **I/O:** xlsx/golden YAML/SQL → generated eval cases, column profiles, FK cardinality.
- **Deps:** rbi-core, rbi-data, rbi-retrieval, rbi-agent, rbi-eval, sqlglot, pyyaml, openpyxl,
  uvicorn (`tools/rbi-tools/pyproject.toml`).
- **Location:** `tools/rbi-tools/src/rbi_tools/registry/*.py`,
  `src/rbi_tools/pytest_db_guard.py`, `src/rbi_tools/uvicorn_harness.py`.
- **Migration note:** INFERENCE — maps to harness `scripts/` (repo gates/generators) +
  `packages/test-support/`. `pytest_db_guard` is a test-isolation guard → harness test infra.
  `uvicorn_harness` → harness `packages/test-support/client-runtime` (already exists).
  `generate_synthetic_cases`/`build_column_profile` → data-agent dev scripts. Not a runtime
  plugin; dev/test tooling.

### SKILLS

#### 13. reverse-bi-analyze — data analysis behavior skill
- **What:** Agent behavior protocol for a single data-analysis request. 6-step: Understand
  (search_tables→search_events→load definitions) → Confirm (present_options on ambiguity) →
  Plan (set_analysis_context, atomic decomposition) → Execute (SQL conventions, estimate_cost
  → query_data, self-repair ≤2×) → Validate (UV≤DAU, rates∈[0,1], non-empty) → Deliver
  (present_table, suggest_followups, log_audit).
- **I/O:** user data question → structured delivery (business language, never SQL shown).
- **Deps:** MCP tools (search_data_sources, present_clarification, query_data, present_table,
  suggest_followups, log_audit, evaluate_sql_quality); `agent-protocol.md`, `v2-baseline.md`
  prompt (v21), `sql-conventions.md`.
- **Location:** `skills/reverse-bi-analyze/SKILL.md` (frontmatter + 6-step Instructions +
  Rules: "NEVER show SQL", "Honest rejection over approximate", "role_id dedup",
  "partition filter ds BETWEEN").
- **Migration note:** INFERENCE — direct map to harness `packages/skill/` capability (skill
  provider registry + local impl + `tool-skill` catalog/loader). Becomes a harness skill plugin
  (`.agents/skills/reverse-bi-analyze/SKILL.md` in the harness repo, loaded by
  `packages/skill/skill` + `packages/skill/tool-skill`). The tool names in the skill
  (search_tables etc.) must be updated to the migrated harness tool-plugin names. The
  "NEVER show SQL / honest rejection" rules are prompt-level — they become harness
  `packages/core/system-prompt` content + `guard/` enforcement.

#### 14. wiki-refresh — wiki update workflow skill
- **What:** The sole entry point for updating the project wiki (`docs/wiki/`). 3-layer content
  model (L1 auto-extract via `scripts/wiki/extract.py`, L2 agent walk-through of stale modules
  only, L3 manual overview). Stale-detection → incremental walk-through (git diff since
  doc_date) → regenerate (`just wiki`).
- **I/O:** wiki staleness → updated `docs/wiki/modules/<name>.md` + regenerated index.html.
- **Deps:** `scripts/wiki/extract.py`, `just wiki`, git.
- **Location:** `skills/wiki-refresh/SKILL.md` (frontmatter + 5-step flow + hard constraints:
  never hand-edit index.html, never skip stale-detection).
- **Migration note:** INFERENCE — maps to harness skill plugin (`packages/skill/`). This is a
  dev-workflow skill, not a data-agent capability. Port as a harness skill for repo
  documentation hygiene. Low priority for the data-agent migration (it's about maintaining
  reverse-bi's own wiki, which dissolves as capabilities move).

---

## Cross-cutting capabilities (span multiple packages)

- **ODPS/MaxCompute connector** — `rbi-web/services/connectors/odps_pyodps.py` +
  `odps_maxc.py` + `rbi-query/engines/maxcompute/` + `rbi-mcp/credentials.py` (credential
  resolver: DB→config_file→env). INFERENCE → harness `packages/query/` maxcompute Provider +
  `packages/credentials/` (harness already has `credential-reference` capability +
  env/.env provider).
- **Guard Chain** — `rbi-guard` (pure predicates) + `rbi-query/core/guards/` (chain) +
  `rbi-mcp/gate_state.py`/`intent_gate.py`/`quality_gate.py`/`limit_gate.py` (gate state +
  decisions). INFERENCE → harness `packages/guard/` (compose: timeout-policy +
  repeat-tool-reminder + new SQL-guard plugin). The 4-gate decision ledger
  (`gate_blocked`/`gate_passed`) maps to harness `SessionEventMap` typed events.
- **Turn-context / session continuity** — `rbi-mcp/turn_context.py` (load/save,
  `X-RBI-Turn-Context` header, `RequestStateSecurity` for MRTR) + `rbi-agent/core/turn_context.py`
  + `active_turn.py`. INFERENCE → harness `packages/context/` (request-context plugins) +
  `packages/core/session`. The "opaque ids are branded" harness rule replaces rbi's ad-hoc
  turn_context_id.
- **Self-evolution flywheel** — `rbi-mcp/tools/flywheel.py` + `rbi-web/services/flywheel_*` +
  `rbi-eval/evolution/` (diagnose→fix→verify→deploy). INFERENCE → harness
  `packages/guard/` + a new `packages/evolution/` capability (no existing harness analogue).
- **Disambiguation / MRTR** — `rbi-retrieval/matching` (detectors) + `rbi-mcp/disambiguation_mode.py`
  (swappable adjudicator: baseline/signal_llm/pure_llm) + `servers/retrieval.py`
  (`InputRequiredResult`). INFERENCE → harness `packages/interaction/` (ask-user +
  user-approval + user-questions).
