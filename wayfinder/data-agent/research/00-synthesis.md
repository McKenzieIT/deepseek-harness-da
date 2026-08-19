# Synthesis — Merging `reverse-bi` into `deepseek-harness-da` as `deepseek-harness-data-agent`

> Wayfinder synthesis note. Builds on 5 research notes (cited as `N1`–`N5`):
> - N1 `rbi-purpose-arch.md` — reverse-bi purpose, architecture, "data agent" definition, lifecycle.
> - N2 `rbi-capability-inventory.md` — 14 reverse-bi capabilities + plugin-migration note each.
> - N3 `rbi-data-behaviors-api.md` — data behaviors, API surface (79 paths/26 groups), connectors, query pipeline, rendering, eval harness.
> - N4 `harness-plugin-model.md` — harness plugin model (Service Definition/Provider/Consumer trio), extension-point catalog, composition/bundle/preset, how to add a capability.
> - N5 `harness-package-removal.md` — harness package inventory, essential/maybe/unnecessary categorization, phased removal plan.
>
> Each restatement of a note's claim cites `N#` + the note's own locator. Deductions are labelled `INFERENCE`. The 5 notes' file:line citations are inherited through the `N#` references; not re-spelled here except where load-bearing.

---

## (A) CROSS-MAP TABLE — every reverse-bi capability → harness target

Priority legend: **P0** foundation (port first, everything depends on it) / **P1** core capability (a data-agent can't function without it) / **P2** orchestration (the four-phase pipeline + behavior) / **P3** eval (acceptance gate) / **P4** trim (do not port; retire/disable).

### A.1 The 14 discrete capabilities (from N2) + the behavioral layer (from N3)

| # | reverse-bi capability | Harness target (new package group + seam role) | Migration notes | Priority |
|---|---|---|---|---|
| 1 | **rbi-core** — Pydantic models/enums/`RbiPaths` config (leaf, R2) | `packages/data/data-types/` shared-types package (NOT a seam — typed vocab); also feed `packages/util/brand` (Branded ids) + `packages/core/scope` | These are shared types, not a standalone plugin. Port `RbiPaths`/config into a `packages/data/` shared-types package. Low blast radius; port first. (N2 cap 1, INFERENCE) | **P0** |
| 2 | **rbi-guard** — SQL-judgment pure functions: `null_rules`, `limit_rules`, `partition_rules`, `business_rules`, `intent_rules`, `sql_rules`, `vocabulary`, `signal` (leaf, C7/ADR-0029 D1) | **Definition+hook**: a new `packages/query/query-guard/` Service Definition (the `GateSignal`/`Verdict` vocab) + a `guard`-seam hook plugin composing onto harness `packages/guard/` | Pure functions, leaf purity makes it ideal first port. `GateSignal` becomes a typed event in harness `SessionEventMap`. Composes with `rbi-query` Guard Chain (cap 4). (N2 cap 2, INFERENCE) | **P0** |
| 3 | **rbi-llm** — LLM Provider Protocol + `dashscope`/`fake`/`openai` impls (leaf, D1 §6) | **Provider**: new `packages/llm/llm-dashscope/` Provider on the existing harness `ctx.llm` seam (Service Definition `packages/llm/llm` already exists, N4 §2.1). `fake` record-replay → `packages/test-support/llm-replay` (already exists) | The `rbi_agent.core.providers.base` Protocol (Message/ToolSchema/ToolCall/LLMResponse) is a near-duplicate of the harness LLM seam — **adopt harness types, retire rbi's**. **RESEARCH TICKET**: does the harness LLM seam carry `reasoning_content` + streaming + tool_calls natively for DashScope? (N2 cap 3, N1 §2.6, INFERENCE; see Frontier Q6) | **P0** |
| 4 | **rbi-query** — multi-engine SQL executor + Guard Chain + dialect conventions | **Capability seam** (trio): `packages/query/query/` (Service Definition = `QueryEngine` protocol + `QueryOutcome` 3-state contract) + `packages/query/query-maxcompute/` (Provider) + `packages/query/tool-query/` (Consumer = `query_data`/`check_query` tool plugin). Plus `packages/query/query-guard/` (the Guard Chain composes cap 2) | Hardest port = MaxCompute (3-tier creds, per-scope cache, 30s patience, 3-state `QueryOutcome`, server-side cancel `instance.stop()`, per-query executor for cancel correctness C4 bug, `scope_id` must be explicit — `run_query_async` does NOT read ContextVars, N3 §6.2). `conventions.py` is already isolated (imports only pathlib/yaml) — cleanest seam for dialect config; the ONE rbi-agent-visible symbol (`render_conventions_markdown`). `run_query_async` is async-only (D2 ③) — fits harness async tool model. Engine registry's `verify_capability_claims` is a harness-idiomatic "misconfiguration fails loud" pattern. (N2 cap 4, N3 §2-3, INFERENCE) | **P1** |
| 5 | **rbi-semantic** — version-controlled YAML semantic layer (events/tables/domains) reader/writer/index/scope/sql_evaluator | **Provider** on `ctx.storage` (harness `storage-json`-style) OR a new `packages/semantic-layer/` domain package. `scope.py` (per-game) → `packages/core/scope`. Admin write tools (`register_admin` in `servers/semantic.py`) → harness `interaction/` (Tier-1 approval-gated) | YAML store = `storage-json`-style provider; reader/writer = capability seam (Service Definition = semantic-layer read/write; Provider = local YAML filesystem). Version-controlled YAML philosophy (ADR-0001) fits harness "source plane vs artifact plane" rule. (N2 cap 5, INFERENCE) | **P1** |
| 6 | **rbi-data** — SQLAlchemy 2 ORM + engine/session factory + audit store (35+ tables, FTS5 trigram) + `classify_root_cause` | **Provider** on `ctx.storage` (`storage-sqlite` exists, N4 §2.1) + a `packages/data/data-store/` domain package for ORM + audit. `classify_root_cause` (audit root-cause classifier) = domain logic in the data-agent storage plugin. `pytest_db_guard` → test-support util | Harness already uses monotonic `SCHEMA_VERSION` (pre-release stance) — rbi-data's migrations align. `engine.py`/`get_db`/`get_session_factory` exports map onto a storage Provider's lifecycle. (N2 cap 6, INFERENCE) | **P1** |
| 7 | **rbi-retrieval** — hybrid retrieval kernel (BM25+jieba + sqlite-vec + RRF, ADR-0011/0027; nDCG@10=0.816) | **Capability seam** (trio): `packages/retrieval/retrieval/` (Service Definition) + `packages/retrieval/retrieval-hybrid/` (Provider = BM25+vec engine) + `packages/retrieval/tool-search/` (Consumer = `search_data_sources`/`load_*` tools) | Heavy deps (sentence-transformers ~2.3GB bge-m3) **must stay in the Provider**, not leak down (mirrors C6 "base libs never import rbi-mcp" → harness "no hardcoded tunables in plugins", deployment-varying config in `cordis.yml`). `realmodel` test marker + `RBI_ALLOW_REAL_MODEL=1` gate → harness `test:coverage`/`test:e2e` keyless distinction. Disambiguation detectors + MRTR `InputRequiredResult` elicitation → harness `interaction/` (ask-user) + `present_clarification` HALT = `interaction/user-approval` + `guard` composition. (N2 cap 7, N3 §3b, INFERENCE) | **P1** |
| 8a | **rbi-agent `core/`** — generic ReAct loop (`AgentLoop`, `ToolHealthTracker`, `TurnBudget`, `MCPHttpClient`, `SessionStore`, `TurnContext`, `events.py`) | **REDUNDANT — retire.** Harness already owns `packages/core/agent-loop` (the product API spine), `packages/core/session`, `packages/mcp/mcp-client`, `packages/llm/`, `packages/compaction/`. Adopt harness equivalents; retire rbi's. | `tool_health.py` circuit-breaker → harness `packages/guard/` (loop-hygiene + tool-timeout). `context_overflow.py` observer → `packages/compaction/`. `events.py` AgentEvent taxonomy → harness `SessionEventMap` (typed events, declaration merging). `TurnBudget`/`ToolResultCache` per-turn isolation → harness session-scoped state ("opaque ids are branded" + "model-visible ⟺ logged" invariants). (N2 cap 8, N1 §3.2, INFERENCE) | **P4** trim |
| 8b | **rbi-agent `data_agent/`** — four-phase pipeline (`pipeline.py`/`phases.py`/`gates.py`), `factory.build_data_agent`, `forced_load`, `metric_grounding`, `time_resolver`, `rewriter`/`rewrite_*`, `recovery`, `delivery`, `presentation`, `prompt.py`, `template_cache`, `learning`, `state`/`state_store` | **Preset + Skill + phase-gate plugin**: `packages/preset/data-agent/` agent-preset composition (per-session `agent.cordis.yml`); `packages/skill/reverse-bi-analyze/` skill plugin (the behavior); a new `packages/data-agent/phase-gate/` hook plugin enforcing per-phase tool whitelists via `tools/pre-execute` | The unique domain value. Four-phase pipeline (UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION) + per-phase tool whitelists (`PhaseConfig.tools` frozensets) + `PipelineConfig` budgets (`max_llm_calls_per_turn=60`, `max_executions_per_turn=8`, `max_subquestions=4`, `critique_confidence_floor=0.6`, `quality_score_floor=60`, `max_fallbacks=2`, `disambiguation_timeout_seconds=300`, `max_state_turns=20`) + `factory.build_data_agent` + v2-baseline prompt + honest-rejection (`【未完成】`/HONEST_DECLINE). **RESEARCH TICKET**: does the harness agent-loop support per-phase tool whitelists natively? If not, add the `phase-gate` plugin. (N1 §4, N2 cap 8, N3 §3a, INFERENCE; see Frontier Q7) | **P2** |
| 9 | **rbi-mcp** — FastMCP 4 composite server (55 tools; 33 data tools on the agent gate). `servers/` (execution/semantic/retrieval/eval/obs/…), `tools/` (presentation/audit/flywheel/preference/template/prompt), `middleware/` (auth/audit/scope), `contracts/` | **Split**: (a) heavy-lifting tools (`query_data`, `check_query`, `search_data_sources`, `load_*`, `log_audit`, `save_accumulated_definition`, Tier-1 admin `approve_*`/`set_guard_override`) → keep as an **external MCP server** the harness `packages/mcp/mcp-client` connects to (preserves ADR-0028 D3 zero-internal-deps for the heavy ODPS/embedder stack). (b) lightweight orchestration tools (`present_table`, `present_decomposition`, `present_clarification`, `compute`, `suggest_followups`, `critique_sql_tool`, `evaluate_sql_quality`, `get_user_preferences`) → **in-process harness Consumer plugins** so they can access the in-process result-cache + session context directly. `ScopeMiddleware` → `packages/context/` + `packages/core/scope`. `TasksExtension` (task=True for long-running `query_data`) → `packages/jobs/`. `RequestStateSecurity` (MRTR encrypt/sign/restore) → harness session/crypto. OpenTelemetry → `packages/session/session-telemetry`. | The harness IS the agent runtime, so rbi-mcp's role transforms: each rbi-mcp **tool** becomes a harness **tool plugin** (Consumer) OR stays as an MCP-server tool the mcp-client proxies. The split in (a)/(b) is the MCP-HTTP boundary decision (see Frontier Q1). The result-cache + view-materialization layer is a NEW in-process harness capability (`packages/data/result-cache/`) — `query_data` writes, `present_table`/`compute` read by `result_id` handle. (N2 cap 9, N3 §3e/3f/§4, INFERENCE) | **P1** (heavy) / **P2** (orchestration tools) |
| 10 | **rbi-eval** — eval engine: 3-level scoring (L1 deterministic 7 assertions / L2 LLM judge 4 dims / L3 judge agent 5 steps), 5 match modes, 2 eval layers, disambiguation/reuse ground-truth, `EvalCase` schema v3, observability dashboard | **Capability seam**: `packages/eval/eval/` (Service Definition = eval run/scoring contract) + `packages/eval/eval-rbi/` (Provider = the rbi-eval scorer ported) + `packages/eval/tool-eval/` (Consumer = run-eval tool) + `packages/test-support/` extensions (`llm-replay`, `acp-snapshot`, `agent-loop-testkit` already exist, N4) | Largest single migration unit; staged last. `adapters/` (pluggable SQL-generator/LLM/agent/verifier) is a clean seam — each adapter is a Provider. `evolution/` (regression-check before deploy) → `packages/guard/` + CI gates. Observability dashboard (`dashboard_gen.py` prebuilt HTML, no node at runtime) → `packages/host/frontend-static` (if web GUI kept) or stays headless. **The `EvalCase` schema v3 is the contract a migrated plugin must satisfy.** Without the eval harness, precision claims are unverifiable — it is the acceptance gate. (N2 cap 10, N3 §5, INFERENCE) | **P3** |
| 11 | **rbi-web** — FastAPI backend (35 routers, ~90 services) + React 18 frontend (9 pages) | **REPLACED by harness `apps/web`/`apps/cli` + `packages/client/ui-*`** (P4 trim). Domain services (evolution/flywheel/delivery/connectors) are the unique value: port as harness plugins (`packages/evolution/`, `packages/flywheel/`, `packages/data-delivery/`, `packages/query/query-maxcompute/`) | Most rbi-web routers are subsumed by harness client UI packages (`ui-conversation`, `ui-trajectory`, `ui-tool`, `ui-deliverables`, `ui-settings-*`, `ui-workspace`, `ui-jobs`). The `agents/` adapters (`rbi_agent_adapter`, `qodercli_adapter`) become unnecessary — the harness runs its own agent-loop. `self_healer`/`error_classifier`/`tracer` → `packages/guard/` + session telemetry. ODPS connectors (`odps_pyodps`, `odps_maxc`) feed the `query-maxcompute` Provider. (N2 cap 11, INFERENCE) | **P4** trim (frontend) / **P1** (ODPS connector services → Provider) |
| 12 | **rbi-tools** — golden set, coverage, synthetic case generation, schema migration, `pytest_db_guard`, `uvicorn_harness`, `event_bootstrap` | `scripts/` (repo gates/generators) + `packages/test-support/` | `pytest_db_guard` → test-isolation guard. `uvicorn_harness` → `packages/test-support/client-runtime` (exists). `generate_synthetic_cases`/`build_column_profile` → data-agent dev scripts. Not a runtime plugin; dev/test tooling. (N2 cap 12, INFERENCE) | **P3** |
| 13 | **reverse-bi-analyze** — 6-step data-analysis behavior skill (Understand→Confirm→Plan→Execute→Validate→Deliver); "NEVER show SQL", "Honest rejection over approximate" | **Skill plugin**: `packages/skill/` (skill provider registry + local impl + `tool-skill` catalog/loader). Becomes `.agents/skills/reverse-bi-analyze/SKILL.md` in the harness repo | Tool names in the skill must be updated to migrated harness tool-plugin names. "NEVER show SQL / honest rejection" rules → `packages/core/system-prompt` content + `guard/` enforcement. (N2 cap 13, INFERENCE) | **P2** |
| 14 | **wiki-refresh** — 3-layer wiki update workflow skill | **Skill plugin** (`packages/skill/`) | Dev-workflow skill, not a data-agent capability. Low priority for the data-agent migration (it's about maintaining reverse-bi's own wiki, which dissolves as capabilities move). (N2 cap 14, INFERENCE) | **P4** trim |

### A.2 Cross-cutting capabilities (span multiple packages; from N2 + N3)

| Cross-cutter | Harness target | Priority |
|---|---|---|
| **MaxCompute connector** (3-tier creds, per-scope cache, `PATIENCE_SECONDS=30`, 3-state `QueryOutcome`, server-side `instance.stop()`, per-query executor for cancel correctness C4, `scope_id` explicit) | `packages/query/query-maxcompute/` Provider + `packages/credentials/` (already has `credential-reference` + env/.env provider) | **P1** (hardest port) |
| **Guard Chain** (SelectOnly fail-closed / RequiredPredicate(ds) / CostGuard / TimeoutGuard sole-authority `instance.stop()` / RetryGuard transient-only / AmbiguityGuard / ADR / critique_sql_tool confidence≥0.6 / evaluate_sql_quality ≥60) | `packages/query/query-guard/` (Definition + hook) composing onto `packages/guard/` via `tools/pre-execute` + `ctx.tools.guard()` (monotonic deny). 4-gate decision ledger → `SessionEventMap` typed events. | **P1** |
| **Result rendering / intent-passing** (ADR-0029 D6: `present_table` takes `result_id` + sort/kpi/chart intent; system renders from cache; LLM never copies rows) | **NEW in-process capability**: `packages/data/result-cache/` Service Definition (result_id handle → cached rows + tiered preview) + `packages/data/view-materialization/` (renders `present_table`/`compute` intent) + `packages/data/tool-presentation/` Consumers | **P1** |
| **Honest-rejection** (clarify/reject/degrade + `HALT_TURN` + `【未完成】`/HONEST_DECLINE; first-class eval `behavior` field, not a fallback) | **First-class turn outcome** in `packages/data-agent/phase-gate/` + `packages/interaction/` (ask-user + user-approval) + `packages/core/system-prompt` (the v2-baseline §5 honest-reject rules). Must be modeled as a first-class turn outcome in `SessionEventMap`, not a fallback path. | **P2** |
| **Turn-context / session continuity** (`X-RBI-Turn-Context` header, `RequestStateSecurity` MRTR, `active_turn.py`) | `packages/context/` (request-context plugins) + `packages/core/session`. "Opaque ids are branded" harness rule replaces rbi's ad-hoc `turn_context_id`. | **P0** (harness already owns session) |
| **Disambiguation / MRTR** (detectors in `rbi-retrieval/matching`; swappable adjudicator baseline/signal_llm/pure_llm; `InputRequiredResult`) | `packages/interaction/` (ask-user + user-questions + user-approval). `present_clarification` HALT = `interaction/user-approval` + `guard` composition. | **P1** |
| **Self-evolution flywheel** (Prompt Evolution + Golden-Case Corpus Evolution; `flywheel-*.md` + `evolution-L1..L6`; `EvolutionScheduler`/`FlywheelScheduler` in lifespan) | **TRIMMABLE** (P4). If wanted later: new `packages/evolution/` capability (no existing harness analogue). Not needed for a minimal data-agent. | **P4** trim |
| **Query Acceleration Layer** (Phase 3 maturity; materializes topic-level intermediate tables for high-frequency patterns) | **TRIMMABLE** (P4). Depends on stable accumulated definitions. Not needed for minimal data-agent. | **P4** trim |
| **9 frontend pages** (`/chat`, `/dashboard`, `/audit`, `/semantic`, `/context`, `/experiment`, `/monitor`, `/dataset`, `/analytics`) | **TRIMMABLE** (P4). Subsumed by harness `packages/client/ui-*` if a GUI is wanted at all; the data-agent is headless-first. | **P4** trim |
| **prompts/format-templates/flows/context versioning superstructure** (activate/rollback, fragment assembly, Flow runner) | **TRIMMABLE** (P4). Maturity-stage optimizations; the harness `system-prompt/assemble` + `agent-presets` cover the minimal need. | **P4** trim |
| **Multi-tenant + multi-game** (Game = data-config unit; Tenant = access principal; many-to-many) | `packages/core/scope` (per-game scope) + `packages/identity/` (tenant principal). The harness `ctx.storageDomain` can carry per-scope state. | **P1** |
| **Audit everything** (`log_audit` terminal tool; full pipeline trace; self-calibrating root-cause classification) | `packages/data/data-store/` (audit store Provider) + `packages/audit/tool-audit/` Consumer + `session-telemetry` for the trace. `classify_root_cause` → domain logic in the data-agent storage plugin. | **P1** |
| **Crash recovery** (`repair_interrupted_streaming_states`, `fail_dangling_tasks`, `recover_interrupted_agent_sessions`; never auto-replay — `query_data` non-idempotent + costs money) | `packages/session/` (harness session lifecycle) + a `guard/` rule that flags non-idempotent tools. The "never auto-replay" invariant is a `tools/post-execute` hook on `query_data`. | **P1** |
| **OpenTelemetry observability** (OTLP HTTP exporter; `obs_*` 6 tools read-only mirror of `var/eval/history.db`) | `packages/session/session-telemetry` (exists, disabled by default `mode: DISABLED` per N5). Eval observability → `packages/eval/` sidecar. | **P1** (session) / **P3** (eval) |

---

## (B) EARLY-STAGE MIGRATION SEQUENCING

### Phase 0 — Scaffold + boundary decision (weeks 1-2)
**Deliverables:**
- A `dsh-data-agent` bundle package (`packages/bundle/data-agent/`) with a `cordis.patch.yml` that layers over `dsh-base` + `dsh-headless` (and the `agent-spine-demo` spine). The patch inserts data-capability rows and `disabled: true`s unwanted harness rows (the R4 lever, N4 §4.3, N5).
- A new `packages/data/` package group (workspace tsconfig reference entry; `@deepseek-ai/dsh-*` wildcard in `tsconfig.base.json` per N4 §1.4).
- A `packages/data/data-types/` shared-types package (port of rbi-core's Pydantic vocab → TS types; N2 cap 1).
- **DECIDE the MCP-HTTP boundary** (Frontier Q1): which rbi-mcp tools stay external (heavy stack) vs port in-process (lightweight orchestration). This decision is load-bearing for every subsequent phase's topology.
- A `packages/data-agent/phase-gate/` stub (the per-phase tool-gating plugin, if the harness doesn't natively support `PhaseConfig.tools` whitelists — Frontier Q7).

**Dependencies:** None (greenfield scaffold over the existing harness).

**BLOCKED on grilling decisions:**
- **Q1 (MCP-HTTP boundary)** — blocks Phase 1 package topology (does `rbi-agent core/` retire? does `rbi-mcp` stay external?), the result-cache design, and whether the heavy ODPS stack is in-process or external.
- **Q4 (data-agent-as-product vs bundle/preset profile)** — blocks whether we fork the repo or compose over `dsh-base`. INFERENCE recommendation: bundle/preset profile (no code forks; preserves upgrade path).

### Phase 1 — Port foundational leaves (weeks 2-4)
**Deliverables:**
- `packages/llm/llm-dashscope/` — DashScope Provider on `ctx.llm` (N2 cap 3; N1 §2.6). Adopt harness LLM types; retire rbi's `core/providers/base.py` Protocol. **RESEARCH TICKET**: confirm the harness LLM seam carries `reasoning_content` + streaming + tool_calls (Frontier Q6).
- `packages/query/query-guard/` — Service Definition for the `GateSignal`/`Verdict` vocab + the pure-function guardrail predicates (N2 cap 2). Leaf purity → port first among the data capabilities.
- `packages/credentials/` extensions — 3-tier credential resolution (DB→config_file→env) for MaxCompute (N2 cap 4 cross-cutter; N3 §2b). The harness already has `credential-reference` + env/.env provider (N5); extend with the `odps_configs` DB-backed resolver as a new Provider.
- Retire `rbi-agent core/` — adopt `packages/core/agent-loop`, `packages/core/session`, `packages/mcp/mcp-client`, `packages/llm/`. (N2 cap 8a; P4.)
- A `packages/data/result-cache/` Service Definition stub (the result_id→rows cache that `present_table`/`compute` will read from).

**Dependencies:** Phase 0 scaffold + boundary decision.

**BLOCKED on:**
- **Q6 (DashScope LLM seam compatibility)** — blocks the `llm-dashscope` Provider. If the harness LLM seam doesn't carry `reasoning_content`/streaming/tool_calls natively, either extend the seam (research) or add an `LlmAdapter` subclass (`registerAdapter`, N4 §2.3).
- **Q1 (MCP-HTTP boundary)** — blocks whether the MaxCompute connector is an in-process Provider or an external MCP server the mcp-client connects to.

### Phase 2 — Capability seams (weeks 4-8)
**Deliverables (each is a Service Definition/Provider/Consumer trio, N4 §3):**
- `packages/query/query/` (Definition) + `packages/query/query-maxcompute/` (Provider) + `packages/query/tool-query/` (Consumer = `query_data`/`check_query`). The Guard Chain composes the Phase 1 `query-guard`. `conventions.py` (the sole rbi-agent-visible symbol, N1 §3.3) becomes a dialect-config Provider. (N2 cap 4; N3 §2-3.)
- `packages/semantic-layer/` (Provider on `ctx.storage`) — the YAML semantic-layer reader/writer (N2 cap 5).
- `packages/data/data-store/` (Provider on `ctx.storage`-sqlite) — the ORM + audit store (N2 cap 6).
- `packages/retrieval/retrieval/` (Definition) + `packages/retrieval/retrieval-hybrid/` (Provider = BM25+jieba+sqlite-vec+RRF; heavy bge-m3 model stays in the Provider) + `packages/retrieval/tool-search/` (Consumer = `search_data_sources`/`load_*`). (N2 cap 7; N3 §3b.)
- `packages/data/tool-presentation/` Consumers — `present_table`/`present_decomposition`/`present_clarification`/`compute`/`suggest_followups` (in-process so they read the result-cache directly; intent-passing per ADR-0029 D6). (N3 §4.)
- `packages/data/tool-audit/` Consumer — `log_audit` (terminal tool; auto-injects log_id/timestamp/session_id/model). (N3 §4.)
- `packages/data/tool-critique/` Consumers — `critique_sql_tool` (sqlglot AST + JSON-path + registry grounding, confidence≥0.6) + `evaluate_sql_quality` (≥60/100). (N3 §3c.)
- `packages/interaction/` extensions — disambiguation/MRTR `InputRequiredResult` elicitation + `present_clarification` HALT. (N2 cap 7 cross-cutter.)
- `packages/data/result-cache/` + `packages/data/view-materialization/` — the intent-passing render layer (full implementation). (N3 §3f, §4.)

**Dependencies:** Phase 1 leaves (query-guard, llm-dashscope, credentials, result-cache stub).

**BLOCKED on:**
- **Q5 (backend portability — MaxCompute-only vs generalize via rbi-query/conventions)** — blocks the `query` Service Definition shape. INFERENCE recommendation: port MaxCompute first (P1), keep the engine-registry shape so hologres/mysql/other engines can be added later as Providers without re-architecting.
- **Q9 (code-runtime vs bash for data transforms)** — blocks whether `compute` (pandas-based) runs in `packages/code-runtime/` (Code Mode `run_code`, mounted by `headless` bundle, N5) or via bash. INFERENCE recommendation: keep `code-runtime` for DataFrame transforms; bash for shell ops.

### Phase 3 — Four-phase data_agent orchestration as preset+skill (weeks 8-12)
**Deliverables:**
- `packages/preset/data-agent/` — an agent-preset composition (`agent.cordis.yml`) that mounts the Phase 2 capability plugins + the v2-baseline system-prompt section + the `phase-gate` plugin. (N4 §1.6 agent-preset; N1 §4.)
- `packages/skill/reverse-bi-analyze/` — the 6-step behavior skill (Understand→Confirm→Plan→Execute→Validate→Deliver), tool names updated to migrated plugin names. (N2 cap 13.)
- `packages/data-agent/phase-gate/` — the per-phase tool-gating plugin enforcing `PhaseConfig.tools` frozensets via `tools/pre-execute` (if the harness doesn't support per-phase whitelists natively — Frontier Q7). The four phases (UNDERSTANDING→GENERATION→EXECUTION→INTERPRETATION), `PipelineConfig` budgets, `factory.build_data_agent` assembly, `forced_load`, `metric_grounding`, `time_resolver`, `rewriter`/`rewrite_*`, `recovery`, `delivery`, `template_cache`, `learning`, `state`/`state_store`. (N1 §4; N2 cap 8b; N3 §3a.)
- Honest-rejection as a first-class turn outcome: `HALT_TURN` from `present_clarification`, `【未完成】`/`HONEST_DECLINE` channel, `behavior: clarify|reject|degrade` in `SessionEventMap`. (N3 §6.7.)
- Crash-recovery invariant: "never auto-replay `query_data`" as a `tools/post-execute` hook (non-idempotent + costs money, N1 §5.11).
- The v2-baseline prompt (v31/v32) → `packages/core/system-prompt` section content. (N1 §2.6, §4.)

**Dependencies:** Phase 2 capability seams (query, retrieval, presentation, audit, critique, interaction).

**BLOCKED on:**
- **Q7 (per-phase tool gating — harness support vs add gating layer)** — blocks the `phase-gate` plugin design. If the harness agent-loop supports per-phase whitelists natively, the `phase-gate` plugin is unnecessary; if not, it's a hard dependency.
- **Q8 (goal/todo/plan keep-or-disable)** — blocks whether the harness `goal/`/`todo/`/`plan/` packages are disabled in the `dsh-data-agent` bundle. INFERENCE: reverse-bi does NOT bring a persistent user-facing objective model (it has `PipelineConfig` budgets + phase-gated flow, but no goal/todo tracker) — keep the harness `goal/todo/plan` for the data agent; don't disable unless reverse-bi's own objective model is confirmed present.
- **Q3 (migration scope — confirm four-phase+factory+prompt+tools+guard+eval core vs trim flywheels/accel/frontend)** — blocks the overall scope. INFERENCE recommendation: confirm the core; trim flywheels/accel/frontend/versioning.

### Phase 4 — Eval harness as acceptance gate (weeks 12-16)
**Deliverables:**
- `packages/eval/eval/` (Service Definition = eval run/scoring contract; the `EvalCase` schema v3 is the contract a migrated plugin must satisfy, N3 §5a) + `packages/eval/eval-rbi/` (Provider = the 3-level scorer: L1 deterministic 7 assertions / L2 LLM judge 4 dims / L3 judge agent 5 steps) + `packages/eval/tool-eval/` (Consumer).
- Port the 5 match modes (`scalar_exact`/`multi_scalar_exact`/`row_count_range`/`set_equal`/`ordered_subset`), 2 eval layers (`l1` corpus self-check / `l2` capability eval), disambiguation/reuse ground-truth (69 disambiguation + 103 reuse cases, N3 §5f).
- Port `template.py` date-placeholder rendering (`{{ds_yesterday}}`/`{{ds_7d_ago}}` etc., N3 §5d) as an eval-only plugin.
- Port `rbi-tools` (golden set, coverage, synthetic case generation, `pytest_db_guard`, `uvicorn_harness`) into `scripts/` + `packages/test-support/` (N2 cap 12).
- The eval run lifecycle (`run_one_case`/`run_batch`/`execute_case`, never raises per-case failures except `AuthenticationAbort`, N3 §5e) as the acceptance gate.

**Dependencies:** Phase 3 (the data_agent pipeline must exist to be evaluated).

**BLOCKED on:**
- **Multi-turn eval** requires an `AgentResponder` injection (N3 §7) — does the harness agent runner expose the response hook needed for multi-turn scripted eval? Research ticket.

### Phase 5 — Trim (weeks 16+)
**Deliverables:**
- Disable (R4) then delete (R5) the harness packages the data agent doesn't need (see (D) below).
- Retire rbi-web (replaced by harness apps), rbi-mcp heavy stack (externalized or absorbed), evolution/flywheel/acceleration/frontend superstructure (trimmed).
- The `dsh-data-agent` bundle patch `disabled: true`s unwanted rows over `dsh-base` (no code forks) as the first cut; actual deletion (R5) only after the data-agent profile is stable and CI is green.

**Dependencies:** Phases 1-4 stable + CI green.

**BLOCKED on:**
- **Q2 (removal semantics — disable vs delete, per-phase)** — blocks whether Phase 5 is disable-only (reversible) or includes actual deletion. INFERENCE recommendation: disable for P1-P4 (reversible, no code forks); delete only at Phase 5+ after stability.
- **Q10 (Python-driven — keep python/+sdk?)** — blocks whether `python/sdk` + `python/sdk-runtime` are kept. INFERENCE: reverse-bi is Python; the eval harness and Python-speaking teams likely want the Python SDK — keep.
- **Q8 (goal/todo/plan)** — final decision on `goal/` removal (Phase 5 of N5; hardest base-wired removal).

---

## (C) TARGET ARCHITECTURE SKETCH — `deepseek-harness-data-agent`

### C.1 Harness packages KEPT (R5 essential, N5)
- `core/` (scope, session, system-prompt, tools, agent, agent-default-model, agent-loop, agent-tool-presentation) — the product API spine; the spine mounts all of these (`agent-spine-demo`, N5).
- `llm/` (llm, llm-retry, token-meter, llm-deepseek) + **NEW** `llm-dashscope` (Phase 1).
- `session/` (persistence-jsonl, checkpoint-policy, projection, title, title-llm; telemetry* disabled by default).
- `fs/` (fs, fs-local, fs-sandbox, fs-observation-policy, tool-fs, tool-fs-search, tool-str-replace-editor).
- `shell/` (shell, bash-local, bash-sandbox, shell-env, tool-bash; drop `pwsh-*` on POSIX).
- `subprocess/` (subprocess, subprocess-local).
- `settings/` + `credentials/` (extended with MaxCompute 3-tier resolver).
- `boot/` (app-boot, cmdline).
- `bundle/` (base, headless; **drop web-app** with GUI).
- `util/` (brand, home-paths, timeout, atomic-write, native-command, launch-environment, output-retention).
- `preset/` (agent-presets, persona) — the data-agent composition vehicle.
- `vendor/` (cordis, loader, include, group, timer, hmr, schemastery, cosmokit, logger-console) — cannot remove.
- `native/` (landlock-run on Linux).
- `guard/` (repeat-tool-reminder, timeout-policy) — extended with `query-guard` + `phase-gate`.
- `compaction/` (compaction, compaction-basic, command-compact, tool-result-pruner) — for long sessions.
- `context/` (agent-instructions, time-context, session-reference; drop `tmux-context`).
- `interaction/` (commands, user-approval, permission-presets, user-questions, tool-ask-user) — extended for MRTR/disambiguation.
- `sandbox/` (sandbox, sandbox-local, sandbox-policy; drop `sandbox-windows-acl` on POSIX).
- `test-support/` + `runtime-diagnostics/invariants`.
- `jobs/` (jobs, jobs-local, tool-jobs) — for long-running queries (`query_data` task=True).
- `spill/` (spill, spill-local, spill-policy) — useful for large data outputs.
- `code-runtime/` (code-runtime, code-runtime-worker-thread) — for pandas DataFrame transforms in `compute` (mounted by `headless` bundle).
- `mcp/` (mcp-client) — bridges to the external rbi-mcp heavy stack (the MCP-HTTP boundary, see C.4).
- `skill/` (skill, skill-filesystem, tool-skill) — for the `reverse-bi-analyze` skill.
- `examples/` (agent-spine-demo as the spine reference; drop `acp-demo`).
- `python/` (sdk, sdk-runtime) — LIKELY keep (reverse-bi is Python; eval harness + Python SDK).

### C.2 Harness packages DISABLED/REMOVED (R5 phased, N5)
- **Phase 1 (zero-coupling POCs; just stop loading):** `e2b/`, `terminal/`, `lsp/`, `hooks/`.
- **Phase 2 (self-modification + reminders + docs; not in base/spine):** `extensions/`, `schedule/`, `website/`.
- **Phase 3 (web-GUI stack; drop `bundle/web-app` + `apps/web`):** `client/` (~40 packages), `host/` (8 packages), `api/remotes` + `api/gateway`.
- **Phase 4 (base-wired but spine-decoupled; edit `dsh-base/cordis.patch.yml` to delete rows):** `typert/` + `api/gateway` (rows `:30,33,36`), `feedback/` (`command-feedback` `:253`), `session-telemetry-otel` (`:148`) + `identity/anonymous-user-id` (if telemetry stays disabled).
- **Phase 5 (conditional base-wired; decide per data-agent scope):** `goal/` (4 rows `:256-262,374` + spine `:23-25`; remove only if reverse-bi supplies its own objective model — INFERENCE: it doesn't, so keep), `tool-ralph` (`:378`; Ralph is build/coding-focused, drop), `workflow/` (`:335-340`; drop if no model-authored orchestration needed), external subagent providers (`subagent-acp/codex/claude-code/dsh-sdk`; already opt-in).
- **Phase 6 (conditional non-base; just don't load):** `storage/`, `workspace/`, `sdk/`, `attachment/`, `session-query/`, `examples/acp-demo` (each independent; load only what the data agent uses — `mcp/`, `code-runtime/`, `python/` are kept per above).

### C.3 NEW packages authored
- `packages/data/data-types/` — shared types (port of rbi-core).
- `packages/data/result-cache/` — result_id→rows cache (intent-passing foundation).
- `packages/data/view-materialization/` — renders `present_table`/`compute` intent from the cache.
- `packages/data/data-store/` — ORM + audit store Provider on `ctx.storage`.
- `packages/data/tool-presentation/` — `present_table`/`present_decomposition`/`present_clarification`/`compute`/`suggest_followups` Consumers.
- `packages/data/tool-audit/` — `log_audit`/`replay_query` Consumers.
- `packages/data/tool-critique/` — `critique_sql_tool`/`evaluate_sql_quality` Consumers.
- `packages/query/query/` — Service Definition (`QueryEngine` protocol + `QueryOutcome` 3-state).
- `packages/query/query-maxcompute/` — Provider (the hardest port).
- `packages/query/query-guard/` — Guard Chain Service Definition + hook.
- `packages/query/tool-query/` — `query_data`/`check_query` Consumer.
- `packages/retrieval/retrieval/` — Service Definition.
- `packages/retrieval/retrieval-hybrid/` — Provider (BM25+jieba+sqlite-vec+RRF; bge-m3 in Provider).
- `packages/retrieval/tool-search/` — `search_data_sources`/`load_*` Consumer.
- `packages/semantic-layer/` — YAML semantic-layer reader/writer Provider.
- `packages/llm/llm-dashscope/` — DashScope Provider on `ctx.llm`.
- `packages/data-agent/phase-gate/` — per-phase tool-gating hook (if harness doesn't support natively).
- `packages/eval/eval/` + `packages/eval/eval-rbi/` + `packages/eval/tool-eval/` — eval harness.
- `packages/preset/data-agent/` — the data-agent agent-preset composition.
- `packages/skill/reverse-bi-analyze/` — the behavior skill.
- `packages/bundle/data-agent/` — the `dsh-data-agent` bundle (cordis.patch.yml over dsh-base+headless).

### C.4 The composition (bundle patch over dsh-base+headless + agent-spine-demo spine)
- The runtime is `dsh --profile headless` (headless bundle) layered with the new `dsh-data-agent` bundle patch, which:
  - Inserts the data-capability rows (the NEW packages above).
  - `disabled: true`s the unwanted harness rows (`tool-ralph`, `tool-terminal`, `tool-lsp`, `extensions/*`, `schedule`, `feedback/command-feedback`, `typert*`, `api/gateway`, `session-telemetry-otel` if disabled, `client/*`, `host/*`, `e2b/*`, `hooks/*`, `website`).
  - Mounts the `data-agent` agent-preset for the per-session composition (the four-phase pipeline + v2-baseline prompt + phase-gate).
- The `agent-spine-demo` spine (N5) proves the irreducible agent: `core/` + `llm` (abstract) + `session` + `session-title` + `agent-instructions` + `skill` + `jobs` + `preset/agent-presets`. The data-agent profile extends this spine with the data capabilities.

### C.5 MCP-HTTP boundary resolution (RECOMMENDATION + alternative)
**RECOMMENDATION (hybrid — preserve the boundary for the heavy stack, re-architect the agent domain in-process):**
- **Keep rbi-mcp as an EXTERNAL MCP server** (slimmed to the heavy-lifting tools: `query_data`, `check_query`, `search_data_sources`, `load_*`, `log_audit`, `save_accumulated_definition`, Tier-1 admin `approve_*`/`set_guard_override`). The harness `packages/mcp/mcp-client` connects to it. This preserves ADR-0028 D3's zero-internal-deps discipline for the heavy ODPS/embedder stack (pyodps, pandas, sentence-transformers ~2.3GB bge-m3), keeps that mass out of the harness process, and is the natural seam (the harness already has `mcp-client`, N4 §2.1).
- **Retire rbi-agent `core/`** (REDUNDANT — harness owns agent-loop/session/mcp-client/llm).
- **Port rbi-agent `data_agent/` IN-PROCESS** as a `preset` + `skill` + `phase-gate` plugin composition (the unique domain value: four-phase pipeline, factory, prompt, guard-chain integration, honest-rejection).
- **Port the lightweight orchestration tools IN-PROCESS** (`present_table`, `present_decomposition`, `present_clarification`, `compute`, `suggest_followups`, `critique_sql_tool`, `evaluate_sql_quality`, `get_user_preferences`) so they access the in-process `result-cache` + session context directly.
- **The result-cache + view-materialization layer is a NEW in-process harness capability** (`packages/data/result-cache/`). `query_data` (whether proxied via MCP or in-process) populates it and returns `result_id`; `present_table`/`compute` read by handle. For the MCP-external `query_data`, the tiered preview (≤100 rows full / summary + 5 sample) comes back inline; heavy rows stay in the MCP server's cache and `present_table` fetches by handle via a second MCP call if needed — preserving the "intent not data" boundary.

**ALTERNATIVE (re-architect rbi-agent fully in-process as plugins):** Re-establish the ADR-0028 D3 invariants another way — e.g. a `packages/data/` boundary enforced by import-linter (mirrors rbi's `[tool.importlinter]`). Port the heavy stack (MaxCompute connector, retrieval embedder) as in-process Providers with the heavy deps isolated in the Provider package only (mirrors C6 "base libs never import rbi-mcp"). This eliminates the MCP HTTP round-trip (latency + serialization) and simplifies the result-cache (no cross-process handle), but brings the 2.3GB model + pyodps into the harness process and dissolves the swappable/deployable-boundary property. **Not recommended** unless latency proves unacceptable.

---

## (D) REMOVAL PLAN (from N5, phased by safety)

Ordered safest-first. Each row: package/group → disable-vs-delete recommendation → risk → coupling question.

**Phase 1 — zero-coupling POCs (not in base/spine; just stop loading):**
- `e2b/` (e2b, fs-e2b, subprocess-e2b) — **DELETE** (POC, not wired, N5). Risk: none. Coupling: none.
- `terminal/` (terminal, terminal-bash, tool-terminal) — **DELETE** (not in base/spine; data agent uses one-shot `tool-bash`). Risk: none. Coupling: none.
- `lsp/` (lsp, lsp-stdio, tool-lsp) — **DELETE** (data agent is not a code-navigation agent). Risk: none. Coupling: none.
- `hooks/` (hook-protocol, hooks-claude-code, hooks-codex) — **DELETE** (data agent has no external hooks.json). Risk: none. Coupling: none (but check `test-support/acp-snapshot` dependency on `acp/`, N5 Q7).

**Phase 2 — self-modification + reminders + docs (not in base/spine):**
- `extensions/` (tool-cordis, cordis-host-runner, cordis-client-runner, ui-cordis) — **DELETE** (data agent should not rewrite its own runtime). Risk: low-med (`ui-cordis` is dual-half with client, leaves with `client/`). Coupling: leaves with `client/`.
- `schedule/` — **DELETE** (no reminder need). Risk: none. Coupling: none.
- `website/` — **DELETE** (VitePress docs projection; not runtime). Risk: none. Coupling: none.

**Phase 3 — web-GUI stack (drop `bundle/web-app` + `apps/web` together):**
- `client/` (~40 packages) — **DELETE** (data agent is headless). Risk: med (large delete). Coupling: `web-app` bundle mounts; many `ui-*`.
- `host/` (apiproxy, webserver, frontend-static, directory-picker*, plugin-inventory) — **DELETE** (headless). Risk: med. Coupling: `web-app` bundle; `apiproxy` is legacy BFF fallback.
- `api/remotes` + `api/gateway` — **DELETE** (BFF for the GUI; headless data agent opens no port). Risk: med. Coupling: base row + host/client/web-app bundle.

**Phase 4 — base-wired but spine-decoupled (edit `dsh-base/cordis.patch.yml` to delete rows):**
- `typert/` (registry, loader, generator) — **DELETE** rows `:30,33,36`. Safe: core has **zero** `typert`/`api-gateway` references (grep: no matches, N5) and spine omits them. Risk: med (3 base rows). Coupling: only `api/gateway` consumes.
- `feedback/` — **DELETE** `command-feedback` row `:253`; `message-feedback` already opt-in. Risk: low-med. Coupling: one base row.
- `session-telemetry-otel` + `identity/anonymous-user-id` — **DELETE** rows `:148` + identity, IF telemetry stays disabled. Risk: low. Coupling: telemetry disabled by default.

**Phase 5 — conditional base-wired (decide per data-agent scope):**
- `goal/` (goal, goal-round-driver, command-goal, tool-goal; 4 rows `:256-262,374` + spine `:23-25`) — **DISABLE first** (via `dsh-data-agent` patch `disabled: true`), then **DELETE** only if reverse-bi supplies its own objective model. INFERENCE: reverse-bi does NOT bring a persistent user-facing objective model — keep `goal/` for the data agent. **Hardest base-wired removal** (spine mounts it). Coupling question: does `agent-spine-demo` `goals: false` config fully suppress? (N5 Q6.)
- `tool-ralph` (`:378`) — **DELETE** (Ralph fresh-agent iteration is build/coding-focused). Risk: low. Coupling: independent.
- `workflow/` (`:335-340`) — **DISABLE** then **DELETE** if no model-authored orchestration needed. Risk: low-med. Coupling: `tool-ralph` sibling.
- External subagent providers (`subagent-acp/codex/claude-code/dsh-sdk`) — already opt-in; **don't load**.

**Phase 6 — conditional non-base (decide per scope; just don't load):**
- `mcp/` (mcp-client) — **KEEP** (bridges to external rbi-mcp heavy stack, C.5).
- `storage/`, `workspace/`, `sdk/`, `attachment/`, `session-query/` — **DON'T LOAD** unless used. `session-query/` is useful for querying past analysis sessions (keep if data agent queries past sessions).
- `code-runtime/` — **KEEP** (mounted by `headless` bundle; for `compute` pandas transforms).
- `python/` (sdk, sdk-runtime) — **KEEP** (reverse-bi is Python; eval harness + Python SDK).
- `examples/acp-demo` — **DELETE** with `acp/`.

**Disable-vs-delete recommendation per phase:** Phase 1-3 → **DELETE** (zero coupling, not wired; safe). Phase 4 → **DELETE base rows** after confirming no core references (grep-backed). Phase 5 → **DISABLE first** (reversible, no code forks; R4 lever), **DELETE only after** the data-agent profile is stable + CI green (the repo's pre-release "foundation over blast radius" stance tolerates actual deletion, N5). Phase 6 → **DON'T LOAD** (opt-in by not composing).

---

## (E) THE FRONTIER — consolidated, prioritized open decisions for the human

These become grilling questions / tickets. Each: question + options + what it blocks + recommendation.

### E.1 MCP-HTTP boundary resolution
- **Question:** Keep rbi-mcp as an external MCP server the harness mcp-client connects to (preserve ADR-0028 D3 boundary) OR re-architect rbi-agent in-process as plugins (re-establish invariants another way)?
- **Options:** (a) hybrid — heavy stack external via MCP, lightweight orchestration + agent domain in-process; (b) fully in-process — re-architect everything as plugins, isolate heavy deps via import-linter.
- **What it blocks:** Phase 1 package topology (does `rbi-agent core/` retire? does `rbi-mcp` stay external?), the result-cache design (cross-process handle vs in-process), whether the 2.3GB bge-m3 + pyodps live in the harness process.
- **Recommendation:** **(a) hybrid**. Preserve the boundary for the heavy ODPS/embedder stack (natural for pyodps/pandas/sentence-transformers; the harness already has `mcp-client`); retire `rbi-agent core/`; port `data_agent/` + lightweight tools in-process. The result-cache is a new in-process `packages/data/result-cache/` capability; `query_data` (external) returns tiered preview inline + handle, `present_table` fetches by handle if needed.

### E.2 Removal semantics (disable vs delete, per-phase)
- **Question:** For each removal phase, disable (R4 bundle patch `disabled: true` over dsh-base, no code forks) or delete (R5 phased DELETE plan)?
- **Options:** (a) disable-only (reversible, preserves upgrade path); (b) delete (cleaner repo, no dead code); (c) disable-first-then-delete (disable in P1-P4, delete in P5+ after stability).
- **What it blocks:** Phase 5 trim, repo hygiene, whether the fork diverges from upstream permanently.
- **Recommendation:** **(c) disable-first-then-delete**. Disable via `dsh-data-agent` bundle patch (R4, no code forks) as the first cut for ALL phases; delete (R5) only at Phase 5+ after the data-agent profile is stable and CI is green. Phase 1-3 (zero-coupling POCs) can skip straight to delete (safe, N5).

### E.3 Migration scope (confirm core vs trim superstructure)
- **Question:** Confirm the migration CORE = four-phase data_agent pipeline + `factory.build_data_agent` + v2-baseline prompt + the MCP tool set + the guard chain + the eval harness, and TRIM the two evolution flywheels + query-acceleration + 9 frontend pages + prompts/format-templates/flows/context versioning superstructure?
- **Options:** (a) confirm core + trim superstructure (minimal data-agent); (b) port everything (including flywheels/accel/frontend); (c) port core + a subset of superstructure (e.g. keep evolution, trim frontend).
- **What it blocks:** The entire migration scope (Phases 1-5), bundle size, team size needed.
- **Recommendation:** **(a) confirm core + trim superstructure**. The four-phase pipeline + factory + prompt + tools + guard + eval are the precision-grade data agent. The flywheels/accel/frontend/versioning are maturity-stage optimizations; defer them. They can re-mount via a profile/preset without code forks if wanted later.

### E.4 data-agent-as-product vs bundle/preset profile
- **Question:** Is `deepseek-harness-data-agent` a standalone product (hard fork of the harness) or a bundle/preset profile over `dsh-base`+`dsh-headless` (no code forks, composable)?
- **Options:** (a) bundle/preset profile over dsh-base+headless (the `dsh-data-agent` bundle patch + `data-agent` agent-preset; preserves upgrade path); (b) hard fork (rename, diverge); (c) separate repo that depends on `@deepseek-ai/dsh-*` packages as npm deps.
- **What it blocks:** Repo strategy, whether we fork or compose, upgrade path, whether removal is disable (profile patch) or delete (fork).
- **Recommendation:** **(a) bundle/preset profile** (no code forks). The harness's bundle/profile layering (N4 §1.6, N5) is explicitly designed for this: a `dsh-data-agent` bundle is just another patch layer over `dsh-base` that inserts data-capability rows and `disabled: true`s unwanted rows. Preserves the upgrade path; removal is reversible.

### E.5 backend portability (MaxCompute-only vs generalize via rbi-query/conventions)
- **Question:** Port only the MaxCompute engine (the production backend, 531 tables 100% maxcompute, N3 §2c) OR keep rbi-query's engine-registry shape so hologres/mysql/other engines can be added later as Providers?
- **Options:** (a) MaxCompute-only (simplify, single Provider); (b) keep the engine-registry shape (Service Definition + multiple Providers, one per backend); (c) generalize via rbi-query/conventions (port the engine-registry + conventions.yaml per-engine dialect config).
- **What it blocks:** The `query` Service Definition shape, whether `conventions.py` (the sole rbi-agent-visible symbol) is a single dialect or a registry.
- **Recommendation:** **(b) keep the engine-registry shape**. Port MaxCompute first (P1, hardest), but preserve the `QueryEngine` protocol + `QueryOutcome` 3-state contract + `conventions.yaml` per-engine dialect config so hologres/mysql/other engines can be added later as Providers without re-architecting. The harness's capability-seam discipline (Service Definition/Provider/Consumer trio, N4 §3) is exactly this shape.

### E.6 LLM seam DashScope compatibility (streaming + tool-call + reasoning_content — research ticket?)
- **Question:** Does the harness LLM seam (`packages/llm/llm` Service Definition + `llm-deepseek` Provider) natively support DashScope's `reasoning_content` + streaming + tool_calls? Or does it need an `LlmAdapter` subclass (`registerAdapter`, N4 §2.3)?
- **Options:** (a) harness seam supports all three natively → port `llm-dashscope` as a plain Provider; (b) partial support → extend the seam (research) or add an adapter; (c) no support → research ticket to extend the LLM Service Definition.
- **What it blocks:** Phase 1 `llm-dashscope` Provider port; whether the DashScope `reasoning_content` field (qwen-plus, "Peach-07-17-DogFooding" production model, N1 §2.6) is preserved.
- **Recommendation:** **Open a RESEARCH TICKET** to verify the harness LLM seam's `reasoning_content`/streaming/tool_calls support against `packages/llm/llm/src/` + `llm-deepseek/src/`. INFERENCE: the harness is a DeepSeek fork, so `llm-deepseek` likely already handles `reasoning_content` (DeepSeek's own reasoning models emit it) — but DashScope's response shape differs (OpenAI-compatible HTTP, N1 §2.6). Port `llm-dashscope` as a Provider; if the seam gaps, add an `LlmAdapter`.

### E.7 per-phase tool gating (harness support vs add gating layer)
- **Question:** Does the harness agent-loop support per-phase tool whitelists (the `PhaseConfig.tools` frozensets: UNDERSTANDING/GENERATION/EXECUTION/INTERPRETATION each with a distinct tool set, N1 §4)? If not, add a gating layer (`packages/data-agent/phase-gate/` hook on `tools/pre-execute`)?
- **Options:** (a) harness supports per-phase whitelists natively → no extra plugin; (b) add a `phase-gate` plugin that hooks `tools/pre-execute` to enforce `PhaseConfig.tools`; (c) collapse phases (lose the isolation that prevents e.g. calling `query_data` before `critique_sql_tool`).
- **What it blocks:** Phase 3 orchestration (the four-phase pipeline), whether the `phase-gate` plugin is a hard dependency.
- **Recommendation:** **(b) add the `phase-gate` plugin** unless research confirms (a). INFERENCE: the harness agent-loop (N4 §2.1, `ctx.agentLoop`) is a single ReAct loop without phase gating — the per-phase tool whitelists are rbi-specific domain logic. The `phase-gate` plugin hooks `tools/pre-execute` (allow/deny policy, N4 §2.2) to enforce the whitelist per current phase; `present_clarification` HALT = `interaction/user-approval` + `guard`. Do NOT collapse phases — the isolation is load-bearing for precision (prevents `query_data` before `critique_sql_tool`).

### E.8 goal/todo/plan keep-or-disable (does reverse-bi bring its own objective model?)
- **Question:** Does reverse-bi bring its own persistent user-facing objective/task model (goal/todo/plan equivalent)? If yes, the harness `goal/`/`todo/`/`plan/` are redundant (Phase 5 removal). If no, keep them.
- **Options:** (a) reverse-bi has its own objective model → disable+delete `goal/todo/plan`; (b) reverse-bi does NOT → keep `goal/todo/plan` for the data agent; (c) port reverse-bi's objective model as a preset/skill layer over the harness goal/todo/plan.
- **What it blocks:** Phase 5 `goal/` removal (the hardest base-wired removal, 4 rows + spine mount, N5), whether the `dsh-data-agent` bundle `disabled: true`s `goal/todo/plan`.
- **Recommendation:** **(b) keep `goal/todo/plan`** for the data agent. INFERENCE: reverse-bi does NOT have a persistent user-facing objective tracker — it has `PipelineConfig` budgets (`max_llm_calls_per_turn=60`, `max_subquestions=4`, etc.) + the four-phase flow, but no goal/todo/plan equivalent. The harness `goal/todo/plan` (N5: `goal/` in base+spine, `todo/` in base, `plan/plan-mode` in base) covers the data agent's multi-step task tracking need. Disable only if a reverse-bi objective model is confirmed present.

### E.9 code-runtime vs bash for data transforms
- **Question:** For data transforms (the `compute` tool's pandas-based comparison/ratio/rank/percentile/custom operations, N3 §4), use `code-runtime` (Code Mode `run_code`, mounted by `headless` bundle, N5) or bash?
- **Options:** (a) `code-runtime` for DataFrame transforms; bash for shell ops; (b) bash-only (simpler, fewer packages); (c) `code-runtime`-only (Python-first).
- **What it blocks:** Phase 6 `code-runtime/` decision, the `compute` tool implementation.
- **Recommendation:** **(a) keep `code-runtime` for DataFrame transforms; bash for shell ops**. `compute` is pandas-based (comparison/ratio/rank/percentile/custom via `_safe_eval_expression` ast parse, N3 §4) — `code-runtime` (Code Mode `run_code`) is the natural fit. The `headless` bundle already mounts Code Mode's worker (N5). Bash is insufficient for DataFrame arithmetic. Keep both; they compose.

### E.10 Python-driven (keep python/+sdk?)
- **Question:** Is the data agent driven/consumed via Python (reverse-bi is Python; the eval harness is Python; Python-speaking teams)? Keep `python/sdk` + `python/sdk-runtime`?
- **Options:** (a) keep `python/` (SDK + bundled runtime; drives harness via stdio JSON-RPC); (b) drop `python/` (TS-only); (c) keep `python/sdk` only (no bundled runtime).
- **What it blocks:** Phase 6 `python/` decision, whether the eval harness (rbi-eval is Python) drives the agent via Python.
- **Recommendation:** **(a) keep `python/`** (sdk + sdk-runtime). reverse-bi is Python (N1 §2.1); rbi-eval is Python (N2 cap 10); the eval harness's `adapters/` (pluggable SQL-generator/LLM/agent/verifier, N2 cap 10) are Python. The Python SDK (stdio JSON-RPC, N5) is the bridge. Dropping `python/` would force re-implementing the eval harness in TS — not worth it.

---

## (F) Reconcile the retrieval-embedding discrepancy

**The discrepancy:**
- **N1 (`rbi-purpose-arch.md` §2.5)** states the production embedder is **BAAI/bge-m3 (1024-dim)**, which **replaced** `text2vec-base-chinese-paraphrase` (768-dim). Cites `CLAUDE.md` "匹配层评测" + `unified_search.py`. Also names the cross-encoder `bge-reranker-v2-m3` (`RERANKER_FLOOR=0.2`).
- **N2 (`rbi-capability-inventory.md` cap 7)** and **N3 (`rbi-data-behaviors-api.md` §3b)** cite **sqlite-vec** (the vector-store library) with **`text2vec-base-chinese-paraphrase`, dim=768**. N2 cap 7 cites `libs/rbi-retrieval/pyproject.toml` deps; N3 §3b cites the README retrieval stack.

**Reconciliation (which is which):**
- **sqlite-vec** is the **vector-store library** (consistent across all three notes — the storage engine for similarity search). The dimensionality it stores follows whichever embedder feeds it.
- **bge-m3 (1024-dim)** is the **current production embedder** per N1's explicit "replaced" language and CLAUDE.md citation. This is the more recent, architecturally authoritative claim.
- **text2vec-base-chinese-paraphrase (768-dim)** is the **legacy embedder** that N1 says was replaced. N2 and N3 cite it from the dependency manifest (`pyproject.toml`) and retrieval-lib docs, which may still list the old model name even after the runtime swapped to bge-m3 — a common stale-dep-manifest pattern.

**INFERENCE:** The 768-dim figure in N2/N3 is **stale** (cites the pre-replacement model name from the dep manifest / older docs); the 1024-dim bge-m3 in N1 is **current production**. sqlite-vec is the vector store in all cases; bge-m3 feeds it 1024-dim vectors at runtime. The nDCG@10=0.816 figure (N2 cap 7, N3 §3b) was likely measured under the current bge-m3 embedder.

**Open research ticket (verification needed):** Confirm against `libs/rbi-retrieval/src/rbi_retrieval/semantic/embedder.py` source + the actual model file loaded at runtime — does it load `BAAI/bge-m3` (1024) or `text2vec-base-chinese-paraphrase` (768)? If the source still names text2vec, N1's "replaced" claim may be aspirational/planned rather than landed. This discrepancy must be resolved before Phase 2 `packages/retrieval/retrieval-hybrid/` Provider port (the embedder dimensionality is load-bearing for the sqlite-vec schema + the `fake` embedder test gate `RBI_EMBEDDER=fake`, N1 §2.5).

---

## END

Synthesis complete. Primary sources: N1-N5 (the 5 research notes). All claims inherit the notes' file:line citations through the `N#` references; deductions labelled `INFERENCE`. Open decisions consolidated in §E for grilling.
