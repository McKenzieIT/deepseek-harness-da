# Reverse BI — Purpose, Architecture, Tech Stack (research note)

> Dimension: reverse-bi purpose, architecture, tech stack; "data agent" as reverse-bi embodies it.
> Method: primary sources only (source code, first-party docs). Citation convention: read tools in this env do not return line numbers, so locators are `path` + `§section` / `:symbol` / `:file` — stable across edits. Inferences labeled INFERENCE.
> Scope: `/Users/mckenzie/workspace/reverse-bi` (referenced as `reverse-bi/` below).

---

## 1. Purpose (one paragraph)

Reverse BI is an **AI-native game data-retrieval (取数) platform** that answers the personalized data questions of game designers (策划) and operators (运营) — the questions the department's standard "forward delivery" dashboards (留存/付费/LTV/漏斗) do not cover — by routing each natural-language question to the best of two data sources: the **general data warehouse** (`dws_{game_id}_*`, pre-aggregated, T+1) or **event-tracking logs** (埋点, `ods_{game_id}_all_view`, ~10-min fresh, maximum granularity). Its differentiator is **precision over coverage/speed** — a "quasi-official data outlet" (准官方数据出口) that prefers fewer, slower answers to wrong ones, enforced by confidence grading + honest rejection (`resources/prompts/v2-baseline.md` §2/§5; `CONTEXT.md` "Reverse BI"/"Honest Rejection"/"System Trust Level"; `README.md` "定位"). It is the "data" end of the tracking-event→data/BI flow: the upstream `tracking-event-ops` sibling workspace (`/Users/mckenzie/workspace/tracking-event-ops/README.md`) owns event-data *quality* (L1-L3 validation, schema lifecycle, anomaly diagnosis), while reverse-bi owns *consumption* (query + deliver) over both raw events and warehouse tables. [INFERENCE: the orchestrator's phrase "upstream repo: track2data" denotes this tracking-event→data/BI flow as a concept, not a single repo named `track2data` — no such repo exists in `/Users/mckenzie/workspace`; the two siblings are `tracking-event-design` (game-specific design corpus, e.g. `X63/`) and `tracking-event-ops` (the validation skill).]

---

## 2. Tech stack

### 2.1 Build / monorepo
- **Python ≥ 3.13**, **uv workspace** monorepo, 12 packages (`pyproject.toml` `[tool.uv.workspace].members`).
- **Justfile** orchestrator (`Justfile`: `dev`, `release-gate`, `serve-smoke`, `test`, `lint`, `check-imports`, `check-mypy`, `generate-openapi`, `generate-types`, `wiki`, `setup`).
- **ruff** (lint, line 120, py313), **mypy** strict ratchet (per-module whitelist, `pyproject.toml` `[[tool.mypy.overrides]]`), **import-linter** (dependency DAG enforcement, ADR-0019 R1-R5), **pytest** + pytest-xdist + pytest-asyncio + pytest-timeout.
- Frontend: **biome** (`apps/rbi-web/frontend`, `biome.json`), **Vitest 2** + **Testing Library** + **Playwright E2E**, **Storybook**.
- `.mise.toml` manages Python/Node versions.

### 2.2 Backend (`apps/rbi-web/src/rbi_web`)
- **FastAPI** + Uvicorn (`main.py`), lifespan-wired (DB init, prompt reconcile, crash recovery, flywheel/evolution schedulers, semantic cache pre-warm, retrieval kernel, two MCP HTTP gates).
- **SQLAlchemy 2.0** (declarative `mapped_column`), **SQLite** (WAL, 35+ tables, FTS5 trigram — ADR-0015), `database.py` + `models.py` (47 KB ORM in `libs/rbi-data`).
- **Pydantic 2** + pydantic-settings (`config.py`, `RbiBaseSettings` — ADR-0014 credential hardening).
- **bcrypt** + Starlette `SessionMiddleware` (24h cookie, `main.py`).
- **GZipMiddleware** (min 1024), **CORSMiddleware**.
- 35 routers (`main.py` `app.include_router` block): auth, chat, dashboard, audit, semantic, tables, prompts, ws, admin, games, odps_config, skills, flows, downloads, feedback, format_templates, sync, agent_ws, agent, suggestions, flywheel, evolution, preferences, pipeline, verified_answers, rag, retrieval, dataset, accumulated_definitions, golden, eval, drill_suggestions, context + two MCP mounts (`/mcp`, `/mcp-agent`).

### 2.3 Data / SQL
- **pyodps ≥ 0.13** (MaxCompute SDK) + **maxc CLI** (domestic + overseas configs, `~/.maxc/config-domestic.yaml` — `CLAUDE.md` "10000251/10000329 语义层丰富").
- **sqlglot ≥ 25.9** (AST validation, hive dialect — `libs/rbi-query/src/rbi_query/engines/maxcompute/conventions.yaml` `sqlglot_dialect: hive`).
- Three engines in `libs/rbi-query/src/rbi_query/engines/{maxcompute,hologres,mysql}/` (each: `executor.py` + `conventions.yaml` + `guards.yaml`); MaxCompute is the only one with real data (`phases.py` `_DEFAULT_ENGINE = "maxcompute"`, comment notes 531 tables 100% maxcompute).

### 2.4 MCP
- **mcp-sdk / FastMCP 4.0.0b1** + **fastmcp-slim 4.0.0b1** (`pyproject.toml` deps).
- Two transports: **stdio** (legacy, cold-start ~9s — `Justfile` `mcp-start` comment) and **Streamable HTTP** (resident, `scripts/mcp_serve.sh`; the production default — `apps/rbi-web/.../rbi_agent_adapter.py` `_build_default_pipeline` wires two HTTP endpoints).
- MCP server package: `libs/rbi-mcp/src/rbi_mcp/` — `tools/` (preference, audit, presentation, flywheel, template, prompt), `servers/` (composite, retrieval, execution, semantic, eval, eval_prompts, eval_errors, obs, obs_errors, query_resume, guard_override), `contracts/` (execution, semantic, retrieval, common, obs, eval), `middleware/` (auth, audit, scope), `cli/` (serve, seed, `__main__`).

### 2.5 Retrieval (hybrid, ADR-0011)
- **rank_bm25** + **sqlite-vec** + **jieba** (中文分词) + **sentence-transformers**.
- Embeddings: **BAAI/bge-m3** (1024-dim) — replaced text2vec-base-chinese-paraphrase (768-dim); cross-encoder **bge-reranker-v2-m3** (`RERANKER_FLOOR=0.2`, `unified_search.py` — `CLAUDE.md` "匹配层评测").
- **RRF** fusion in `libs/rbi-retrieval/src/rbi_retrieval/semantic/unified_search.py`.
- Non-prod guard: `RBI_EMBEDDER=fake` + autouse fixtures (`CLAUDE.md` "非生产环境禁启向量模型").

### 2.6 LLM
- **DashScope provider** (qwen-plus default; `RBI_AGENT_MODEL` env override), OpenAI-compatible HTTP — `libs/rbi-llm/src/rbi_llm/` (protocol + providers/), `apps/rbi-web/.../services/llm_provider.py`, `libs/rbi-agent/src/rbi_agent/core/providers/dashscope.py`.
- Production model: "Peach-07-17-DogFooding" (`README.md` "项目状态"). Prompt version: v31/v32 (`resources/prompts/v2-baseline.md` changelog header).

### 2.7 Frontend (`apps/rbi-web/frontend`)
- **React 18.3** + **TypeScript 5.6 strict** + **Vite 6** (ES2022, manual chunking).
- **Tailwind CSS v4** (CSS-first, OKLCH semantic design tokens) + **shadcn-ui** (New York) + **Radix UI**.
- **Zustand 4.5** (client state) + **TanStack Query 5** (server state).
- **GSAP 3.15** + @gsap/react (ScrollTrigger/Flip/SplitText) + **ECharts 6.1** (echarts-for-react).
- **react-router-dom 6** (lazy loading). 9 pages: `/chat`, `/dashboard`, `/audit`, `/audit/:id`, `/semantic`, `/context`, `/experiment`, `/monitor`, `/dataset`, `/analytics` (`README.md` "功能页面").
- `data-name` is the **sole production locator** for LLM grep / GSAP / test assertions (`CLAUDE.md` "前端元素定位符约定").

### 2.8 openapi.json
- `reverse-bi/openapi.json` (122 KB), FastAPI-generated via `just generate-openapi` (`Justfile`: `cd apps/rbi-web && uv run python -c "from rbi_web.main import app; ... app.openapi()"`).
- Consumed by **Hey API** (`openapi-ts`) to generate TS SDK + types into `apps/rbi-web/frontend/src/client/` (`just generate-types`).
- CI drift gate: `just check-types` regenerates + `git diff --exit-code` (`Justfile`). Note: `check-types` = frontend OpenAPI→TS drift; `check-mypy` = Python types (different concerns, similar names — `Justfile` comment).

### 2.9 Observability
- **OpenTelemetry SDK 1.44.0** + semantic-conventions 0.65b0 + OTLP HTTP exporter (`pyproject.toml` deps). `libs/rbi-mcp/src/rbi_mcp/servers/obs.py` + `obs_errors.py`.

---

## 3. Architecture map (how apps / libs / tools / skills relate)

### 3.1 Workspace layout (`pyproject.toml` `[tool.uv.workspace].members`)
```
libs/   rbi-core, rbi-semantic, rbi-data, rbi-query, rbi-retrieval,
        rbi-guard, rbi-llm, rbi-agent, rbi-mcp, rbi-eval
apps/   rbi-web              (the only app)
tools/  rbi-tools            (workspace member)
```

### 3.2 Per-package responsibility (cited)

| Package | Role | Key files |
|---|---|---|
| `rbi-core` | Pydantic models + enums + `RbiPaths` config. **Leaf** (no internal deps, R2). | `libs/rbi-core/src/rbi_core/models/{semantic,audit,presentation}.py` |
| `rbi-guard` | Generic guardrail pure functions (sqlglot+pydantic only). **Leaf** (ADR-0029 D1 / C7). | `libs/rbi-guard/src/rbi_guard/{business_rules,intent_rules,limit_rules,null_rules,partition_rules,sql_rules,vocabulary,signal}.py` |
| `rbi-llm` | LLM provider abstraction (protocol + providers). **Leaf** (D1 §6). | `libs/rbi-llm/src/rbi_llm/{protocol,config,exceptions,models}.py` + `providers/` |
| `rbi-semantic` | Semantic-layer YAML read/write/validate/sync + `sql_evaluator`. Depends only on rbi-core (R4). | `libs/rbi-semantic/src/rbi_semantic/{index,reader,writer,sync,scope,sql_evaluator}.py` |
| `rbi-data` | SQLAlchemy ORM + unified DB access + registry + audit store. Depends only on rbi-core (R4). | `libs/rbi-data/src/rbi_data/{models.py (47 KB), queries.py (31 KB), registry.py (30 KB), audit.py (39 KB), golden.py, engine.py, steering_store.py, migrations/}` |
| `rbi-retrieval` | Hybrid retrieval (BM25+vec+RRF) + semantic-layer index + embedder + xray. Lib, never imports apps (ADR-0027). | `libs/rbi-retrieval/src/rbi_retrieval/semantic/{unified_search,scoring,index,query_index,pattern_index,embedder,xray,layer,event_view,auto_suggest,retrieval,render_markers,constants}.py` |
| `rbi-query` | SQL execution: scope-aware engine factory + Guard Chain + engines/{maxcompute,hologres,mysql}. Depends up on rbi-guard + rbi-core; never imports rbi-mcp. | `libs/rbi-query/src/rbi_query/{pipeline,registry,conventions,config}.py` + `core/{protocol,failures,orphans,context,exceptions}.py` + `core/guards/{select_only,partition,cost,timeout,ambiguity,adr,retry,required_predicate,_parsing,_outcomes}.py` + `engines/{maxcompute,hologres,mysql}/{executor,conventions.yaml,guards.yaml}` |
| `rbi-agent` | **The data agent.** Phase-gated ReAct pipeline + core loop + MCP HTTP client. **ZERO internal deps** (ADR-0028 D3) — talks to the system only over MCP HTTP; one narrow exception `rbi_agent.** -> rbi_query.conventions` (SQL dialect single source). | `libs/rbi-agent/src/rbi_agent/{factory.py, core/{loop,capabilities,context,active_turn,turn_context,events,session,tool_health,context_overflow,trace}.py, core/providers/{base,dashscope}.py, core/mcp/{client,http_client,server_manager,schema_converter}.py, data_agent/{pipeline,phases,gates,delivery,recovery,rewriter,rewrite_*,presentation,steering,state,state_store,template_cache,learning,metric_grounding,time_resolver,user_facing_text,forced_load,prompt,rewrite_confidence}.py}` |
| `rbi-mcp` | MCP server (top lib layer after ADR-0028 D1 — heavy stack must not leak down, C6). | `libs/rbi-mcp/src/rbi_mcp/{tools/*, servers/*, contracts/*, middleware/{auth,audit,scope}, cli/{serve,seed,__main__}}.py` |
| `rbi-eval` | Eval harness: gate + corpus + rubrics + adapters + multi_turn + evolution + scoring + synthesis + observability + orchestration. May use rbi-core/rbi-semantic; never the evaluated pipeline + heavy stack (D9 R4). | `libs/rbi-eval/src/rbi_eval/{gate,corpus,rubrics,provenance,protocols,settings}.py` + dirs `{adapters,cli,coverage,dashboard,diagnostics,evolution,migration,models,multi_turn,observability,orchestration,runner,scoring,semantic,store,synthesis}/` |
| `rbi-web` (app) | FastAPI backend + React frontend. Top of DAG. 35 routers + `agents/` adapter registry + `services/` (50+ services). | `apps/rbi-web/src/rbi_web/{main,config,database,schemas,cli}.py` + `routers/*.py` (35) + `agents/{interface,registry,qodercli_adapter,rbi_agent_adapter,generic_cli_adapter,session_manager,turn_runner,context_builder}.py` + `services/*.py` (50+) + `frontend/` |
| `rbi-tools` | CI/gate/dataset/build tooling. Never imports apps (R4b); libs never import tooling (R4c). Invoked `python -m rbi_tools.X`. | `tools/rbi-tools/src/rbi_tools/{audit_reachability,audit_tool_contract,audit_lazy_imports,audit_mypy_ratchet,audit_retrieval_gate,audit_wayfinder_traceability,audit_truthy_bound_method,audit_eval_*,enhance_semantic,event_bootstrap,eval_*,review,score_run,wiring_registry (155 KB),...}.py` |

### 3.3 Dependency DAG (ADR-0019 R1-R5 + ADR-0028 + ADR-0029; `pyproject.toml` `[tool.importlinter]`)
- **Leaves** (no internal deps): rbi-core (R2), rbi-guard (C7/ADR-0029 D1), rbi-llm (D1 §6).
- **R4**: rbi-semantic and rbi-data do not import each other; both depend only on rbi-core.
- **rbi-query** → rbi-guard + rbi-core (up); never imports rbi-mcp (unidirectional).
- **rbi-retrieval** → rbi-core; lib, never imports apps (ADR-0027).
- **rbi-agent** → **ZERO internal deps** (ADR-0028 D3); swappable/independently deployable. Sole permanent exception: `rbi_agent.** -> rbi_query.conventions` (submodule-direct only; `rbi_query.conventions` itself imports only pathlib/yaml — safe SQL-dialect single source).
- **rbi-mcp** → top lib layer (ADR-0028 D1); heavy stack (pandas/pyodps/sentence-transformers) must not leak down (C6).
- **rbi-eval** → rbi-core/rbi-semantic only; never the evaluated pipeline + heavy stack (D9 R4).
- **rbi-tools** → tooling; never imports apps (R4b); libs never import tooling (R4c).
- **rbi-web** → top of DAG; may import all libs.

### 3.4 Resources / skills / eval-cases / var / scripts / tests
- `resources/`: `prompts/` (v2-baseline.md canonical + evolution-L1..L6 + flywheel-{diagnose,remediate,verify,deploy} + synthesis-{balanced} + golden-agent + format-context-cards), `semantic-layer/{game_id}/{events,tables,domains,config,terminology}.yaml` (1450 events + 117 tables, 11 domains — `README.md` "语义层"), `agent-protocol.md`, `tool-reference.md`, `steering/`, `pattern_index.db` (SQLite Query Pattern Index), `event_definition/`, `semantic-layer.zip`.
- `skills/`: two project skills for Claude Code — `reverse-bi-analyze`, `wiki-refresh` (invoked via `just wiki`).
- `eval-cases/`: per-game dirs `10000147/ 10000251/ 10000312/ 10000329/ 10000334/` + `_coverage/ _diagnostics/ _runs/ disambiguation/ reuse/` + `_migration_report.md` + `_d2_synthetic_migration_pending.md`.
- `var/`: runtime-mutable (DB + audit + exports, gitignored).
- `scripts/`: `release_gate.sh`, `serve_smoke.sh`, `mcp_serve.sh` (daemon/stop/restart/status/install/connect), `validate_semantic.py`, `validate_events.py`, `eval_*.py`, `wiki/{extract,render}.py`, plus `_verify_*.py` one-offs (archived after use per T8).
- `tests/`: cross-package integration (golden regression + prompt eval), gated by `realmodel` + `integration` markers.

### 3.5 30 ADRs (`docs/adr/`)
0001 independent semantic layer · 0002 assumption-first interaction · 0003 quasi-official trust + self-healing · 0004 atomic query decomposition · 0005 structured audit with self-calibrating classification · 0006 multi-game architecture · 0007 three-stage pipeline with presentation tools · 0008 multi-source warehouse-first resolution · 0009 audit store swappable seam · 0011 hybrid retrieval (BM25+sqlite-vec+RRF) · 0012 query guard chain SQL executor strategy · 0013 converge agent stacks · 0014 credential hardening (BaseSettings) · 0015 FTS5 external content trigram · 0016 phase4 ws-base per-game presentation registry · 0017 SQL guard AST + true timeout · 0018 research-focus-coupled eval corpus · 0019 monorepo package split · 0020 unified query understanding layer · 0021 tier1 direct reuse · 0022 evolution architecture · 0023 MCP stdio transport resilience · 0024 global synonyms resource · 0025 in-band agent steering · 0026 unified conversation kernel · 0027 extract retrieval kernel lib · 0028 tooling layer + MCP lib reclass · 0029 guardrail hardening + tool-contract governance · 0030 eval source convergence + gate ledger.

---

## 4. "Data agent" as reverse-bi realizes it

The "data agent" = `libs/rbi-agent/`, specifically `rbi_agent.data_agent.DataAgentPipeline` (`libs/rbi-agent/src/rbi_agent/data_agent/pipeline.py`; assembled by `libs/rbi-agent/src/rbi_agent/factory.py` `build_data_agent`). It is a **phase-gated ReAct pipeline** that turns a natural-language business question into a verified SQL result delivered through structured presentation tools. The capabilities that make it a *data* agent (vs. a generic LLM agent):

1. **Four-phase pipeline** (`libs/rbi-agent/src/rbi_agent/data_agent/phases.py` `Phase`): `UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION` (ADR-0007). Each phase has a `PhaseConfig` (tools whitelist, output_schema, gate, evaluator, max_attempts, timeout_seconds, fallback_phase).
   - `UNDERSTANDING_TOOLS` = {search_data_sources, load_table_definition, load_event_definition, load_table_dimensions, present_clarification, save_accumulated_definition} ∪ UNIVERSAL_TOOLS.
   - `GENERATION_TOOLS` = {critique_sql_tool, evaluate_sql_quality} ∪ UNIVERSAL.
   - `EXECUTION_TOOLS` = {query_data} ∪ UNIVERSAL.
   - `INTERPRETATION_TOOLS` = {present_decomposition, present_table, compute, record_template_usage, suggest_followups} ∪ UNIVERSAL.
   - `UNIVERSAL_TOOLS` = {lookup_terminology, get_user_preferences, load_accumulated_definition}.
2. **Semantic-layer-grounded, never hardcodes schema**: every FROM/WHERE/field comes from MCP tool returns (`load_event_definition`, `load_table_definition`, `load_table_dimensions`) — `resources/prompts/v2-baseline.md` §1 "load_event_definition". Semantic layer = version-controlled YAML, independent of warehouse metadata (ADR-0001).
3. **Hybrid retrieval over events + tables** (`search_data_sources`): unified index returns ranked `candidates` + `query_matches` (Tier 1 strong / Tier 2 reference / empty) + `verified_hit` + `pattern_cache` + `no_strong_match` signal — `resources/tool-reference.md` "Tool 1".
4. **Confidence-graded routing** (`v2-baseline.md` §2): high → direct answer (§3); mid → clarification (§4); low → honest reject (§5). Precision > coverage.
5. **SQL generation + pre-exec critic** (`critique_sql_tool`): three layers — sqlglot AST clause-level, JSON-path (vs event params_fields), registry-grounded (R1 source caliber / R2 column profile / R3 FK cardinality) — `tool-reference.md` "critique_sql_tool".
6. **Guard Chain** (deterministic, code-layer — `libs/rbi-query/src/rbi_query/core/guards/` + `libs/rbi-guard/`): SELECT-only, partition-required, cost estimation, true-timeout (300s `instance.stop()`), ambiguity, retry, ADR, required-predicate, null/business/limit/intent rules. ADR-0012/0017, ADR-0029.
7. **Atomic decomposition** (ADR-0004): compound questions (≥2 metrics / ≥2 dimension levels / "对比" semantics / fuzzy conclusion words) split into multiple single-metric SQLs; correctness > elegance — `v2-baseline.md` §3 阶段A "复合判断门".
8. **Disambiguation as first-class** (`v2-baseline.md` §4): six-class checklist (A data source / B caliber / C term / D implicit assumption / E content type / F combinatorial), three-layer decision (silent infer ≥0.8 / declare 0.5-0.8 / force confirm <0.8), "confirm-and-persist" via `save_accumulated_definition` (project-level shared, not personal — `CONTEXT.md` "Accumulated Definition").
9. **Honest rejection** (`v2-baseline.md` §5): why/what/how; no degraded/"仅供参考" answers; "答得出但不确定" → reject. Discovery paths (A ask for definition / B broaden search + present_clarification) before true reject — `CONTEXT.md` "Honest Rejection".
10. **Structured delivery via presentation tools only** (`v2-baseline.md` §6): `present_decomposition` (forced first, no exemption) → `present_table` → 【发现】→【注意】→ `suggest_followups` + `log_audit` (terminal). **"Pass intent not data"** (ADR-0029 D6): `query_data` returns `result_id` handle + tiered preview (聚合≤100 rows → full; 明细/large → summary + column quality + 5 sample rows); `present_table`/`compute` take handles, system renders from cache — LLM never copies rows.
11. **Self-improvement loops** (ADR-0022): **Prompt Evolution** (system prompt from production feedback, shadow-then-active gate) + **Golden-Case Corpus Evolution** (high-trust few-shot examples from real journeys, analyst-gated). Both act on different artifacts — `CONTEXT.md` "Self-Improvement".
12. **Query acceleration layer** (Phase 3 maturity, `CONTEXT.md` "Query Acceleration Layer"): materializes topic-level intermediate tables for high-frequency patterns (non-current-day, deterministic). Depends on stable accumulated definitions.
13. **Multi-tenant + multi-game** (ADR-0006): Game = data-config unit (independent event view, dws tables, semantic-layer YAML tree, domains, system prompt, knowledge base, Query Skills); Tenant = access principal (credentials + allowed game IDs + isolated sessions); many-to-many — `CONTEXT.md` "Game"/"Tenant"/"Query Skill".
14. **Audit everything** (`log_audit`, ADR-0005): full pipeline trace (identity/retrieval/confirmation/plan/execution/delivery/escalation_context); server auto-injects log_id/timestamp/session_id/model/auto_tags/preliminary_root_cause/classification_confidence. Self-calibrating root-cause classification (semantic_layer / llm_inference / data_quality / uncertain) — `CONTEXT.md` "Error Root Cause".
15. **Zero internal deps, MCP-HTTP-only** (ADR-0028 D3): swappable/independently deployable; the system (retrieval/execution/semantic tools) is reached exclusively over MCP HTTP, never by import. The adapter (`apps/rbi-web/.../agents/rbi_agent_adapter.py` `_build_default_pipeline`) wires two endpoints: `/mcp-agent` (34 non-retrieval tools, header-scoped) + `/mcp/retrieval` (4 retrieval tools, kernel-backed).

---

## 5. End-to-end request lifecycle

1. **Submit** — user (designer/operator) sends a NL question via frontend chat (REST `/api/chat` or WS `/api/agent`/`agent_ws`) or an external MCP client (QoderWork/Claude Code via `mcp-connect`).
2. **Auth + scope resolve** — `rbi-web` authenticates (SessionMiddleware cookie), resolves tenant + game (scope) from `games` router; persists `ChatSession` (`libs/rbi-data/src/rbi_data/models.py` `ChatSession`/`ChatMessage`).
3. **Adapter build** — `RbiAgentAdapter` (REST) or `RbiAgentTurnRunner` (WS) (`apps/rbi-web/src/rbi_web/agents/rbi_agent_adapter.py`) calls `_build_default_pipeline` → `build_data_agent` (`libs/rbi-agent/src/rbi_agent/factory.py`): wires `DashScopeProvider` (model from `settings.agent_model`, key from `llm_provider.dashscope_api_key`) + two `MCPHttpClient` endpoints (`settings.agent_mcp_url` + `settings.retrieval_mcp_url`) → `tools_dict` (34 + 4 tools) + `tool_schemas` + `ToolHealthTracker` (process-level, service-keyed circuit breaker) + `TemplateShortCircuit` (double-gate: 0.95 + exact params) + `QueryRewriter` (`default_rewriter`) + `AgentStores` (SqliteSessionStore + SqliteStateStore + SqliteLearningStore + SqliteActiveTurnStore, all under `paths.data_dir/agent_state.db`).
4. **`pipeline.run(session_id, message, scope_id, ctx, base_system_prompt=combine_system_prompt(system_prompt, append_system_prompt), scope_name)`** — `libs/rbi-agent/src/rbi_agent/data_agent/pipeline.py`. System prompt assembled by `assemble_system_prompt` (`libs/rbi-agent/src/rbi_agent/data_agent/prompt.py`): base prompt + `_game_context_block` (scope name + ID + active tables/columns + last SQL — T26 name-must-reach-LLm rule) + `_intent_block` (carried metrics/dimensions/time range across scopes) + `_old_game_summary` (previous scope, ≤800 chars) + last 3 turns. SQL dialect conventions injected by `rbi_query.conventions.render_conventions_markdown` per scope engine (`phases.py` `_DEFAULT_ENGINE`).
5. **Phase UNDERSTANDING** (gate `always_pass`, max_attempts 5, timeout 60s, no fallback) — retrieve candidates (`search_data_sources`), load full definitions (`load_event_definition`/`load_table_definition`/`load_table_dimensions` when `dimension_hint`), decompose compound → atomic sub-questions (≤`max_subquestions`=4), run the six-class disambiguation scan (`v2-baseline.md` §4). Confidence-graded route:
   - **High** → proceed to GENERATION.
   - **Mid** → `present_clarification(understood, questions)` → `HALT_TURN` (await user; `disambiguation_timeout_seconds`=300s → degrade to honest_decline). On user answer, confirm-and-persist via `save_accumulated_definition` (first time only; silent reuse after).
   - **Low** → §5 honest reject OR §4 discovery path (A ask for definition / B broaden search + present 1-3 candidates via `present_clarification`). Discovery budget: ≤2 SQL executions; all-draft + top-1 score <0.01 → skip discovery, direct §5.
6. **Phase GENERATION** (gate `sql_syntax_gate` — the **real** gate, not `always_pass`; `factory.py` `default_phase_configs` comment warns this is load-bearing against eval-stricter-than-production inversions; max_attempts 5, timeout 60s, fallback `UNDERSTANDING`) — LLM generates SQL (Tier-1 `query_matches` SQL as context, not reused verbatim); `critique_sql_tool` (sqlglot AST + JSON-path + registry) + `evaluate_sql_quality` (100-score rule deductions). `critique_confidence_floor`=0.6 / `quality_score_floor`=60. severity=clarify → §4; error → fix + re-critique (≤2×); fingerprint gate rejects SQL not re-critiqued after edit.
7. **Phase EXECUTION** (deterministic, not ReAct — RA-F84b; gate `always_pass` (never consulted); max_attempts 1, timeout 120s, fallback `GENERATION` carrying error text) — `query_data(sql, engine="maxcompute")` runs the Guard Chain: SELECT-only → partition-required (`ds` yyyyMMdd) → cost estimation → scan limit → true-timeout (300s `instance.stop()`); AmbiguityGuard refuses until `present_clarification` called. Three return states (`v2-baseline.md` §3 阶段D, `tool-reference.md` "Tool 7"):
   - **Done** → `result_id` + tiered preview (聚合 ≤100 rows → `preview:"full"`; 明细/large → `preview:"summary"` + column_quality + 5 sample rows). `cost_check` ∈ passed/exceeded/unavailable (unavailable = NOT audited, must note in 【注意】).
   - **Still running** (sync 30s patience ≠ timeout) → `instance_id`; call `check_query(instance_id)` ≤3×; still running after 3 → §5 reject + hand `engine_detail_url` to user. **Never re-send the original SQL** (double billing + near-duplicate gate).
   - **Rejected/failed** → `failure_kind` ∈ transient/permission/not_found/syntax/resource/unknown; only transient worth retry. `parse_failed=true` → fix SQL + re-critique. Unrecoverable (TABLE_NOT_FOUND/FIELD_NOT_FOUND/SEMANTIC_MISMATCH/PERMISSION_DENIED) → §5 reject without rewrite.
8. **Phase INTERPRETATION** (gate `always_pass`; max_attempts 5, timeout 60s, no fallback) — LLM delivers via tools only, in strict order (`v2-baseline.md` §6): `present_decomposition` (forced first, no exemption — single metric/digit also) → `present_table` (pass `result_id` + intent: `columns`/`column_types`/`kpi_columns`/`chart`; system computes, LLM never aggregates) → `compute` (comparison/ratio/rank/percentile/custom via pandas on cached result, `result_ids=[本期,上期]` for comparison) → 【发现】text (once) → 【注意】text (once, lists all inference assumptions per "假设标注铁律") → `suggest_followups` + `log_audit` (terminal tools; `record_template_usage` if a `source_type="template"` match was used). Output purity rules: no `**`, no process narration, no SQL display, thousands separator, no half-confirmation. Anomaly detection auto-runs after `present_table` (no tool call).
9. **Event stream + audit** — throughout, `TurnContext` emits events (`TURN_START`, `PHASE_START`/`PHASE_END`, `TOOL_INVOKE`/`TOOL_RESULT`, `GATE_CHECK`, `RETRY`, `CLARIFICATION`, `DECOMPOSITION`, `HONEST_DECLINE`, `REWRITE_CONFIRM`, `TEMPLATE_HIT`, `TEXT`, `TURN_COMPLETE` — `libs/rbi-agent/src/rbi_agent/core/events.py`). The adapter `_bridge` loop maps events → WS frames (`agent_event_to_ws_frames`) / REST `TaskEvent`s; `AgentAuditSink` observes all events and **unconditionally** flushes one audit row in the turn `finally` (P2-1 structural guarantee — covers turns that exit before `log_audit`, tagged `audit_gap`). `record_rule_exposures` counts flywheel rule hits in the actual injected prompt (string-contains, not LLM self-report).
10. **Budgets + watchdog** — `PipelineConfig` (`phases.py`): `max_fallbacks`=2, `max_subquestions`=4, `max_executions_per_turn`=8 (aligns qodercli `MAX_SQL_PER_TURN`, includes failures — cost explosion guard), `max_llm_calls_per_turn`=60 (= 3× `DEFAULT_MAX_STEPS`(20), test-pinned; ≈19% of theoretical 320 ceiling), `max_state_turns`=20 (sliding window). `_watch_for_stall` (300s no events, **excludes `ctx.awaiting_input`** so user thinking never false-fires) cancels turn + sends retryable `stall_timeout` frame.
11. **Crash recovery** — startup `lifespan` (`main.py`): `process_manager.repair_interrupted_streaming_states` + `AgentSessionService.fail_dangling_tasks` (RA-F130: mark pending/running as failed + tell user to re-ask — **never auto-replay**, `query_data` is non-idempotent and costs money) + `recover_interrupted_agent_sessions` (rbi-agent track: notify interrupted sessions; `SqliteActiveTurnStore` snapshots in-progress turn progress so a crash can surface work already paid for — still no replay).
12. **Self-improvement off-ramps** — `FlywheelScheduler` + `EvolutionScheduler` (started in `lifespan`) pick up audit rows: Prompt Evolution (diagnose → remediate → verify → deploy, shadow-then-active gate via `resources/prompts/evolution-L{1..6}-*.md` + `flywheel-*.md`) and Golden-Case Corpus Evolution (candidate harvest → analyst gate → corpus). Query Pattern Index (`resources/pattern_index.db`) learns: >0.7 confidence → fast-path recommendation; <0.3 → auto-evicted.

---

## 6. Sibling tracking-event context (track2data flow)

[INFERENCE] The orchestrator's "upstream repo: track2data" denotes the tracking-event→data/BI **flow**, not a single repo. The two sibling workspaces partition that flow:
- **`/Users/mckenzie/workspace/tracking-event-ops`** (`README.md`) — "埋点数据智能运维" skill: L1-L3 event-data validation (existence → field completeness → value correctness), schema lifecycle (create/evolve/validate), knowledge-driven anomaly diagnosis, cross-game portfolio monitoring. Auto-discovers data source with degradation (Stat table → ODS direct → local cache → CSV → JSON). Python ≥3.9, PyYAML/Jinja2/maxc CLI. Owns event-data **quality**.
- **`/Users/mckenzie/workspace/tracking-event-design`** — contains only `X63/` (a game-specific event-design corpus); no README. [INFERENCE] design-time event specifications feed into `tracking-event-ops` validation schemas and into reverse-bi's `resources/semantic-layer/{game_id}/events/` YAML (reverse-bi's `scripts/event_bootstrap.py` / `tools/rbi-tools/.../event_bootstrap.py` parses埋点 definitions — `pyproject.toml` dev dep comment on `openpyxl`).
- **reverse-bi** owns the **consumption** end: it reads both raw events (`ods_{game_id}_all_view`, ~10-min fresh) and warehouse tables (`dws_{game_id}_*`, T+1) and delivers取数 answers. The "track2data" arc = SDK emits tracking events → `tracking-event-ops` validates → warehouse ETL builds `dws_*` → reverse-bi queries both to answer business questions. reverse-bi's Query Acceleration Layer (Phase 3) closes a loop back into the warehouse by materializing intermediate tables for high-frequency patterns.

---

## 7. Open questions (for migration target: deepseek-harness-data-agent)

- The target harness `deepseek-harness-da` is a **plugin-based agent harness, fork of deepseek-ai/deepseek-harness** (per the orchestrator's brief). reverse-bi's `rbi-agent` is **not** plugin-based in the harness sense — it's a phase-gated ReAct pipeline with a tool whitelist per phase, and the MCP server (`rbi-mcp`) is a modular tool registry (`tools/` + `servers/` + `contracts/`). The migration must decide: does "plugin" in the target = reverse-bi's **MCP tool** granularity, its **engine** granularity (`rbi-query/engines/{maxcompute,hologres,mysql}/`), its **semantic-layer domain** granularity, or something else? [INFERENCE: the most natural mapping is MCP-tool-as-plugin, since `rbi-mcp/contracts/` already separates tool contracts by concern (execution/semantic/retrieval/obs/eval/common).]
- reverse-bi's `rbi-agent` has **zero internal deps by design** (ADR-0028 D3) — it talks to the system only over MCP HTTP. A plugin-based harness that imports plugins in-process would violate this contract. The migration must either preserve the MCP-HTTP boundary (keep `rbi-agent` as an external client) or explicitly re-architect the boundary (and re-establish the ADR-0028 D3 invariants another way).
- The "harness features a data agent doesn't need" to remove are not yet enumerated by the orchestrator. reverse-bi's harness surface includes: Prompt Evolution engine, Golden-Case Corpus Evolution, Flywheel scheduler, Query Acceleration Layer, multi-turn session/state/learning stores, evolution/flywheel schedulers, 9 frontend pages. Which of these are "harness" vs. "data agent" is a scoping decision the orchestrator must make. [INFERENCE: the core data-agent loop = phases.py four-phase pipeline + factory.build_data_agent + the v2-baseline prompt + the MCP tool set; everything else (evolution, flywheel, acceleration, frontend) is harness/UX that could be trimmed.]
- The SQL dialect single-source (`rbi_query.conventions` + per-engine `conventions.yaml`) is reverse-bi's mechanism for engine portability. If the target wants non-MaxCompute engines, this is the migration seam; if not, it can be simplified.
- reverse-bi's "data agent" is deeply coupled to the **MaxCompute/ODPS** data backend (pyodps, maxc CLI, `ods_*_all_view`, `dws_*`). A general "data agent" on a different backend would need a new `rbi-query` engine + new `conventions.yaml` + new semantic-layer YAML for that backend's tables.
