# dsh-data-agent 语义层 · 通用性审计报告

> 生成日期: 2026-08-31
> 方法: 8 维度并行审计（每维自验证 / 对抗式自检）→ 合成去重
> 原始数据: `.tmp/audit/{d1..d8,actionlist,archdefects}.json`

## 执行摘要

- **原始 finding**: 95 条（8 维度）
- **合成 action item**: 29 条（critical 3 / high 8 / medium 15 / low 3）
- **系统性架构缺陷（G 票）**: 7 条

**结论**: 抽象缝存在（`ctx.query` / `EngineConventions` / `--provider` / `corpusVersion()`），但默认值与字面量全是 K11/MaxCompute/Qwen/中文 → 换场景时缝形同虚设，静默退化或直接崩。eval CORE 可移植，框架层 K11-bound。

### 维度总览
| 维度 | finding | 摘要 |
|---|---|---|
| d1-hardcode | 15 | The K11/MaxCompute/Chinese-game scenario is baked into shipped generic logic — the NL2SQL prompt, phase-gate, query tool, eval runner, and s |
| d2-engine-coupling | 25 | MaxCompute/ODPS dialect is baked deeply into the supposedly engine-agnostic nl2sql-engine (prompt rules, critic, metric-engine, post-process |
| d3-metadata-assumptions | 10 | The semantic layer's TableDefinition schema and sync-write generators bake in K11-specific assumptions that silently break on a bare Postgre |
| d4-language-culture | 16 | The semantic layer is effectively Chinese-only: the NL2SQL generation prompt, the production BM25 query-expansion prompt, and the SQL semant |
| d5-eval-portability | 7 | The eval CORE is portable: the case schema (eval_case.ts) is dialect-agnostic (result_value + match_mode + answer, no expected_tables/expect |
| d6-single-scope-tenant | 7 | The architecture assumes a single globally-active scope: ScopeRegistry holds one `active` pointer in a shared YAML file (read fresh from dis |
| d7-enrichment-pipeline | 9 | The enrichment pipeline is hard-wired to the DWS/DIM star-schema model: buildDimInventory scans only kind='dim' tables, discoverRelationsDet |
| d8-mgmt-preset | 6 | The management persona and its per-phase instructions are hardcoded K11/game/ODPS content baked into the phase-gate plugin (the A/C default  |

## 1. 优先级行动清单（按 severity）

### 🔴 Critical（3）

| # | 标题 | 维度 | 关键 file:line | 类型 |
|---|---|---|---|---|
| C1 | Multi-tenant impossible: single global active-scope singleton with no per-request/per-tenant scope context | d6 | packages/data/scope-registry/src/index.ts:142; packages/data/scope-registry/src/index.ts:206; packages/data/semantic-layer/src/index.ts:530; packages/data/semantic-layer/src/index. | G-ticket |
| C2 | Management persona is a hardcoded non-overridable const baked to K11/game/ODPS in phase-gate | d8,d1 | packages/data/phase-gate/src/phase-gate.ts:85; packages/data/phase-gate/src/phase-gate.ts:958; packages/data/phase-gate/src/phase-gate.ts:89; packages/data/phase-gate/src/phase-gat | G-ticket |
| C3 | Production LLM prompts are hardcoded Chinese+game-domain literals with no i18n/templating seam | d4,d1,d2,d5,d7,d3 | packages/data/nl2sql-engine/src/prompt.ts:84; packages/data/nl2sql-engine/src/prompt.ts:175; packages/data/tool-search-data-sources/src/expand-query.ts:11; packages/eval/eval-runne | G-ticket |

**C1 Multi-tenant impossible: single global active-scope singleton with no per-request/per-tenant scope context**

- 维度: d6
- 文件: packages/data/scope-registry/src/index.ts:142; packages/data/scope-registry/src/index.ts:206; packages/data/semantic-layer/src/index.ts:530; packages/data/semantic-layer/src/index.ts:539
- 类型: **G-ticket**
- 换场景影响: Concurrent tenants/scopes race on one shared-YAML `active` pointer (load() re-reads the file every call, so even separate processes share the last writer's scope); tenant A's next read returns tenant B's semantic root -> cross-tenant table/event/relation-graph data leak. Only one scope can be active at a time; 'multiple scopes coexisting' is impossible.
- 建议动作: Make scope selection per-request, not global: pass an explicit scopeId through the call chain (or AsyncLocalStorage/request context keyed by tenant+session) so each request addresses its own scope. The registry should resolve scope definitions by id without a single mutable `active` pointer; keep any default per-session/per-tenant, never in a shared cross-process file.

**C2 Management persona is a hardcoded non-overridable const baked to K11/game/ODPS in phase-gate**

- 维度: d8, d1
- 文件: packages/data/phase-gate/src/phase-gate.ts:85; packages/data/phase-gate/src/phase-gate.ts:958; packages/data/phase-gate/src/phase-gate.ts:89; packages/data/phase-gate/src/phase-gate.ts:93
- 类型: **G-ticket**
- 换场景影响: Any non-game deployment (finance/retail/SaaS) gets a management agent whose core identity says it serves a 'per-game analytics platform' with ods_*/dws_*/game.role.online/DAU/MAU/pay_amt conventions, and the phase-gate Config schema exposes scopeId+budget knobs but NO persona-text field, so it is non-overridable without forking the package.
- 建议动作: Add a `personaText`/`basePersona` field to PhaseGateConfig (read at register() line 958), OR drop phase-gate's persona ownership and mount a dsh-persona row (text already config-supplied) in agent.cordis.yml so deployments override text without forking. Make table-prefix/event-name conventions data-driven from the semantic-layer schema rather than PHASE_INSTRUCTIONS literals.

**C3 Production LLM prompts are hardcoded Chinese+game-domain literals with no i18n/templating seam**

- 维度: d4, d1, d2, d5, d7, d3
- 文件: packages/data/nl2sql-engine/src/prompt.ts:84; packages/data/nl2sql-engine/src/prompt.ts:175; packages/data/tool-search-data-sources/src/expand-query.ts:11; packages/eval/eval-runner/src/sql_semantic_judge.ts:70; packages/eval/eval-runner/src/sql_semantic_judge.ts:90; packages/data/tool-resolve-term/src/index.ts:46; packages/data/nl2sql-engine/src/conventions.ts:33; packages/eval/eval-cli/src/context.ts:221; packages/data/semantic-layer/src/io.ts:559; packages/data/semantic-layer/src/enrichment.ts:76
- 类型: **G-ticket**
- 换场景影响: English/Japanese enterprises receive game-domain Chinese instructions (角色->role_id, 埋点, 千分位, expansion few-shots ARPPU/PVP/钻石/大R, judge rubric '总量/趋势/分布/占比', resolve_term render text) that don't match their domain or query language -> degraded SQL quality, biased BM25 expansion/recall, mis-scored eval, Chinese rationale in English reports. No i18n/templating layer exists; the dialect section is the only externalized slice.
- 建议动作: Introduce a prompt-template registry keyed by locale (zh/en/ja)+domain with {{persona}}, {{rules}}, {{tool_catalog}} interpolation groups mirroring the conventions seam; externalize SOP/rules/tool-catalog/few-shot examples as locale-neutral structured data rendered through locale bundles. Migrate the NL2SQL generation prompt, the production+eval expansion prompt, the SQL semantic judge prompt, resolve_term, renderConventionsPrompt headers, and the DIM/event derivation strings.

### 🟠 High（8）

| # | 标题 | 维度 | 关键 file:line | 类型 |
|---|---|---|---|---|
| H1 | Engine-conventions abstraction is fake: only maxcompute conventions exist, empty shape for other engines, maxcompute defaulted everywhere, literal dialect rules baked into prompts/critic/metric-engine | d1,d2,d8 | packages/data/nl2sql-engine/src/prompt.ts:111; packages/data/nl2sql-engine/src/prompt.ts:113; packages/data/nl2sql-engine/src/prompt.ts:188; packages/data/nl2sql-engine/src/prompt. | G-ticket |
| H2 | No engine registry/factory: MaxComputeQueryEngine is the only provider; bundle + eval-cli hard-import maxcompute; tool descriptions say 'MaxCompute SQL' | d2,d1 | packages/query/query/src/index.ts:38; packages/bundle/data-agent/cordis.patch.yml:106; packages/bundle/data-agent/cordis.patch.yml:116; packages/bundle/data-agent/cordis.patch.yml: | G-ticket |
| H3 | Semantic-layer TableDefinition schema + sync-write generators bake K11/MaxCompute/Chinese defaults | d3,d1 | packages/data/semantic-layer/src/types.ts:270; packages/data/semantic-layer/src/types.ts:278; packages/data/semantic-layer/src/types.ts:283; packages/data/semantic-layer/src/types. | G-ticket |
| H4 | Enrichment pipeline hard-wired to DWS/DIM star-schema; non-star scopes silently get empty enrichment that wipes curated refs | d7,d3 | packages/data/semantic-layer/src/enrichment.ts:226; packages/data/semantic-layer/src/enrichment.ts:230; packages/data/semantic-layer/src/enrichment.ts:311; packages/data/semantic-l | G-ticket |
| H5 | Eval runner + bundle hardcode K11 scope/regex/caseDir/defaultProject/semanticRoot/today | d1,d5,d8 | packages/eval/eval-runner-service/src/index.ts:391; packages/eval/eval-runner-service/src/index.ts:418; packages/eval/eval-runner-service/src/index.ts:379; packages/eval/eval-runne | G-ticket |
| H6 | Cross-tenant leak cascade from global scope: scope-hint/list-scopes expose all scopes; tool-retrieve serves stale prior-scope corpus; evidence-query eval store is unscoped; InProcRetrieval holds a frozen corpus | d6 | packages/data/tool-scope-routing/src/scope-hint.ts:66; packages/data/tool-scope-routing/src/list-scopes.ts:42; packages/data/tool-retrieve/src/index.ts:124; packages/data/tool-retr | G-ticket |
| H7 | Chinese-only keyword lexicons + CJK-bracket-only marker regex break English/Japanese trend/time-param/marker parsing | d2,d4 | packages/data/nl2sql-engine/src/metric-engine.ts:97; packages/data/nl2sql-engine/src/metric-engine.ts:99; packages/data/nl2sql-engine/src/metric-engine.ts:110; packages/data/nl2sql | grilling |
| H8 | classifyExecutionFailure hardcodes ODPS error codes + Chinese markers; verdict_mapper diverges (English-only) -> silent wrong eval scoring on other engines/languages | d1,d5 | packages/eval/eval/src/classify_failure.ts:40; packages/eval/eval/src/classify_failure.ts:56; packages/eval/eval/src/classify_failure.ts:58; packages/eval/eval/src/classify_failure | CL |

**H1 Engine-conventions abstraction is fake: only maxcompute conventions exist, empty shape for other engines, maxcompute defaulted everywhere, literal dialect rules baked into prompts/critic/metric-engine**

- 维度: d1, d2, d8
- 文件: packages/data/nl2sql-engine/src/prompt.ts:111; packages/data/nl2sql-engine/src/prompt.ts:113; packages/data/nl2sql-engine/src/prompt.ts:188; packages/data/nl2sql-engine/src/prompt.ts:190; packages/data/nl2sql-engine/src/engine.ts:160; packages/data/nl2sql-engine/src/engine.ts:49; packages/data/nl2sql-engine/src/engine.ts:217; packages/data/nl2sql-engine/src/types.ts:37; packages/data/nl2sql-engine/src/types.ts:167; packages/data/nl2sql-engine/src/critic.ts:74; packages/data/nl2sql-engine/src/critic.ts:233; packages/data/nl2sql-engine/src/metric-engine.ts:139; packages/data/nl2sql-engine/src/metric-engine.ts:158; packages/query/query-maxcompute/src/conventions.ts:77; packages/data/phase-gate/src/phase-gate.ts:136
- 类型: **G-ticket**
- 换场景影响: On PostgreSQL/Snowflake/ClickHouse/Hive the LLM is told to emit GET_JSON_OBJECT/MAX_PT/ds= predicates that error or silently full-scan; loadConventions returns an EMPTY shape for any non-maxcompute engine so the model gets zero dialect grounding ('（无 conventions）'); the critic false-warns 'missing ds partition' on valid non-ODPS SQL and fail-opens the json_field guard (extractJsonPaths only matches GET_JSON_OBJECT).
- 建议动作: Implement a per-engine conventions registry (each engine ships its own conventions.yaml); move partition-column name + JSON-access UDF + date-function idiom out of literal prompt rules into conventions (the functions/cast_map/sql_templates seam is already wired); default conventions to null and require the caller (bundle/eval-runner) to inject the correct engine's conventions; fail-loud (throw) on an unknown engine instead of silently returning empty. Drop PARTITION_COLUMNS constant and the ['ds'] defaults; rely on schema-provided partitionCols.

**H2 No engine registry/factory: MaxComputeQueryEngine is the only provider; bundle + eval-cli hard-import maxcompute; tool descriptions say 'MaxCompute SQL'**

- 维度: d2, d1
- 文件: packages/query/query/src/index.ts:38; packages/bundle/data-agent/cordis.patch.yml:106; packages/bundle/data-agent/cordis.patch.yml:116; packages/bundle/data-agent/cordis.patch.yml:118; packages/bundle/data-agent/cordis.patch.yml:125; packages/eval/eval-cli/src/context.ts:413; packages/eval/eval-cli/src/context.ts:405; packages/query/query-tool/src/index.ts:297; packages/query/query-tool/src/index.ts:308; packages/query/query-tool/src/index.ts:313; packages/query/query-tool/src/index.ts:342; packages/data/tool-critique-sql/src/index.ts:182; packages/data/phase-gate/src/phase-gate.ts:364
- 类型: **G-ticket**
- 换场景影响: Switching engines requires editing the bundle to a provider package that does not exist (no PostgreSQL/Snowflake/ClickHouse/Hive provider shipped; MaxComputeQueryEngine is the only 'extends QueryEngine' subclass in the repo); the pluggable ctx.query seam is theoretical with exactly one implementation. The model-facing query_data/critique_sql descriptions and the TABLE_NOT_FOUND 'ODPS project' guidance all hardcode MaxCompute, biasing generation regardless of engine.
- 建议动作: Ship at least one second engine provider (e.g. dsh-query-postgres) with its own conventions.yaml to prove the seam and surface hidden coupling; make the bundle's query-engine mount a deployment-configurable row (engineType) instead of a hardcoded package name; parameterize the eval-cli engine import by a config-driven engine name (and make DASHSCOPE_API_KEY conditional on the chosen provider); use engine-neutral wording ('SQL' / 'per-scope access-isolation boundary' / 'qualifier or schema') in tool descriptions and TABLE_NOT_FOUND guidance.

**H3 Semantic-layer TableDefinition schema + sync-write generators bake K11/MaxCompute/Chinese defaults**

- 维度: d3, d1
- 文件: packages/data/semantic-layer/src/types.ts:270; packages/data/semantic-layer/src/types.ts:278; packages/data/semantic-layer/src/types.ts:283; packages/data/semantic-layer/src/types.ts:288; packages/data/semantic-layer/src/types.ts:291; packages/data/semantic-layer/src/io.ts:498; packages/data/semantic-layer/src/io.ts:525; packages/data/semantic-layer/src/io.ts:545; packages/data/semantic-layer/src/io.ts:548; packages/data/semantic-layer/src/io.ts:551; packages/data/semantic-layer/src/io.ts:559; packages/data/semantic-layer/src/io.ts:560; packages/data/semantic-layer/src/io.ts:655
- 类型: **G-ticket**
- 换场景影响: A bare PostgreSQL/Snowflake/Hive metastore sync-write produces table YAMLs tagged engine='maxcompute' + kind='dws' (no 'ods'); DIMs whose PK isn't a _id column or whose label isn't a STRING _name/_desc fail superRefine and are silently dropped (starving join discovery); non-Chinese freshness labels ('daily','real-time') are rejected by the enum; column roles collapse to 'attribute' because inferRole matches only MaxCompute uppercase types (BIGINT/INT/DOUBLE/STRING), not PG text/integer or Snowflake NUMBER/VARCHAR.
- 建议动作: Remove the 'maxcompute' engine default (make engine optional/empty and thread the source engine through generateTableYaml/generateDimYaml from the connector); add 'ods' (or 'entity'/'flat') to the kind enum and default untagged imports to 'ods' (enrichAllDwsTables skips kind==='ods'); relax freshness to free text or add English tokens ('static','T+1','daily','realtime') with localization at the presentation layer; accept explicit primary_key/label_columns hints from the connector (information_schema.table_constraints) and loosen _id/_name heuristics; apply canonicalizeType inside inferRole before matching and reconcile MEASURE_TYPES with the canonical vocabulary.

**H4 Enrichment pipeline hard-wired to DWS/DIM star-schema; non-star scopes silently get empty enrichment that wipes curated refs**

- 维度: d7, d3
- 文件: packages/data/semantic-layer/src/enrichment.ts:226; packages/data/semantic-layer/src/enrichment.ts:230; packages/data/semantic-layer/src/enrichment.ts:311; packages/data/semantic-layer/src/enrichment.ts:316; packages/data/semantic-layer/src/enrichment.ts:71; packages/data/semantic-layer/src/enrichment.ts:144; packages/data/semantic-layer/src/enrichment.ts:151; packages/data/semantic-layer/src/enrichment.ts:336; packages/data/semantic-layer/src/enrichment.ts:343; packages/data/semantic-layer/src/enrichment.ts:362; packages/data/semantic-layer/src/enrichment.ts:377; packages/data/semantic-layer/src/types.ts:278; packages/data/tool-discover-relations/src/index.ts:184; packages/data/tool-discover-relations/src/index.ts:221
- 类型: **G-ticket**
- 换场景影响: On flat-wide / event-sourced / denormalized-OLTP scopes the DIM inventory is empty (buildDimInventory scans only kind==='dim'), so discover_relations returns enriched:0 and (in replace mode, the discover_relations tool default) writes dimension_refs:[] to every table, destroying human-curated joins with no signal the schema model doesn't fit. Even in a valid star schema, surrogate/FK columns named differently from the referenced PK (fact.user_id -> dim_user.id, the common real-world case) get zero deterministic relations.
- 建议动作: Generalize the joinable inventory to any table with a non-empty primary_key (not only kind='dim'); accept a configured FK->PK map / FK-naming heuristic (column ends in _id/_key and equals a dim PK) alongside exact-name match; rewrite buildLlmPrompt/buildEventLlmPrompt to be schema-model-agnostic ('discover join relations between this table and the others listed below') with a generic table inventory; default mergeExisting=true so discovery never wipes curated refs it does not rediscover; short-circuit with a clear message ('no joinable dimension tables found; skipping') when the inventory is empty. Mirror the same generalization on the event->table/event->event path.

**H5 Eval runner + bundle hardcode K11 scope/regex/caseDir/defaultProject/semanticRoot/today**

- 维度: d1, d5, d8
- 文件: packages/eval/eval-runner-service/src/index.ts:391; packages/eval/eval-runner-service/src/index.ts:418; packages/eval/eval-runner-service/src/index.ts:379; packages/eval/eval-runner-service/src/index.ts:384; packages/bundle/data-agent/cordis.patch.yml:162; packages/bundle/data-agent/cordis.patch.yml:178; packages/bundle/data-agent/cordis.patch.yml:125
- 类型: **G-ticket**
- 换场景影响: The k11_ filename regex rejects any non-K11 case file (and even the live k11v2_* files, so the default config is stale) -> getCaseCount()=0 -> runBatch throws 'no cases found'; scopeId='k11' stamps every case to one fixed scope so multi-scope/multi-tenant eval is impossible; the autonomous-loop no-progress backstop judges improvement against the K11 game case set for any deployment that doesn't override; today='20260825' is a stale fixed reference date.
- 建议动作: Replace the k11_ regex with the generic glob eval-cli already uses (*.yaml/*.yml/*.json); make caseDir + scopeId + defaultProject + semanticRoot required deployment-time fields with no K11 default (fail-loud when unset); read scope_id per-case from input.scope_id rather than stamping 'k11'; default today to the real current date. Ship a non-K11 example case set.

**H6 Cross-tenant leak cascade from global scope: scope-hint/list-scopes expose all scopes; tool-retrieve serves stale prior-scope corpus; evidence-query eval store is unscoped; InProcRetrieval holds a frozen corpus**

- 维度: d6
- 文件: packages/data/tool-scope-routing/src/scope-hint.ts:66; packages/data/tool-scope-routing/src/list-scopes.ts:42; packages/data/tool-retrieve/src/index.ts:124; packages/data/tool-retrieve/src/index.ts:134; packages/data/tool-retrieve/src/index.ts:141; packages/data/evidence-query/src/index.ts:101; packages/data/evidence-query/src/index.ts:150; packages/data/evidence-query/src/index.ts:245; packages/retrieval/retrieval-inproc/src/index.ts:57
- 类型: **G-ticket**
- 换场景影响: Tenant A's agent sees tenant B's scope names/descriptions/aliases (system prompt scope-awareness section + list_scopes output) and the alias-hint can auto-suggest switching to another tenant's scope; tool-retrieve's enrichedLinkers WeakMap has no corpusVersion() check so it serves the prior scope's data-source candidates after a switch; evidence-query's eval store loads all JSONL into one list with no scope field so scope B's coverage masks scope A's gaps in gapAnalysis/assetHealth.
- 建议动作: Filter scopes.list() by requesting tenant (add a tenant field to ScopeDefinition, gate list/get/setActive server-side); port the corpusVersion() check from tool-search-data-sources into tool-retrieve's enrichedLinkers (WeakMap<SchemaCorpusSource,{linker,version}>, prefer loadRetrievalCorpusAll?.()); stamp EvalResultRecord with scope_id and filter by it, re-resolving resultsDir on scope switch; give InProcRetrieval a SchemaCorpusSource it can re-probe via corpusVersion() rather than snapshotting at construction. (Root fix is the per-request scope context in the critical G-ticket above.)

**H7 Chinese-only keyword lexicons + CJK-bracket-only marker regex break English/Japanese trend/time-param/marker parsing**

- 维度: d2, d4
- 文件: packages/data/nl2sql-engine/src/metric-engine.ts:97; packages/data/nl2sql-engine/src/metric-engine.ts:99; packages/data/nl2sql-engine/src/metric-engine.ts:110; packages/data/nl2sql-engine/src/granularity.ts:13; packages/data/nl2sql-engine/src/granularity.ts:25; packages/data/phase-gate/src/domain.ts:47; packages/data/phase-gate/src/domain.ts:52; packages/data/phase-gate/src/domain.ts:71; packages/data/phase-gate/src/domain.ts:82; packages/data/phase-gate/src/phase-gate.ts:862
- 类型: **grilling**
- 换场景影响: English/Japanese questions get no time-param WHERE filter from extractTimeParams (-> full-table scans / wrong date ranges, silently wrong results) and trend intent is missed (snapshot _df tables chosen over daily _di; rule 9 + granularity reranker never fire). If the honest-decline/route markers are localized without updating both prompt AND parser in lockstep, ROUTE_MARKER_REGEX (CJK-bracket-only) silently stops matching -> agent fabricates (loses decline path) or defaults to proceed blindly.
- 建议动作: DECISION TO GRILL: (a) locale-aware lexicon maps (locale->synonym arrays) sourced from i18n config + broaden ROUTE_MARKER_REGEX to accept both 【route:...】 and [route:...]/<route:...> with markers as locale-keyed constants shared by prompt+parser; vs (b) replace keyword regexes with an LLM intent classifier for trend/time-param. Add English/Japanese trend+time words (trend, growth, WoW, MoM, 推移, 変化, 週次, 増減) regardless, and drive the _di daily signal from payload.granularity rather than the _di name suffix.

**H8 classifyExecutionFailure hardcodes ODPS error codes + Chinese markers; verdict_mapper diverges (English-only) -> silent wrong eval scoring on other engines/languages**

- 维度: d1, d5
- 文件: packages/eval/eval/src/classify_failure.ts:40; packages/eval/eval/src/classify_failure.ts:56; packages/eval/eval/src/classify_failure.ts:58; packages/eval/eval/src/classify_failure.ts:60; packages/eval/eval-runner/src/verdict_mapper.ts:94; packages/eval/eval-runner/src/verdict_mapper.ts:108
- 类型: **CL**
- 换场景影响: On Snowflake/Postgres/BigQuery genuine syntax errors / table-not-found carry non-ODPS messages (e.g. 'syntax error at or near', 'relation does not exist') that match none of the ODPS patterns and fall to the default 'infrastructure' class (refuse/not-score/resubmittable) -> real SQL defects go unjudged. Chinese decline/infra strings are missed by the English-only verdict_mapper -> declines mislabeled 'wrong'. Silent wrong scoring on any engine or language switch.
- 建议动作: Add per-engine error-pattern sets (a FailureClassifier interface or config map of dialect->regex list) with Postgres/Snowflake/BigQuery strings ('syntax error at or near', 'relation .* does not exist', 'column .* does not exist', 'permission denied'); add English patience phrases ('patience','still running','abandoned') to PATIENCE_MARKERS; add Chinese decline phrases ('无法回答','不能回答','拒绝') to verdict_mapper. Best: have the engine stamp a structured FailureClass/decline flag consumed by both layers so the two sites stop diverging.

### 🟡 Medium（15）

- **M1 [CL] getRelationGraph throws on a single dangling domain->concept reference, crashing schema-gateway for ALL assets**
  - 文件: packages/data/semantic-layer/src/index.ts:339
  - 影响: In a multi-scope/multi-tenant deployment, one table carrying a stale domain from another scope (or a partially-curated concepts/ catalog) makes getRelationGraph() throw in a cached getter with no try/catch -> the schema-gateway getGraphData endpoint and every join-path consumer crash for ALL assets, not just the offending one.
  - 建议: Skip the dangling domain entry (or the offending asset) with ctx.logger.warn and continue building the graph for the remaining assets; collect dangling references into a separate validation report surfaced via a health-check endpoint rather than aborting the whole graph on one bad reference.

- **M2 [CL] Trend-comparison classifyCase hardbound to k11-v2 '_alias_'/'_voice_' naming; default cases dir k11-v2**
  - 文件: packages/eval/eval-cli/src/compare.ts:38; packages/eval/eval-cli/src/compare.ts:75; packages/eval/eval-cli/src/compare.ts:76; packages/eval/eval-cli/src/compare.ts:130
  - 影响: Non-K11 case_ids carry no '_alias_'/'_voice_' substring so every case buckets as 'Original' -> the per-category delta table (the tool's stated purpose) collapses to one row and category-level trends are invisible; loadDeliveryCaseIds reads a meaningless k11-v2 dir. Overall pass-rate delta and case-level flips still work, so degraded not broken.
  - 建议: Drive categories from case dimensions (group by dimensions.query_intent or dimensions.sql_complexity) loaded from whatever case dir the runs reference, instead of substring-matching k11v2_* ids; make cases-dir a required parameter (not a hardcoded k11-v2 default); derive category keys from actual case metadata.

- **M3 [CL] text_sim char-trigram threshold 0.35 is CJK-calibrated and not injectable; wrong-direction English prose can pass**
  - 文件: packages/eval/eval/src/text_sim.ts:23; packages/eval/eval/src/text_sim.ts:29; packages/eval/eval/src/text_sim.ts:39
  - 影响: For English/whitespace-delimited scopes, 0.35 char-trigram overlap is far too lenient: antonym pairs like 'revenue increased' vs 'revenue decreased' share enough trigrams to clear the DELIVERY_THRESHOLD -> a wrong-direction prose answer passes a terminal assertion (silent false-positive). The derailment threshold is not injectable, so it cannot be tightened per language without editing source.
  - 建议: Make DERAILMENT_THRESHOLD injectable (thread an opts param like DeliveryFuzzyOpts); add a language-aware threshold preset (higher, e.g. 0.55, for whitespace-delimited languages) and consider word-level token overlap for English while keeping char-trigrams for CJK.

- **M4 [CL] BM25 tokenizer + alias-term extractor silently drop Japanese hiragana/katakana**
  - 文件: packages/data/nl2sql-engine/src/bm25-linking.ts:72; packages/data/tool-search-data-sources/src/index.ts:303
  - 影响: Japanese queries written in kana (e.g. 'デイリーアクティブユーザー') lose all kana tokens; only the kanji portion is indexed -> BM25 recall and alias-fusion resolution degrade for Japanese business vocabulary (English/Chinese unaffected).
  - 建议: Broaden the CJK regex to include hiragana/katakana ranges (\u3040-\u309F\u30A0-\u30FF) at both sites, or route term extraction through a single pluggable tokenizer (nodejieba/kuromoji per the module's own TODO) exposed via the P5 ctx.retrieval seam so both sites stay consistent.

- **M5 [CL] mergeRefs classifies derivation source by Chinese prefix '确定性' -> locale-coupled merge precedence**
  - 文件: packages/data/semantic-layer/src/enrichment.ts:118; packages/data/semantic-layer/src/enrichment.ts:76; packages/data/semantic-layer/src/enrichment.ts:348
  - 影响: If the deterministic derivation text is localized to English ('Deterministic: DWS column ... matches ... primary key'), startsWith('确定性') returns false, so the merge logic no longer recognizes it as the generic derivation -> LLM/semantic derivations fail to override deterministic ones (or human-curated derivations get clobbered); merge precedence silently changes behavior under localization.
  - 建议: Add a structured `source` field to DimensionRef ('deterministic'|'llm'|'curated') and branch on that instead of the Chinese string prefix; localize the derivation display text separately from the source classification.

- **M6 [CL] phase-gate scopeId defaults to 'game-1' with a game-domain docstring**
  - 文件: packages/data/phase-gate/src/index.ts:70; packages/data/phase-gate/src/phase-gate.ts:152; packages/data/phase-gate/src/domain.ts:231
  - 影响: A deployment that doesn't set scopeId gets 'game-1' as the per-agent phase-gate state root and the id surfaced to scope routing/multi-scope logic, leaking a game-specific id that may collide with real scope ids or mislabel the active scope.
  - 建议: Default scopeId to a neutral value ('default'/'primary') or make it required; update the docstring to a domain-neutral example.

- **M7 [CL] B (free-ReAct+planning) preset ships 'per-game analytics platform' persona text by default**
  - 文件: apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24
  - 影响: A non-game deployment that selects the B variant inherits the wrong 'per-game' persona until an operator notices and overrides the text field; the model is mis-framed until then.
  - 建议: Replace the shipped persona text with a domain-neutral template parameterized by a {{domain}} prompt variable (resolved from scope/deployment config), or document that deployments must override `text`.

- **M8 [CL] LLM provider/model default to Qwen/DashScope (aga/qwen3.7-max) across enrichment + eval + expansion with no fail-loud**
  - 文件: packages/data/semantic-layer/src/llm-wiring-plugin.ts:36; packages/data/semantic-layer/src/llm-wiring-plugin.ts:37; packages/data/tool-search-data-sources/src/expand-query.ts:27; packages/data/tool-search-data-sources/src/expand-query.ts:28; packages/eval/eval-runner-service/src/index.ts:382; packages/eval/eval-runner-service/src/index.ts:383; packages/eval/eval-cli/src/main.ts:65; packages/eval/eval-cli/src/main.ts:66
  - 影响: Out-of-box the enrichment/eval/expansion LLM calls target a China-specific gateway/model; a non-China deployment silently uses the wrong defaults (or fails on an unavailable model) unless every layer is overridden, with no fail-loud signal.
  - 建议: Centralize the default LLM provider/model in one deployment config consumed by all layers; default to empty and fail-loud ('enrichment-llm-wiring: no provider/model configured') rather than silently falling back to a region-specific gateway.

- **M9 [CL] renderConventionsPrompt bakes Chinese section headers/labels into the rendered dialect cheatsheet**
  - 文件: packages/data/nl2sql-engine/src/conventions.ts:33
  - 影响: Even when the conventions YAML data is English, the rendered section headers ('## 方言速查', '## 可用函数', '\| 逻辑类型 \| 含义 \| 写法 \|') and the null placeholder '（无 conventions）' stay Chinese -> an English-deployment prompt is English data under Chinese headers, harder for an English-optimized LLM to parse.
  - 建议: Externalize the render template (headers, labels, placeholders) as a locale bundle; the conventions data (key_differences, functions, cast_map, sql_templates) is already engine-provided and locale-neutral.

- **M10 [CL] tool-suggest-followups enforces a '≤ 8 Chinese characters' label constraint**
  - 文件: packages/data/tool-suggest-followups/src/index.ts:63; packages/data/tool-suggest-followups/src/index.ts:73
  - 影响: For English labels '8 Chinese characters' is the wrong unit (English needs ~3-6 words / a higher char budget); Japanese mixed kanji/kana may not fit the 'Chinese characters' framing -> over-truncated labels.
  - 建议: Replace 'Chinese characters' with a locale-neutral 'short label (≤ ~20 chars / ≤ 4 words)'; let the UI enforce display width rather than a character count.

- **M11 [CL] phase-gate INTERPRETATION instruction embeds Chinese markers 【发现】/【注意】 as required output tokens**
  - 文件: packages/data/phase-gate/src/phase-gate.ts:118
  - 影响: An English enterprise is told (in English) to emit Chinese words '发现'/'注意' as literal markers in its delivery -> unexplained foreign tokens in user-facing output; if a future parser matches them, they join the domain.ts marker-localization hazard.
  - 建议: Make these markers locale-configurable alongside INCOMPLETE_MARKER/DECOMPOSITION_MARKER (shared bundle), or replace with locale-neutral symbols ([insight], [caveats]).

- **M12 [CL] tool-load-event-definition embeds a Chinese '埋点' gloss in an otherwise English description**
  - 文件: packages/data/tool-load-event-definition/src/index.ts:354
  - 影响: For an English enterprise the parenthetical '埋点' is unexplained foreign text in an English tool description (minor confusion; the tool works because the rest is English and clear).
  - 建议: Drop the Chinese gloss or replace with a locale-neutral term ('instrumented event'/'tracking event'), or localize via a bundle.

- **M13 [CL] generate-k11.mjs is a K11-only case generator; no portable generator exists**
  - 文件: packages/eval/eval/cases/generate-k11.mjs:8; packages/eval/eval/cases/generate-k11.mjs:13; packages/eval/eval/cases/generate-k11.mjs:17; packages/eval/eval/cases/generate-k11.mjs:21; packages/eval/eval/cases/generate-k11.mjs:56
  - 影响: To bootstrap cases for e-commerce/finance/SaaS you must rewrite this script from scratch (new table dir, project id, intent vocabulary, language); generated cases also stamp placeholder result_values that must be hand-corrected per scope.
  - 建议: Either document generate-k11.mjs as a K11-only throwaway and ship a scope-agnostic case generator that takes a semantic-layer dir + locale + intent list as config, or remove it from the portable surface and ship only the schema + a case-loader; externalize the project-id regex, table-prefix filters, and question language into parameters.

- **M14 [CL] Semantic-layer snapshot cache is unbounded (never evicted)**
  - 文件: packages/data/semantic-layer/src/snapshot.ts:173; packages/data/semantic-layer/src/snapshot.ts:211
  - 影响: As scopes are added/removed over a long-lived process, the tables/events/corpus arrays for every previously-visited scope accumulate in memory indefinitely (leak, not a data-integrity issue - version keys prevent stale serving to the wrong scope).
  - 建议: Bound the cache (LRU) or clear entries for a scope when it is removed from the registry (listen to scopes/changed). Low priority since it is a leak, not a data-integrity issue.

- **M15 [CL] eval-cli duplicates the Chinese game-specific expansion prompt + renders a Chinese [粒度] label**
  - 文件: packages/eval/eval-cli/src/context.ts:221; packages/eval/eval-cli/src/context.ts:375
  - 影响: Eval runs for an English enterprise use the same Chinese game-domain expansion prompt as production, so eval retrieval measurements don't reflect an English deployment's actual recall; the [粒度] label adds Chinese noise to the SQL judge's schema context.
  - 建议: Import the expansion prompt from expand-query.ts (single source) once it is externalized per the prompt-i18n G-ticket; localize or drop the [粒度] label.

### ⚪ Low（3）

- **L1 [CL] Executor contract is ODPS-named (OdpsExecutor/StandInOdps) despite being engine-agnostic**
  - 文件: packages/data/nl2sql-engine/src/engine.ts:109; packages/data/nl2sql-engine/src/engine.ts:150; packages/data/nl2sql-engine/src/engine.ts:290; packages/data/nl2sql-engine/src/stand-in-odps.ts:19; packages/data/nl2sql-engine/src/stand-in-odps.ts:29
  - 影响: A PostgreSQL/Snowflake executor must implement an interface called OdpsExecutor - misleading naming that signals ODPS-first design (no functional break; the contract execute/attach -> 3-state QueryOutcome is already generic).
  - 建议: Rename OdpsExecutor -> SqlExecutor and the field odps -> executor; the method signatures are already generic.

- **L2 [CL] EngineConventions type + loadConventions imported from the maxcompute package into engine-agnostic code (leaky abstraction)**
  - 文件: packages/data/nl2sql-engine/src/index.ts:29; packages/data/nl2sql-engine/src/prompt.ts:18
  - 影响: Type/build dependency on the maxcompute package leaks through; nl2sql-engine cannot stand alone without the maxcompute package present, and conventionsEngine defaults to 'maxcompute' (no runtime break because conventions are injected via the seam).
  - 建议: Move EngineConventions + loadConventions into the abstract @deepseek-ai/dsh-query package (or a shared dsh-conventions module) so nl2sql-engine depends on the seam, not the maxcompute implementation.

- **L3 [CL] B->A layout autoFlipThreshold not exposed in any host config (stuck at K11-tuned default 3)**
  - 文件: packages/client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:23; packages/client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:47; packages/client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:51; packages/client/ui-semantic-layer/src/client/index.ts:139
  - 影响: A non-K11 deployment cannot tune when the semantic-layer UI flips from workspace-first (B) to dashboard-first (A); the K11-tuned threshold of 3 eval runs is effectively a hardcoded magic number in practice (UI presentation only, not correctness).
  - 建议: Expose `autoFlipThreshold` and `layoutMode` as config fields on the ui-semantic-layer host plugin and pass them through the `injected()` props at client/index.ts:139.

## 2. 跨维度模式（G 票根因）

1. Chinese-only prompts with no i18n/templating seam (NL2SQL generation, BM25 query expansion, SQL semantic judge, resolve_term, conventions render, DIM/event derivation strings) - d1,d2,d3,d4,d5,d7
2. MaxCompute-dialect SQL assumptions baked into engine-agnostic code (ds partition + MAX_PT + GET_JSON_OBJECT + ODPS error codes + 'ODPS project' qualifyTable vocabulary) - d1,d2,d4,d5,d8
3. No real engine registry/factory: MaxComputeQueryEngine is the only provider; bundle/eval-cli hard-import it; tool descriptions say 'MaxCompute SQL' - d1,d2
4. Single global active-scope + no per-request/per-tenant context -> cross-tenant data/metadata leak, unscoped eval store, stale post-switch caches - d6
5. DWS/DIM star-schema assumption in enrichment + TableDefinition kind enum (no ods/entity/flat); non-star scopes silently get empty enrichment that wipes curated refs - d3,d7
6. K11 scopeId + k11_ filename regex + k11 caseDir/semanticRoot/defaultProject defaults across eval-runner + bundle + phase-gate - d1,d5,d8
7. Qwen/DashScope (aga/qwen3.7-max) baked as default LLM across enrichment/eval/expansion with no fail-loud - d1,d7
8. Game-domain persona baked into NL2SQL prompt, expansion prompt, phase-gate BASE_PERSONA, B-preset - d1,d2,d4,d8
9. Chinese-only keyword lexicons + CJK-bracket-only marker regex for trend/time-param/honest-decline parsing - d2,d4
10. Chinese literal metadata in schema enums/derivation strings (freshness '静态参考', mergeRefs '确定性' prefix, DIM '静态参考'/'维表(非分区,全量参考,无时间维度)') - d1,d3,d4,d7
11. K11 naming-suffix heuristics (_id primary_key, _name label_column, _di daily-granularity, _df snapshot) drive schema generation + granularity rerank - d2,d3

## 3. 系统性架构缺陷（建议开 G 票）

Seven systematic architecture defects couple the dsh-data-agent semantic layer to the K11/MaxCompute/Chinese-game/single-scope scenario: (1) a theoretical engine seam where MaxCompute is the only real path and ODPS dialect is hardcoded across the supposedly-agnostic prompt/critic/metric-engine; (2) no i18n/templating layer, with Chinese-only prompts, judges, parsers, and tokenizers that drop Japanese kana; (3) a non-overridable game-domain persona baked into the phase-gate plugin and prompts with no domain-injection seam; (4) an enrichment pipeline that assumes a DWS/DIM star-schema throughout and silently no-ops (or wipes curated joins) on non-star schemas; (5) a single global active-scope pointer with no tenant/request isolation, plus stale caches that survive a scope switch; (6) a K11-bound eval framework (case-discovery regex, hardcoded scopeId, ODPS-only failure classification, k11v2 trend bucketing); and (7) build-time-only LLM provider resolution where DashScope/Qwen is hard-imported and hard-exited on.

### G1 [critical/G-ticket] Engine abstraction is theoretical: MaxCompute is the only real path and ODPS dialect is hardcoded across the supposedly-agnostic SQL-generation layer

**影响维度**: d1, d2

**描述**: The QueryEngine seam (packages/query/query) and the EngineConventions/renderConventionsPrompt seam are presented as engine-agnostic, but in practice there is exactly one engine path. MaxComputeQueryEngine is the only concrete subclass; loadConventions returns an EMPTY convention set for any non-maxcompute engine (a silent no-op, not a route); the nl2sql-engine package hard-imports loadConventions and EngineConventions from the maxcompute-specific package; and the SQL-generation prompt/critic/metric-engine hardcode ODPS dialect (ds partition + MAX_PT, GET_JSON_OBJECT, TO_CHAR/GETDATE/DATEADD regexes, ['ds'] partition fallback) in literal text rather than driving from the injected conventions. The net effect: switching to PostgreSQL/Snowflake/ClickHouse/Hive produces wrong SQL (function-not-found, nonexistent partition columns) with no error signal, because (a) no second engine exists to switch to, and (b) even if one did, the prompt/critic/metric text would still instruct the model to emit MaxCompute SQL. The conventions YAML seam is wired but the literal rules are not engine-driven.

**证据**:
- packages/query/query/src/index.ts:38 - MaxComputeQueryEngine is the ONLY concrete subclass (grep 'extends QueryEngine' matches only query-maxcompute); the pluggable seam has no second implementation
- packages/query/query-maxcompute/src/conventions.ts:77 - loadConventions returns {key_differences:[],functions:[],cast_map:[],sql_templates:[]} for any engine!=='maxcompute' (silent no-op, not a route); comment admits 'Single-engine (maxcompute) today'
- packages/data/nl2sql-engine/src/index.ts:29 - hard-imports loadConventions + EngineConventions from @deepseek-ai/dsh-query-maxcompute; conventionsEngine defaults to 'maxcompute'
- packages/data/nl2sql-engine/src/engine.ts:160 - defaults conventions to loadConventions('maxcompute') when none injected
- packages/data/nl2sql-engine/src/prompt.ts:111 - rule 1 hardcodes ds=yyyyMMdd partition + MAX_PT; rule 3 hardcodes GET_JSON_OBJECT(params,$.field); buildEvalPrompt:175 says 'generate a MaxCompute SQL'
- packages/data/nl2sql-engine/src/metric-engine.ts:139 - buildTimeFilterHint emits MAX_PT()/ds= fragments; :158 hardcodes 'WHERE ds = ...'
- packages/data/nl2sql-engine/src/critic.ts:74 - extractJsonPaths matches only GET_JSON_OBJECT; :233 finding message hardcodes 'ds/dt'
- packages/data/nl2sql-engine/src/engine.ts:217 - partitionCols fallback defaults to ['ds']; types.ts:37 PARTITION_COLUMNS hardcodes ODPS names
- packages/data/semantic-layer/src/types.ts:270 - TableDefinitionSchema defaults engine='maxcompute'; generateTableYaml/generateDimYaml omit engine so every imported table inherits maxcompute
- packages/bundle/data-agent/cordis.patch.yml:106 - bundle mounts only @deepseek-ai/dsh-query-maxcompute; no engine-selection switch/registry

**推荐**: (1) Ship at least one second engine provider (e.g. dsh-query-postgres) with its own conventions.yaml to prove the seam is real and surface hidden coupling. (2) Move EngineConventions + loadConventions into the abstract dsh-query package (or a shared dsh-conventions module) and have each engine register its own conventions.yaml; fail-loud (throw) on unknown engine rather than returning empty. (3) Drive the partition-column name, JSON-access UDF, and time-filter idiom from per-engine conventions (the functions/cast_map/sql_templates fields already exist) instead of literal prompt rules; default conventions to null and require the caller to inject. (4) Make date-normalization and JSON-path extraction engine-aware (delegate to a per-engine normalizer).

### G2 [critical/G-ticket] No i18n/templating layer: NL2SQL prompt, BM25 query-expansion, SQL semantic judge, trend-intent, phase-gate markers, and tokenizers are Chinese-only with no locale seam

**影响维度**: d2, d4, d5, d7

**描述**: There is no prompt-template registry or locale bundle anywhere in the system. The core NL2SQL generation prompt, the production BM25 query-expansion prompt, the SQL semantic judge prompt, and the resolve_term tool description are authored entirely in Chinese with no interpolation layer. Trend-intent detection and time-param extraction use Chinese-only keyword regexes (no English/Japanese equivalents), so English/Japanese queries silently get no time filter and no trend-granularity reranking. The phase-gate honest-decline/route protocol hardcodes Chinese marker tokens (【拆解】/【未完成】) parsed by a CJK-bracket-only regex, with no shared source of truth between the prompt that teaches the token and the parser that matches it - a localizer who changes only the prompt silently breaks the gate. The BM25 tokenizer and alias-term extractor match CJK Unified Ideographs but silently drop Japanese hiragana/katakana. mergeRefs identifies deterministic derivations by sniffing the Chinese prefix '确定性'. The freshness enum rejects English values. The coupling is structural: there is no i18n seam at all, so localizing requires editing prompt text and parser constants in lockstep across many files.

**证据**:
- packages/data/nl2sql-engine/src/prompt.ts:84 - generation prompt entirely Chinese (persona, SOP, eight rules, tool catalog); no i18n/templating layer; only dialect slice externalized
- packages/data/tool-search-data-sources/src/expand-query.ts:11 - EXPANSION_SYSTEM_PROMPT Chinese + game, instructs '中文同义词', enabled by default (config.queryExpansion!==false)
- packages/eval/eval-runner/src/sql_semantic_judge.ts:70 - judge prompt Chinese; aggregation_logic anchors to K11 '总量/趋势/分布/占比' intent vocabulary
- packages/data/nl2sql-engine/src/granularity.ts:13 - TREND_PATTERN Chinese-only; detectTrendIntent returns false for English/Japanese
- packages/data/nl2sql-engine/src/metric-engine.ts:97 - extractTimeParams recognizes only Chinese date words (昨天/今天/上周/本月)
- packages/data/phase-gate/src/domain.ts:47 - DECOMPOSITION_MARKER='【拆解】', INCOMPLETE_MARKER='【未完成】', ROUTE_MARKER_REGEX matches only CJK brackets; prompt and parser share no config
- packages/data/nl2sql-engine/src/bm25-linking.ts:72 - tokenize matches /[一-鿿]+/ only; hiragana/katakana dropped
- packages/data/tool-search-data-sources/src/index.ts:303 - extractQueryTerms cjkRe excludes kana
- packages/data/semantic-layer/src/enrichment.ts:118 - mergeRefs sniffs ex.derivation.startsWith('确定性') (Chinese prefix)
- packages/data/semantic-layer/src/types.ts:283 - freshness enum ['静态参考','T+1',''] rejects English/Japanese labels
- packages/data/nl2sql-engine/src/conventions.ts:33 - renderConventionsPrompt bakes Chinese section headers/labels into the rendered cheatsheet

**推荐**: Introduce a prompt-template registry keyed by locale (zh/en/ja) + domain with {{persona}}, {{rules}}, {{tool_catalog}} interpolation groups mirroring the conventions seam. Externalize SOP/rules/tool-catalog/judge-prompt/expansion-prompt as locale-neutral structured data rendered through locale bundles. Replace Chinese keyword regexes (trend, time-params, markers) with locale-keyed lexicon maps loaded from a bundle, and broaden ROUTE_MARKER_REGEX to accept ASCII variants. Broaden the BM25/alias tokenizer to include hiragana/katakana ranges (or plug a real morphological tokenizer via ctx.retrieval). Replace the '确定性' prefix sniff with a structured derivation_source field on DimensionRef. Relax the freshness enum to free text or locale-neutral tokens with localized rendering at the presentation layer.

### G3 [high/G-ticket] Game-domain persona and conventions are baked into the phase-gate plugin and prompts with no domain-injection seam

**影响维度**: d1, d2, d4, d8

**描述**: The agent's core identity is hardcoded to the K11 game domain at multiple layers with no config field to override it. The phase-gate plugin OWNS the management persona (BASE_PERSONA = 'You are a data agent for a per-game analytics platform') as a const registered verbatim, and the PhaseGateConfig schema exposes scopeId/budget knobs but NO persona-text field, so the A/C default preset's persona is non-overridable without forking the package. PHASE_INSTRUCTIONS bake game-specific ods_*/dws_* table patterns, game.role.online event names, and DAU/MAU/pay_amt metrics. The NL2SQL generation prompt opens with the persona '你是游戏埋点数据分析 Agent' and rule 2 bakes a game-telemetry dedup mapping (character->role_id, account->account_id) that references columns nonexistent in e-commerce/finance/SaaS. The production BM25 query-expansion persona is 'GAME data-warehouse search query expander' with all-game few-shot examples. The B preset ships the same game persona as config (overridable but wrong-by-default). BuildPromptArgs has no domainPersona parameter. The structural issue: there is no domain/persona injection seam, so the agent's identity and domain conventions cannot be changed without editing source.

**证据**:
- packages/data/phase-gate/src/phase-gate.ts:85 - BASE_PERSONA hardcoded 'per-game analytics platform'; registered verbatim at :958; Config schema (index.ts) has NO personaText field
- packages/data/phase-gate/src/phase-gate.ts:93 - PHASE_INSTRUCTIONS bake ods_*/dws_*/game.role.online/DAU/MAU/pay_amt; not config-driven
- packages/data/nl2sql-engine/src/prompt.ts:84 - persona '你是游戏埋点数据分析 Agent'; :112 rule 2 bakes character->role_id, account->account_id dedup
- packages/data/tool-search-data-sources/src/expand-query.ts:12 - EXPANSION_SYSTEM_PROMPT 'GAME data-warehouse search query expander' with game few-shot examples (ARPPU/PVP/钻石/大R)
- apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24 - B variant ships same game persona (config-supplied, overridable, wrong-by-default)

**推荐**: Add a personaText (or basePersona) field to PhaseGateConfig/Config defaulting to a domain-neutral value, and read it at register() instead of the const BASE_PERSONA; alternatively drop phase-gate's persona ownership and mount a dsh-persona row (text config-supplied) in agent.cordis.yml. Add a domainPersona parameter to BuildPromptArgs sourced from the active semantic-layer scope metadata, defaulting to a neutral '你是数据分析 Agent'. Make the expansion system prompt and few-shot examples scope/config-driven (domain-neutral with per-scope examples injected from the semantic layer) rather than a game literal. Derive table-prefix/event-name conventions from the semantic-layer schema rather than hardcoded literals in PHASE_INSTRUCTIONS.

### G4 [high/G-ticket] Enrichment pipeline assumes a DWS/DIM star-schema model throughout (inventory, deterministic matcher, LLM prompt, tool framing, kind enum)

**影响维度**: d3, d7

**描述**: The relation-discovery enrichment is structurally limited to fact->dimension star joins. buildDimInventory builds the inventory exclusively from kind==='dim' tables, so on a flat-wide-table / event-sourced / denormalized-OLTP scope with no DIM tables the inventory is empty and both the deterministic and LLM rounds yield [] for every table. discoverRelationsDeterministic only emits a DimensionRef when a DIM primary_key column name EXACTLY equals a column on the target (no FK-naming heuristic, no suffix/prefix/semantic match), so even valid star schemas with differently-named FKs (fact.user_id -> dim_user.id) get zero relations unless the optional LLM round is wired. The LLM prompt (buildLlmPrompt) is hardcoded to 'Discover dimension (DIM) join relations for the DWS fact table' and constrains the model to fact->dim joins only. The TableDefinition.kind enum is closed ['dws','dim'] defaulting to 'dws' (no 'ods'/'entity'/'flat'), so non-star tables are forced into the fact role and enter DWS enrichment. Worst case: running discover_relations on a non-star scope writes dimension_refs:[] to every table in replace mode, wiping human-curated joins, while reporting enriched:0 - a silent no-op that destroys data with no signal that the schema model doesn't fit.

**证据**:
- packages/data/semantic-layer/src/enrichment.ts:226 - buildDimInventory scans only kind==='dim' tables
- packages/data/semantic-layer/src/enrichment.ts:71 - discoverRelationsDeterministic exact PK-column-name match only (no FK heuristic)
- packages/data/semantic-layer/src/enrichment.ts:144 - buildLlmPrompt hardcoded 'Discover dimension (DIM) join relations for the DWS fact table'; :151 'find joins where a DWS column is a foreign key to a DIM primary_key'
- packages/data/semantic-layer/src/enrichment.ts:316 - enrichAllDwsTables writes dimension_refs:[] (replace mode) wiping curated refs when discovery returns nothing
- packages/data/semantic-layer/src/types.ts:278 - kind enum ['dws','dim'] closed, default 'dws'; superRefine requires dim tables declare primary_key+label_columns
- packages/data/tool-discover-relations/src/index.ts:221 - tool framed as 'Discover DWS->DIM dimension join relations'; formatter 'enriched N DWS table(s)'

**推荐**: Generalize the inventory to any table with a non-empty primary_key (not only kind='dim'), or accept a configurable predicate defining 'joinable' tables. Make buildLlmPrompt schema-model-agnostic ('discover join relations between this table and the others listed below' with a generic table inventory) so fact->fact, self-joins, bridge/many-to-many, and event->table joins can be discovered. Add common FK-naming heuristics to the deterministic round (column ends in _id/_key and equals a dim PK). Add a third kind ('entity'/'flat'/'other') or make kind an open string so non-star tables are not forced into the dws/dim dichotomy. Short-circuit with a clear message when the joinable inventory is empty, and default mergeExisting=true so discovery can never wipe curated joins it does not rediscover.

### G5 [critical/G-ticket] Single-scope architecture: a global active-scope pointer with no tenant/request isolation, plus stale caches that survive a scope switch

**影响维度**: d6

**描述**: The architecture assumes one globally-active scope. ScopeRegistry holds a single `active` field in a shared YAML file that load() re-reads via readFileSync on every call (so it is shared across processes, not just one), and there is no tenant, session, or request scoping (grep for tenant/sessionId/AsyncLocalStorage/requestContext across packages/data returns zero matches). SemanticLayerService.semanticRoot/scopeId getters delegate unconditionally to ctx.scopes.active(), so every read (loadTableDefinition/loadEventDefinition/getRelationGraph/acquireSnapshot) addresses the single active scope with no per-request scopeId parameter - concurrent multi-tenant requests race on the global pointer and cross-contaminate table data. buildSummaries (scope-hint) and list_scopes return ALL registered scopes with no tenant filter, leaking other tenants' scope names/aliases into the agent system prompt. Caches that DO invalidate on switch (graphCache, SchemaGateway, tool-search-data-sources enriched linker) coexist with caches that DO NOT: tool-retrieve's enrichedLinkers WeakMap has no corpusVersion() check (serves prior scope's corpus after switch), InProcRetrieval builds the HybridRetriever once and never rebuilds, and the eval-result store is not scope/tenant-filtered so coverage masks across scopes.

**证据**:
- packages/data/scope-registry/src/index.ts:142 - active scope is per-shared-YAML singleton; load() readFileSync every call; header declares 'Active scope is a per-process singleton'; no tenant/session/AsyncLocalStorage anywhere
- packages/data/semantic-layer/src/index.ts:530 - semanticRoot/scopeId getters delegate to ctx.scopes.active(); load/getRelationGraph/acquireSnapshot have no scopeId parameter
- packages/data/tool-scope-routing/src/scope-hint.ts:66 - buildSummaries returns ALL scopes, no tenant filter; injected into agent system prompt
- packages/data/tool-retrieve/src/index.ts:134 - enrichedLinkers WeakMap keyed by schema instance only, NO corpusVersion() check (stale after switch)
- packages/data/evidence-query/src/index.ts:245 - eval store loads ALL JSONL from one resultsDir; query/hasResultsFor filter by assetId/status/domain/runId, never by scope
- packages/retrieval/retrieval-inproc/src/index.ts:57 - InProcRetrieval builds HybridRetriever once, never rebuilds; shadows correct ctx.schema path when mounted

**推荐**: Make scope selection per-request, not global: pass an explicit scopeId through the call chain (or use AsyncLocalStorage/request context keyed by tenant+session) so each request addresses its own scope; the registry should resolve scope definitions by id without a single mutable `active` pointer (keep a per-session/per-tenant default if needed, not in a shared cross-process file). Add an optional scopeId to SemanticLayerService load/getRelationGraph/acquireSnapshot methods resolving from ctx.scopes.get(scopeId). Add a tenant field to ScopeDefinition and filter scopes.list()/buildSummaries/list_scopes by tenant. Port the corpusVersion() check from tool-search-data-sources into tool-retrieve's enrichedLinkers and give InProcRetrieval a re-probeable corpus source. Key the eval store per scope (stamp records with scope_id and filter by it; re-resolve resultsDir on scope switch).

### G6 [high/G-ticket] Eval framework is K11-bound: case-discovery regex, hardcoded scopeId, ODPS-only failure classification, and k11v2 case-id trend bucketing

**影响维度**: d1, d5, d8

**描述**: The eval CORE (case schema, scoring, match modes, DELIVERY judge) is portable, but the framework around it is structurally coupled to the K11 scenario. eval-runner-service hardcodes scopeId='k11' for every run and filters case filenames with the regex /^k11_\d+\.yaml$/, so any non-K11 case set (ecom_001.yaml, fin_metric_005.yaml) yields zero matches -> runBatch throws 'no cases found' (even the live k11v2_* cases are rejected). The shipped bundle wires caseDir/defaultProject/semanticRoot to K11 paths, so the autonomous-loop no-progress backstop judges improvement against the K11 game case set for any deployment that does not override them. classifyExecutionFailure pattern-matches only MaxCompute/ODPS error codes (odps-0010000, odps-0130131) plus Chinese markers, so genuine syntax/table-not-found errors on PostgreSQL/Snowflake/BigQuery fall through to 'infrastructure' (refuse-to-score) - real SQL defects are silently NOT scored as failures. The trend-comparison tool buckets categories by k11-v2 case-id naming (_alias_/_voice_ substrings), collapsing to a single 'Original' row for any non-K11 run. verdict_mapper matches only English substrings with no Chinese equivalents, diverging from the engine-layer classifier.

**证据**:
- packages/eval/eval-runner-service/src/index.ts:418 - scopeId='k11' hardcoded; :391 casePaths /^k11_\d+\.yaml$/ regex; :379 caseDir 'packages/eval/eval/cases/k11'
- packages/eval/eval-cli/src/context.ts:405 - mounts only llm-dashscope (aga route); :413 only MaxComputeQueryEngine import; :154,176,408 scopeId='k11'
- packages/eval/eval/src/classify_failure.ts:58 - only ODPS error codes (odps-0010000/odps-0130131) + Chinese markers recognized; non-ODPS errors fall to 'infrastructure'
- packages/eval/eval-cli/src/compare.ts:76 - classifyCase buckets by k11v2 _alias_/_voice_ substrings; Category union is K11-specific; defaultCasesDir k11-v2
- packages/eval/eval-runner/src/verdict_mapper.ts:94 - isInfraLikeError/isDeclineError English-only substrings, no Chinese equivalents
- packages/bundle/data-agent/cordis.patch.yml:178 - caseDir/defaultProject/semanticRoot hardcoded to K11 paths; eval-trigger policy gates against K11 case set

**推荐**: Resolve scopeId from the case file or a --scope/config option instead of the literal 'k11'; replace the k11_ regex with the generic glob used by eval-cli (or accept all *.yaml/*.yml). Make caseDir + scopeId required config (no k11 default) and read scope_id per-case from input.scope_id. Externalize the failure-pattern table per engine (a FailureClassifier interface with ODPS/Postgres/Snowflake/BigQuery implementations, or a config map of dialect->regex list) and add English/Postgres patterns ('syntax error at or near', 'relation .* does not exist', 'column .* does not exist'). Drive compare.ts categories from case dimensions (query_intent/sql_complexity) loaded from whatever case dir the runs reference, instead of substring-matching k11v2 ids. Stamp engine failures with a structured FailureClass/decline flag so verdict_mapper and classify_failure share one source rather than two divergent substring vocabularies.

### G7 [medium/G-ticket] LLM provider resolution is build-time-only: DashScope/Qwen is hard-imported and hard-exited on, with no runtime provider route

**影响维度**: d1, d2, d7, d8

**描述**: The LLM provider is not a runtime-configurable choice. eval-cli boot() mounts llm-dashscope as the only LLM provider (registering only the 'aga' route) and --with-query dynamically imports only MaxComputeQueryEngine; main.ts hard-exits if DASHSCOPE_API_KEY is unset. Although --provider/--model are string-configurable, only 'aga' is actually mounted, so setting --provider to another value fails at runtime because no other provider route is registered. The enrichment llm-wiring-plugin defaults provider to 'aga' and model to 'qwen3.7-max' (a China-focused model) with no fail-loud signal when config is absent. expand-query defaults PROVIDER='aga'/MODEL='qwen-flash'. The bundle already defers llm-dashscope to a deployment choice for the query engine, but the LLM provider is not treated the same way - a non-DashScope deployment (OpenAI/Anthropic for overseas/English) cannot run without code changes.

**证据**:
- packages/eval/eval-cli/src/context.ts:405 - boot() mounts only llm-dashscope (only 'aga' route registered)
- packages/eval/eval-cli/src/main.ts:167 - hard-exits if DASHSCOPE_API_KEY unset (:196)
- packages/data/semantic-layer/src/llm-wiring-plugin.ts:36 - defaults provider 'aga'/model 'qwen3.7-max' when config absent
- packages/data/tool-search-data-sources/src/expand-query.ts:27 - DEFAULT_EXPANSION_MODEL 'qwen-flash'/PROVIDER 'aga'

**推荐**: Mount the LLM provider from a --llm-provider flag or plugin resolution rather than hard-importing llm-dashscope; make DASHSCOPE_API_KEY conditional on the chosen provider. Default provider/model to empty and fail-loud ('enrichment-llm-wiring: no provider/model configured') rather than silently falling back to a region-specific gateway. Centralize the default LLM provider/model in one deployment config consumed by all layers (enrichment, expansion, eval) so overrides do not have to be repeated.

## 4. 非系统性（CL 级清理，不开 G 票）

The following are isolated hardcodes or cosmetic coupling, NOT architecture-class defects - they are CL-level cleanups and should not be filed as G-tickets: (1) The stale fixed reference date today='20260825' in eval-runner-service (d1/d5) - a stray literal. (2) The OdpsExecutor/Odps field and StandInOdps class naming (d2/d1) - cosmetic rename to SqlExecutor; the interface methods are already generic. (3) DI_SUFFIX=/_di$/ in granularity.ts (d2) - a K11 pinyin naming heuristic isolated to the granularity reranker; should read payload.granularity instead but is a single heuristic, not a class. (4) autoFlipThreshold=3 not exposed as a host config in ui-semantic-layer (d8) - a UI presentation magic number, not correctness. (5) generate-k11.mjs case generator (d5) - a one-shot throwaway case-template tool; scope-specific test data is legitimate, just needs a portable generator template. (6) PATIENCE_MARKERS Chinese-only in classify_failure (d4/d5) - small blast radius (refuse+resubmit) and self-consistent; folds into the i18n G-ticket as a minor instance rather than standalone architecture work. (7) tool-suggest-followups '8 Chinese characters' constraint, tool-load-event-definition '埋点' gloss, granularityTag [日粒度]/[快照] inline labels (d4) - isolated string literals, fold into i18n work as minor instances. (8) The overridable Qwen/DashScope defaults across layers (d1 low) - distinct from the hard-import/hard-exit structural issue in the LLM-provider G-ticket; these are defaults that work once overridden, so they are CL-level centralization, not architecture. (9) snapshot.ts unbounded _snapshotCache (d6 low) - a memory leak, not a data-integrity issue (version keying is correct). (10) eval-runner-service today/caseDir defaults that are already configurable (d1 low) - stray default values. These items are individually fixable without a design decision and do not warrant G-tickets.

## 5. 合成备注

The eval CORE is portable (case schema is dialect-agnostic: result_value + match_mode + answer, no expected_tables/expected_sql; scoring.ts/match_modes.ts judge result values not SQL strings; the DELIVERY judge prompt is English/generic). Abstraction seams exist (ctx.query, EngineConventions, --provider, corpusVersion) but defaults/literals stay K11/MaxCompute/Qwen/Chinese so scenario changes degrade or break without code edits. The 3 critical items are architectural G-tickets (no per-request scope context, no prompt-template/i18n seam, non-overridable persona). Most high items are also G-tickets because a whole class of design is K11-specific rather than a stray literal; H7 (lexicon/marker strategy) and H8 (error patterns) are the actionable CL/grilling exceptions. Implementing one second engine provider (e.g. dsh-query-postgres) with its own conventions.yaml would surface hidden coupling and validate the seams - it should be the first concrete step under the engine G-tickets. Several G-tickets share a root cause (one K11 scenario baked across layers) and should be tracked together to avoid divergent fixes.

## 6. 推荐执行顺序

1. **落地 `dsh-query-postgres` + 其 `conventions.yaml`** — 验证引擎缝、暴露隐藏耦合（G1/H1/H2 试金石）
2. **三个 critical G 票一起跟踪**（C1 per-request scope / C2 persona seam / C3 i18n seam）— 共享根因，分开修会发散
3. **H5/H8 先做 CL**（eval 正则+scopeId+失败分类）— 门槛低，立刻让 eval 跑非 K11 case
4. **G4 enrichment 泛化前先把 `mergeExisting` 默认改 true**（一行，防抹数据）
5. 其余 high G 票 + medium/low CL 清理按序推进

## 附录 A: 按维度的原始 finding

### d1-hardcode — 15 条

> The K11/MaxCompute/Chinese-game scenario is baked into shipped generic logic — the NL2SQL prompt, phase-gate, query tool, eval runner, and semantic-layer schema — not just fixtures. Switching engine silently breaks SQL generation (literal GET_JSON_OBJECT/ds/role_id rules), switching domain misroutes eval to scope 'k11' (and the case-discovery regex even throws on non-K11 filenames), and switching language/provider leaves Qwen/DashScope defaults and a Chinese enum value. Abstraction seams exist (ctx.query, EngineConventions, --provider) but the prompt text, defaults, and case-discovery stay MaxCompute/K11/Qwen-specific, so scenario changes degrade or break without code edits.

- **packages/data/nl2sql-engine/src/prompt.ts:111 [high/degraded]** Generic NL2SQL generation prompt hardcodes MaxCompute SQL dialect in the 'eight rules': rule 1 (line 111) requires ds='yyyyMMdd' partition + MAX_PT; rule 3 (line 113) mandates GET_JSON_OBJECT(params,'$.field') UDF; buildEvalPrompt (line 175) instructs the model to 'generate a MaxCompute SQL' (rules repeated at 188/190). The conventions seam is wired (renderConventionsPrompt, line 120 label says 'maxcompute') but the literal rules are not engine-driven.
  - 影响: On PostgreSQL/Snowflake/ClickHouse the LLM is told to emit MaxCompute-only GET_JSON_OBJECT and ds partitions that do not exist; generated SQL parse_fails or references nonexistent partition columns, silently producing wrong/failed queries on non-MaxCompute engines.
  - 修复: Move rules 1 and 3 out of the literal prompt and into the injected EngineConventions (functions/cast_map/sql_templates are already wired via renderConventionsPrompt); drive the partition-column name and JSON-extract UDF from per-engine conventions so the prompt is dialect-neutral.

- **packages/data/nl2sql-engine/src/prompt.ts:112 [high/degraded]** buildPrompt (line 84) opens with the persona 'You are a GAME behavioral-telemetry data analysis Agent' and rule 2 (line 112, repeated at 189) bakes a game-domain dedup mapping 'character->role_id, account->account_id'. role_id/account_id are game-telemetry columns, not generic identifiers.
  - 影响: On e-commerce/finance/SaaS, role_id and account_id do not exist; the LLM is instructed to dedup by them, generating SQL that references nonexistent columns (field_not_found), and the game persona misframes the domain for the model.
  - 修复: Make the persona and the dedup-subject rule data-driven from the active semantic-layer scope (e.g. a scope-configured identity-column map) instead of literal game terms; drop the game persona or derive it from scope metadata.

- **packages/data/phase-gate/src/phase-gate.ts:136 [high/degraded]** buildSqlConventions injects a literal 'SQL conventions (MaxCompute/hive dialect): partition predicate ds=yyyyMMdd required... GET_JSON_OBJECT field paths...' string (lines 136-137); the GENERATION phase prompt (line 107) references GET_JSON_OBJECT fields + missing ds partition and (line 110) 'absent from ODPS'. event_view full_name and params_extract_template ARE config-driven (lines 122-125) but the dialect label, ds partition, and GET_JSON_OBJECT are hardcoded.
  - 影响: The generic phase-gate tells the LLM to use MaxCompute/hive syntax (ds partition, GET_JSON_OBJECT) for every engine; on PostgreSQL/Snowflake/ClickHouse the model emits the wrong dialect, causing execution failures.
  - 修复: Derive the dialect string from the active query engine's conventions (EngineConventions/conventions.yaml) instead of a MaxCompute literal; let the engine supply the partition-column name and JSON-path UDF.

- **packages/data/phase-gate/src/phase-gate.ts:364 [medium/degraded]** On a TABLE_NOT_FOUND failure the not_found branch injects 'The table may be in a different ODPS project than the default. Ask the user which project the table lives in...' (line 364) and steers to update_table_config(table, project). The 'ODPS project' qualifier concept is MaxCompute-specific.
  - 影响: On PostgreSQL/Snowflake/ClickHouse the misqualification target is a schema/database, not an 'ODPS project'; the self-evolution guidance and the persisted per-table override mislead the model and store an engine-specific qualifier.
  - 修复: Use an engine-neutral term (e.g. 'qualifier/schema') sourced from the query engine's qualifyTable vocabulary, and let the engine define what the per-table override means rather than hardcoding 'ODPS project'.

- **packages/eval/eval-runner-service/src/index.ts:418 [high/broken]** runBatch hardcodes `const scopeId = 'k11' as unknown as ScopeId` (line 418) and casePaths() filters case files to the k11_<digits>.yaml filename pattern (line 391); caseDir defaults to packages/eval/eval/cases/k11 (line 379). eval-cli mirrors this: CtxOdpsAdapter/CtxQueryExecutor/SemanticLayerService all pass scopeId:'k11' (context.ts:154,176,408) and the CLI exposes no --scope flag.
  - 影响: Every eval query is routed to the K11 scope's data source/credentials regardless of the scenario under test (silently wrong results), and any non-K11-named case set yields zero cases so runBatch throws 'no cases found' — the eval runner cannot evaluate a different scenario without code changes or renaming files to k11_NNN.yaml.
  - 修复: Resolve scopeId from the case file or a --scope/config option instead of the literal 'k11'; relax casePaths to discover *.yaml (or a configurable prefix pattern) rather than the k11_ regex.

- **packages/data/tool-search-data-sources/src/expand-query.ts:12 [medium/degraded]** EXPANSION_SYSTEM_PROMPT is 'You are a GAME data-warehouse search query expander' (line 12) with all-game few-shot examples: PVP/role/段位/钻石/大R/ARPPU/pay_order/item_circle (lines 13-21). Duplicated verbatim in eval-cli context.ts (lines 222-244) where provider:'aga'/model:'qwen-flash' are also hardcoded with no override.
  - 影响: On e-commerce/finance/English the LLM query expansion is biased toward game vocabulary, degrading BM25 recall for non-game table and field names.
  - 修复: Make the expansion system prompt and few-shot examples scope/config-driven (or domain-neutral with per-scope examples injected from the semantic layer) rather than a game literal; in eval-cli, reuse the tool-search-data-sources expandQuery instead of the duplicated hardcoded copy.

- **packages/query/query-tool/src/index.ts:297 [medium/degraded]** The model-facing query_data tool description (line 297) reads 'Execute a MaxCompute SQL statement against a per-game scope'; the sql param description (line 308) says 'The MaxCompute SQL statement'; scope_id (line 313) says 'per-game access-isolation scope'.
  - 影响: On a non-MaxCompute/non-game deployment the LLM is told it is running MaxCompute SQL against a per-game scope — misleading the model about dialect and domain; the tool still executes via the abstract ctx.query seam but the description biases generation.
  - 修复: Use engine-neutral wording ('Execute a SQL statement against the active data scope'); derive the dialect name from the mounted query engine rather than the literal 'MaxCompute'.

- **packages/eval/eval/src/classify_failure.ts:58 [medium/degraded]** classifyExecutionFailure pattern-matches MaxCompute error codes 'odps-0010000' for timeout (line 58) and 'odps-0130131' for table-not-found (line 60). No other engine's error strings/codes are recognized.
  - 影响: On PostgreSQL/Snowflake/ClickHouse, timeouts and table-not-found errors do not match ODPS codes and fall to the default 'infrastructure' bucket (refuse-to-score), silently degrading eval scoring — agent SQL defects that should be scored as failures are marked unjudged.
  - 修复: Add per-engine error-pattern sets (or accept a configurable error-pattern map) so the classifier recognizes non-ODPS timeout/syntax/table-not-found strings; keep ODPS codes as one engine's set, not the only one.

- **packages/data/semantic-layer/src/types.ts:270 [medium/degraded]** TableDefinitionSchema defaults `engine: z.string().default('maxcompute')` — the generic semantic-layer table schema defaults every table's engine to maxcompute.
  - 影响: Tables for PostgreSQL/Snowflake/ClickHouse are mislabeled as maxcompute unless explicitly overridden per table; any logic reading .engine for routing or rendering defaults to MaxCompute behavior for the wrong engine.
  - 修复: Make the engine default empty/optional and require it to be set (or derive it from the active scope/query engine); do not default non-engine code to 'maxcompute'.

- **packages/bundle/data-agent/cordis.patch.yml:106 [medium/degraded]** The default data-agent bundle mounts only @deepseek-ai/dsh-query-maxcompute as the query engine (line 106) with defaultProject: ieu_cdm (the K11 ODPS project, line 125), maxcConfigPath ~/.maxc/config.yaml (line 118), sidecarPath maxc-sidecar.mjs (line 116); semanticRoot defaults to ./examples/k11-semantic-layer (line 162) and eval-runner caseDir to packages/eval/eval/cases/k11 (line 178). No alternative query-engine provider is shipped.
  - 影响: Out-of-box the data agent is wired to MaxCompute and the K11 project/corpus; switching to PostgreSQL/Snowflake/ClickHouse requires editing the bundle and writing a new query-engine provider (the ctx.query seam exists but no other engine implements it).
  - 修复: Treat the query engine like the LLM (the bundle already defers llm-dashscope to a deployment choice) — ship the query-engine mount as a deployment-configurable row with no single engine hard-wired, and move ieu_cdm / k11 semanticRoot / k11 caseDir out of the default into a K11 scenario profile.

- **packages/eval/eval-cli/src/context.ts:405 [medium/degraded]** boot() mounts llm-dashscope as the only LLM provider (line 405, registering only the 'aga' route) and --with-query dynamically imports only MaxComputeQueryEngine (context.ts:413); main.ts hard-exits if DASHSCOPE_API_KEY is unset (main.ts:167,196). Although --provider/--model are string-configurable, only 'aga' is actually mounted.
  - 影响: The eval CLI cannot run with a non-DashScope LLM (e.g. OpenAI/Anthropic for an overseas/English deployment) or a non-MaxCompute query engine without code changes — setting --provider to another value fails at runtime because no other provider route is registered.
  - 修复: Mount the LLM provider (and --with-query engine) from a --llm-provider/--query-engine flag or plugin resolution rather than hard-importing llm-dashscope/MaxComputeQueryEngine; make DASHSCOPE_API_KEY conditional on the chosen provider.

- **packages/data/tool-search-data-sources/src/expand-query.ts:27 [low/works]** Qwen/DashScope(aga) baked in as the DEFAULT model/provider across eval+expansion tooling: expand-query.ts DEFAULT_EXPANSION_MODEL='qwen-flash'/PROVIDER='aga' (lines 27-28); tool-search-data-sources config expansionModel='qwen-flash' (index.ts:62); eval-runner-service provider='aga'/model='qwen3.7-max' (index.ts:382-383); eval-cli main defaults 'aga'/'qwen3.7-max' (main.ts:65-66). All overridable.
  - 影响: Out-of-box defaults bias to Qwen/DashScope (Alibaba); a non-DashScope deployment must override in every layer or the expansion/eval calls target an unavailable model.
  - 修复: Centralize the default LLM provider/model in one deployment config consumed by all these layers, defaulting to a neutral value or leaving provider required.

- **packages/data/nl2sql-engine/src/prompt.ts:18 [low/works]** The generic nl2sql-engine prompt imports the EngineConventions type from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts' — a hard type-dependency on the MaxCompute engine package.
  - 影响: Type-only (no runtime effect; conventions are injected via the seam), but the generic nl2sql-engine cannot compile/standalone without the MaxCompute package present; the abstraction is leaky (EngineConventions is defined in the engine package, not the abstract dsh-query seam).
  - 修复: Move the EngineConventions type into the abstract @deepseek-ai/dsh-query package (or a shared dialect-types module) so nl2sql-engine depends on the seam, not the MaxCompute implementation.

- **packages/data/semantic-layer/src/types.ts:283 [low/works]** TableDefinitionSchema freshness enum is ['静态参考','T+1',''] — a Chinese literal value '静态参考' (static reference) in the generic schema.
  - 影响: An English/Japanese deployment carries Chinese metadata values in table definitions; cosmetic but language-coupled.
  - 修复: Use language-neutral enum tokens (e.g. 'static','t+1','') and render localized labels at the presentation layer.

- **packages/eval/eval-runner-service/src/index.ts:379 [low/works]** eval-runner-service defaults caseDir='packages/eval/eval/cases/k11' (line 379) and today='20260825' (line 384); eval-cli defaults --schema to <repo>/examples/k11-semantic-layer (main.ts:112,145). All configurable.
  - 影响: Out-of-box the eval tooling points at the K11 case set/semantic layer and a stale fixed reference date; a different scenario requires overriding these defaults.
  - 修复: Default caseDir/schema to empty and require them, or derive from the active scope; default today to the real current date rather than a hardcoded 20260825.

### d2-engine-coupling — 25 条

> MaxCompute/ODPS dialect is baked deeply into the supposedly engine-agnostic nl2sql-engine (prompt rules, critic, metric-engine, post-processing) and even into the model-facing query_data/critique_sql tool descriptions. There is no genuine engine registry/factory: the abstract QueryEngine seam is pluggable in theory, but MaxComputeQueryEngine is the ONLY provider implementation, loadConventions returns an empty shape for any non-maxcompute engine (a silent no-op, not a route), the bundle mounts only maxcompute, and the nl2sql-engine imports loadConventions directly from the maxcompute package. Switching to PostgreSQL/Snowflake/ClickHouse/Hive would produce wrong SQL (GET_JSON_OBJECT, MAX_PT, ds= partition predicates, GETDATE) and switching language to English/Japanese breaks time-param extraction and trend detection (Chinese-only regex).

- **packages/data/nl2sql-engine/src/prompt.ts:84 [medium/degraded]** SQL-generation prompt persona is hardcoded to the K11 game domain: '你是游戏埋点数据分析 Agent' (you are a game event-data analysis Agent).
  - 影响: Switching business domain (e.g. e-commerce, finance) leaves the LLM framed as a game analyst, biasing SQL generation and explanations toward game-event semantics regardless of the actual schema.
  - 修复: Parameterize the persona string via BuildPromptArgs (e.g. domainPersona) sourced from the scope/semantic-layer config; default to a neutral '你是数据分析 Agent'.

- **packages/data/nl2sql-engine/src/prompt.ts:175 [high/broken]** buildEvalPrompt hardcodes the engine into the instruction: '生成一条 MaxCompute SQL' (generate a MaxCompute SQL statement). The eight rules below (lines 188-190) repeat the same ds/MAX_PT/GET_JSON_OBJECT assumptions.
  - 影响: Under any non-ODPS engine the LLM is explicitly told to emit MaxCompute SQL, so it will produce GET_JSON_OBJECT/MAX_PT/ds= fragments that error or scan wrong on PostgreSQL/Snowflake/ClickHouse/Hive.
  - 修复: Drive the engine label from the loaded EngineConventions.engine field (already present in the YAML) instead of a literal; let conventions carry the dialect rules rather than the hardcoded rule block.

- **packages/data/nl2sql-engine/src/prompt.ts:111 [high/broken]** Rule 1 of the 'eight rules' bakes ODPS partition syntax into the agnostic prompt: '分区表必带 ds（yyyyMMdd）；非分区 DIM 不带 ds；_df 后缀日期不明用 MAX_PT'. The same rule is duplicated at line 188.
  - 影响: PostgreSQL/Snowflake/ClickHouse have no 'ds' partition column and no MAX_PT() function; the LLM will emit ds= predicates and MAX_PT() calls that error or silently full-scan. Hive uses ds but not MAX_PT.
  - 修复: Move partition-convention guidance into per-engine conventions.yaml (sql_templates / key_differences) and remove the hardcoded rule; the conventions seam already supports this.

- **packages/data/nl2sql-engine/src/prompt.ts:113 [high/broken]** Rule 3 hardcodes the ODPS JSON accessor: 'params 用 GET_JSON_OBJECT(params,$.字段)，数值前 CAST AS BIGINT/DOUBLE'. Duplicated at line 190.
  - 影响: PostgreSQL uses -> / ->>, Snowflake uses PARSE_JSON/:, ClickHouse uses JSONExtract*; GET_JSON_OBJECT does not exist on those engines, so generated SQL errors at execution (function-not-found), forcing retry loops.
  - 修复: Source the JSON-access idiom from conventions (a functions + cast_map entry for logical=json already exists in the maxcompute yaml); do not hardcode GET_JSON_OBJECT in the rule text.

- **packages/data/nl2sql-engine/src/engine.ts:160 [high/broken]** Nl2sqlEngine constructor defaults conventions to maxcompute when none injected: this.conventions = deps.conventions ?? loadConventions('maxcompute'). The engine package is supposedly engine-agnostic.
  - 影响: Any caller that does not explicitly inject conventions silently gets MaxCompute dialect grounding (GET_JSON_OBJECT/TO_CHAR/GETDATE/DATEDIFF function list, BIGINT cast map, ds-templated SQL), so non-ODPS engines generate ODPS-flavored SQL by default.
  - 修复: Default to null conventions (the prompt already renders a placeholder for null) and require the caller (bundle/eval-runner) to inject the correct engine's conventions explicitly.

- **packages/data/nl2sql-engine/src/engine.ts:49 [medium/degraded]** postProcessSql hardcodes ODPS date-function regexes: it only recognizes GETDATE(), CURRENT_TIMESTAMP, and the MaxCompute TO_CHAR(DATEADD('today',-N,'dd'),'yyyyMMdd') / DATEADD(...,'dd') patterns (lines 59-67).
  - 影响: On Snowflake/PostgreSQL the LLM emits DATEADD(day,-7,CURRENT_DATE) or CURRENT_DATE - INTERVAL '7 days'; none match these ODPS-shaped regexes, so runtime date functions pass through unnormalized → non-deterministic eval results and the 'avoid GETDATE' prompt advice is engine-specific.
  - 修复: Make date-normalization engine-aware (delegate to a per-engine normalizer) or remove it from the agnostic engine into the query-maxcompute normalize.ts layer where dialect-specific rewrites belong.

- **packages/data/nl2sql-engine/src/engine.ts:217 [medium/degraded]** partitionCols fallback defaults to the ODPS partition column name: const partitionCols = eventDef?.partitions?.map(p => p.name) ?? ['ds'].
  - 影响: When an event definition carries no partitions (common on PostgreSQL/Snowflake where partitioning is declarative/absent), the critic is told the table is partitioned by 'ds' and will warn 'missing partition filter' on valid non-ODPS SQL.
  - 修复: Default to an empty array (no partition requirement) rather than ['ds']; let the schema substrate declare real partition columns.

- **packages/data/nl2sql-engine/src/engine.ts:109 [low/works]** The executor dependency is named and typed with ODPS branding: readonly odps: OdpsExecutor (and the private field at line 150, calls this.odps.execute at 290). The contract (execute/attach returning a 3-state outcome) is engine-agnostic.
  - 影响: Cosmetic coupling that signals the engine was designed ODPS-first; the CtxOdpsAdapter in eval-cli already wraps a generic ctx.query, so the naming misrepresents a portable seam as MaxCompute-specific.
  - 修复: Rename OdpsExecutor → SqlExecutor (stand-in-odps.ts:19) and the field odps → executor; the interface methods are already generic.

- **packages/data/nl2sql-engine/src/types.ts:37 [medium/degraded]** PARTITION_COLUMNS constant hardcodes ODPS partition column names: ['ds','dt','partition_date','p_date']. The critic unions these into every partition-filter check (critic.ts:151).
  - 影响: For engines/schemas with different partition column names the critic's hasPartitionFilter either no-ops (no overlap) or, combined with the ['ds'] default, false-positives a missing-filter warning on valid SQL.
  - 修复: Drop the hardcoded constant; rely solely on the schema-provided partitionCols in CriticCtx (already passed through from TableDefinition.partitions).

- **packages/data/nl2sql-engine/src/types.ts:167 [medium/degraded]** makeCriticCtx defaults partitionCols to ['ds']: const { ..., partitionCols = ['ds'], ... } = options. Comment at line 163 documents this default.
  - 影响: Any critic context built without explicit partition info assumes a 'ds' partition exists, so non-ODPS tables trigger spurious missing_partition_filter warnings.
  - 修复: Default partitionCols to [] (empty = non-partitioned, no ds required — the critic already treats empty as a pass).

- **packages/data/nl2sql-engine/src/critic.ts:74 [medium/degraded]** extractJsonPaths only matches the ODPS JSON function: re = /GET_JSON_OBJECT\s*\(\s*[^,]+,\s*'([^']+)'\s*\)/gi. The json_field_not_in_params guard (line 256-261) is keyed entirely on this.
  - 影响: On PostgreSQL (-> / ->>), Snowflake (GET_PATH / :), or ClickHouse (JSONExtractString) the critic extracts zero JSON paths, so the json_field_not_in_params guard is silently bypassed (fail-open) — hallucinated JSON field names go uncaught.
  - 修复: Make the JSON-path extractor pluggable per engine (conventions could declare the accessor function name and path syntax), or add patterns for -> / ->> / GET_PATH.

- **packages/data/nl2sql-engine/src/critic.ts:233 [low/degraded]** Critic finding message hardcodes ODPS partition names: '缺分区过滤（ds/dt），可能全表扫' (missing partition filter (ds/dt), may full-scan).
  - 影响: For non-ODPS engines the warning text references columns that do not exist in the target schema, confusing the LLM during self-correction.
  - 修复: Render the partition column names from ctx.partitionCols into the message instead of the literal 'ds/dt'.

- **packages/data/nl2sql-engine/src/metric-engine.ts:97 [high/broken]** extractTimeParams recognizes ONLY Chinese date words: 昨天\|昨日 (line 97), 今天\|今日 (99), 上周\|上一周 (100), 本月\|当月 (110). No English (yesterday/today/last week/this month) or Japanese equivalents.
  - 影响: For an English or Japanese question the function returns {} → buildMetricContext emits no WHERE time filter → the LLM's metric SQL has no date predicate, yielding full-table scans or wrong date ranges (silently wrong results).
  - 修复: Add English/Japanese keyword branches (or source the keyword set from i18n config); fall back to a locale-aware extractor.

- **packages/data/nl2sql-engine/src/metric-engine.ts:139 [high/broken]** buildTimeFilterHint emits ODPS-specific SQL fragments: snapshot tables get 'ds 取最近可用分区（如 MAX_PT()）' (line 139) and daily tables get 'WHERE ds = ...' or 'ds BETWEEN' (line 141).
  - 影响: MAX_PT() does not exist on PostgreSQL/Snowflake/ClickHouse/Hive; the LLM copies this hint verbatim into generated SQL → syntax errors. The ds= hint assumes an ODPS partition column.
  - 修复: Source the time-filter idiom from per-engine conventions (a sql_template entry) instead of hardcoding MAX_PT()/ds in the agnostic metric-engine.

- **packages/data/nl2sql-engine/src/metric-engine.ts:158 [high/broken]** buildMetricContext hardcodes the ODPS partition column in generated WHERE clauses: where = ' WHERE ds = ...' (line 158) and ' WHERE ds BETWEEN ... AND ...' (line 159).
  - 影响: For PostgreSQL/Snowflake/ClickHouse tables the partition column is not named 'ds' (and may not exist), so the metric-context SQL fragment the LLM is told to reproduce references a non-existent column → wrong SQL.
  - 修复: Resolve the partition column name from hostTable.partitions (already available) and use the first partition column dynamically; emit no WHERE when the table has no partition.

- **packages/data/nl2sql-engine/src/granularity.ts:13 [medium/degraded]** TREND_PATTERN is Chinese-only: /趋势\|变化\|逐日\|每天\|近\d+天\|日均\|环比\|同比\|每周\|每月\|增长\|下降\|走势/. No English (trend/daily/week-over-week/growth/decline) or Japanese keywords.
  - 影响: English/Japanese trend questions are not classified as trend → the _di candidate boost (line 38) and rule 9 are skipped → degraded candidate ranking (may miss the daily-increment table), though not wrong SQL.
  - 修复: Add English/Japanese trend keywords or use a locale-aware keyword list sourced from i18n config.

- **packages/data/nl2sql-engine/src/granularity.ts:25 [medium/degraded]** DI_SUFFIX = /_di$/ is a K11-specific naming convention (Chinese pinyin '日 increment' / daily-increment). The soft-rerank boost at line 38 keys entirely on this suffix.
  - 影响: Other schemas/engines will not name daily-increment tables with the _di suffix, so the granularity rerank is a no-op for any non-K11 schema even when trend intent is correctly detected.
  - 修复: Drive the daily-granularity signal from the table definition's granularity field (payload.granularity) rather than a hardcoded name suffix; the metric-engine already reads granularity from payload.

- **packages/query/query-maxcompute/src/conventions.ts:77 [high/broken]** loadConventions returns an EMPTY convention set for any non-maxcompute engine: if (engine !== 'maxcompute') return { engine, key_differences: [], functions: [], cast_map: [], sql_templates: [] } (line 78-79). Comment at line 13 admits 'Single-engine (maxcompute) today'.
  - 影响: There is no real engine routing: passing conventionsEngine='postgresql' silently yields no dialect grounding (no functions, no cast map, no templates) rather than loading a postgresql conventions.yaml — the prompt renders '（无 conventions）' and the LLM gets zero dialect help, producing un-grounded SQL.
  - 修复: Implement a per-engine conventions loader (registry of conventions.yaml files keyed by engine name) so each engine ships its own conventions.yaml; fail-loud (throw) on an unknown engine name rather than silently returning empty.

- **packages/data/nl2sql-engine/src/index.ts:29 [high/degraded]** The supposedly engine-agnostic nl2sql-engine package imports loadConventions and the EngineConventions type directly from the maxcompute-specific package: import { loadConventions, type EngineConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.js' (line 29). conventionsEngine config defaults to 'maxcompute' (lines 76, 83).
  - 影响: The SQL-generation engine has a hard build/runtime dependency on the maxcompute package; a deployment targeting PostgreSQL/Snowflake cannot use nl2sql-engine without also installing the maxcompute package, and the default always loads maxcompute conventions.
  - 修复: Move EngineConventions + loadConventions into the engine-agnostic dsh-query package (or a shared dsh-conventions package) and have each engine provider register its own conventions.yaml; nl2sql-engine should depend on the abstract seam, not the maxcompute package.

- **packages/data/tool-critique-sql/src/index.ts:182 [medium/degraded]** Model-facing critique_sql_tool description bakes ODPS assumptions: '...ds partition required, no SELECT *, GET_JSON_OBJECT field ∈ event_params'. The tool is presented as engine-agnostic.
  - 影响: On non-ODPS engines the LLM is told to ensure a 'ds partition' and use GET_JSON_OBJECT, biasing it toward ODPS syntax even when the target engine uses different partitioning and JSON accessors.
  - 修复: Phrase the description in engine-neutral terms ('partition filter required', 'JSON field ∈ event_params') and let the per-engine conventions declare the concrete partition column and JSON accessor.

- **packages/query/query-tool/src/index.ts:297 [medium/degraded]** query_data tool description hardcodes the engine: 'Execute a MaxCompute SQL statement against a per-game scope' (line 297); the sql parameter description says 'The MaxCompute SQL statement to execute' (line 308); the no-engine error names only dsh-query-maxcompute (line 342).
  - 影响: Under a PostgreSQL/Snowflake engine the model-facing description still says 'MaxCompute SQL', misleading the LLM about the target dialect; the per-game scope wording also couples to the K11 game scenario.
  - 修复: Replace 'MaxCompute SQL' with 'SQL' (or the configured engine name from ctx.query); generalize 'per-game scope' to 'per-scope access-isolation boundary'.

- **packages/data/nl2sql-engine/src/stand-in-odps.ts:19 [low/works]** The executor contract is ODPS-named: export interface OdpsExecutor (line 19) and export class StandInOdps (line 29). The interface methods (execute/attach → 3-state QueryOutcome) are engine-agnostic.
  - 影响: Naming coupling: a PostgreSQL/Snowflake executor must implement an interface called OdpsExecutor, which is misleading and signals ODPS-first design.
  - 修复: Rename to SqlExecutor / StandInSqlExecutor; the method signatures are already generic.

- **packages/bundle/data-agent/cordis.patch.yml:105 [high/broken]** The data-agent bundle mounts ONLY the MaxCompute provider for the query-engine row: name: '@deepseek-ai/dsh-query-maxcompute' (line 106). The comment at line 105 says 'mount ONLY the MaxCompute provider'. There is no engine-selection switch, factory, or registry — the engine is chosen at bundle-authoring time by hardcoding the maxcompute package name.
  - 影响: Switching engines requires editing the bundle patch to a different provider package that does not exist yet (no PostgreSQL/Snowflake/ClickHouse/Hive provider is shipped); the engine is not a runtime/runtime-config choice.
  - 修复: Ship per-engine provider packages (dsh-query-postgres, dsh-query-snowflake, etc.) and let the bundle row be selected via a deployment config (engineType) rather than a hardcoded package name; add a conventions.yaml per engine.

- **packages/query/query/src/index.ts:38 [high/broken]** The abstract QueryEngine seam IS genuinely engine-agnostic (abstract execute/attach/cancel/getProgress/qualifyTable), BUT MaxComputeQueryEngine is the ONLY concrete subclass in the entire repo (confirmed: grep 'extends QueryEngine' matches only packages/query/query-maxcompute/src/index.ts:193). No PostgreSQL/Snowflake/ClickHouse/Hive provider exists — not even a stub.
  - 影响: The 'pluggable' seam is theoretical: there is exactly one engine path with a real implementation. Multi-engine support is unimplemented, not merely stubbed — there is nothing to switch to.
  - 修复: Implement at least one second engine provider (e.g. dsh-query-postgres) with its own conventions.yaml to prove the seam is real and surface hidden coupling; until then document maxcompute as the only supported engine.

- **packages/eval/eval-cli/src/context.ts:413 [medium/degraded]** The eval CLI hardcodes the MaxCompute provider import and K11 scope: const { MaxComputeQueryEngine } = await import('@deepseek-ai/dsh-query-maxcompute') (line 413), scopeId: 'k11' (lines 154, 176, 408), and maxcConfigPath defaulting to a K11 ODPS config (line 425).
  - 影响: The eval harness cannot run against any non-ODPS engine or non-K11 scope without code changes; eval reproducibility is scoped to the single K11/MaxCompute scenario.
  - 修复: Parameterize the engine provider (import by config-driven engine name) and scope id via CLI flags / BootOptions rather than literals.

### d3-metadata-assumptions — 10 条

> The semantic layer's TableDefinition schema and sync-write generators bake in K11-specific assumptions that silently break on a bare PostgreSQL/Hive/Snowflake/ClickHouse metastore import. Every auto-imported table defaults to engine='maxcompute' and kind='dws' (no 'ods' kind exists), the freshness enum accepts only two Chinese strings, and DIM generation + column-role inference rely on MaxCompute uppercase type names and _id/_name suffix heuristics. When those conventions don't hold, DIMs are dropped by superRefine, column roles collapse to 'attribute', and the relation graph can crash on a single dangling domain→concept reference — degrading or breaking enrichment across domains, engines, and locales.

- **packages/data/semantic-layer/src/types.ts:270 [high/broken]** TableDefinitionSchema defaults engine to 'maxcompute'. generateTableYaml (io.ts:525) and generateDimYaml (io.ts:551) omit the engine key entirely, so every auto-imported table inherits 'maxcompute' regardless of source engine.
  - 影响: A bare PostgreSQL/Snowflake/ClickHouse/Hive metastore sync-write produces table YAMLs tagged engine='maxcompute'. tableKindPlugin.toPromptContext emits 'Engine: maxcompute' to the LLM and tool-load-table-definition's projectTable returns engine='maxcompute', so the model generates MaxCompute-dialect SQL for non-MaxCompute tables (wrong functions, wrong quotes, wrong DDL) with no error signal.
  - 修复: Remove the 'maxcompute' default (make engine z.string().optional() or default '') and thread the source engine through generateTableYaml/generateDimYaml from the TableMeta/connector (e.g. meta.engine or a sync opts.engine). Require an explicit engine on write or fall back to '' so consumers can detect 'unspecified' rather than silently treating it as MaxCompute.

- **packages/data/semantic-layer/src/types.ts:278 [medium/degraded]** kind is z.enum(['dws','dim']).default('dws') — there is no 'ods' kind, and an absent kind defaults to 'dws' (fact table). enrichAllDwsTables (enrichment.ts:311) treats kind!=='dim' as DWS and runs DWS→DIM dimension_refs discovery on it.
  - 影响: A bare metastore table (most likely ODS/raw) is silently classified as a DWS fact table and enters the DWS enrichment path, spurious dimension_refs discovery runs on raw tables. If a curator explicitly tags kind:'ods' (the universal warehouse layer name), TableDefinitionSchema.safeParse fails and the table is dropped from every consumer (relation graph, corpus, gateway) with no warning.
  - 修复: Add 'ods' to the kind enum and default untagged imports to 'ods' (or a neutral 'unknown') rather than 'dws'; have enrichAllDwsTables skip kind==='ods' so raw tables don't receive fact-table enrichment.

- **packages/data/semantic-layer/src/types.ts:283 [medium/broken]** freshness is z.enum(['静态参考','T+1','']).default('') — the only non-empty allowed values are Chinese strings. Any English/Japanese freshness label is rejected by the enum.
  - 影响: A curator who sets freshness:'daily' or freshness:'real-time' (natural for a non-Chinese deployment) causes TableDefinitionSchema.safeParse to fail; loadByStorageDir/index.ts getRelationGraph/schema-gateway all skip the table (silent drop, no crash, no log). Auto-generated DIMs via generateDimYaml get the hardcoded Chinese '静态参考' regardless of deployment locale.
  - 修复: Relax freshness to z.string().default('') (free text) or expand the enum with English equivalents ('static','T+1','daily','realtime') and localize the label at the presentation layer rather than in the schema enum.

- **packages/data/semantic-layer/src/io.ts:545 [medium/degraded]** generateDimYaml derives primary_key via meta.columns.find(c => c.name.endsWith('_id')), a K11 naming convention. PostgreSQL dimension tables typically name the PK 'id' (not 'something_id'), and composite/UUID keys don't match, so primaryKey becomes [].
  - 影响: syncWriteDefinitions writes DIMs with skipValidation:false (io.ts:655); an empty primary_key trips the superRefine 'DIM 表 primary_key 不能为空' (types.ts:288). The write throws, is caught as an error string, and the DIM is never persisted — so buildDimInventory has no DIM inventory and DWS→DIM join discovery finds nothing. The table is silently absent from the layer.
  - 修复: Accept an explicit primary_key hint in TableMeta or syncWriteDefinitions opts (e.g. from information_schema.table_constraints/primary_keys for PG). When no _id column is found, fall back to the connector-reported PK or skip DIM generation with a distinct, actionable error rather than a heuristic miss that surfaces as a generic validation failure.

- **packages/data/semantic-layer/src/io.ts:548 [medium/degraded]** generateDimYaml derives label_columns by filtering columns whose uppercase type === 'STRING' AND whose name ends with a LABEL_SUFFIXES entry ('_name','_desc','_label','_title'). A DIM whose label column is a non-STRING type, or named 'full_name' (no _name suffix match is fine) vs 'description' (no suffix), or uses CJK/English labels without these suffixes, yields label_columns=[].
  - 影响: Empty label_columns trips the superRefine 'DIM 表 label_columns 不能为空' (types.ts:291); same drop path as the primary_key finding — the DIM write fails validation and the dimension table never enters the layer, starving join discovery of DIM inventory.
  - 修复: Loosen the derivation (any STRING-type column, or the first N STRING columns) and/or accept an explicit label_columns hint in TableMeta/sync opts. Alternatively relax the superRefine to warn (addIssue as warning) instead of hard-failing when label_columns is empty, since a DIM without a human label is still usable for joins.

- **packages/data/semantic-layer/src/io.ts:498 [medium/degraded]** inferRole matches column types against MEASURE_TYPES={'BIGINT','INT','DOUBLE','FLOAT','DECIMAL'} and t==='STRING' after toUpperCase(). These are MaxCompute/ODPS uppercase type spellings. PostgreSQL ('integer'->'INTEGER' != 'INT'; 'text'/'varchar' != 'STRING'), Snowflake ('NUMBER','VARCHAR'), and others don't match. canonicalizeType (types.ts) maps 'integer'->'int' but is NOT applied before inferRole — it runs only at parse-time on the stored type, after the role was already inferred and persisted.
  - 影响: On a bare PG/Snowflake import, every non-_id column collapses to role='attribute' (neither dimension nor measure). The wrong role is written into the YAML at generation time and sticks on read-back (canonicalizeType fixes the displayed type but not the role). The LLM loses the dimension/measure hint, degrading SQL aggregation/join reasoning. mergeColumns (io.ts:576) re-runs inferRole for new columns, so re-syncs don't recover.
  - 修复: Apply canonicalizeType to col.type inside inferRole before matching, and reconcile MEASURE_TYPES with the canonical vocabulary (match canonical 'int'/'decimal' rather than raw 'BIGINT'). Add 'string' canonical handling so STRING-dimension detection works for text/varchar columns.

- **packages/data/semantic-layer/src/index.ts:339 [medium/broken]** getRelationGraph throws 'Domain reference validation failed' when any asset.domains value has no matching concept in concepts/, and this throws for the ENTIRE graph build (not per-asset). The check only runs when conceptNames.size>0 (at least one concept defined).
  - 影响: In a multi-scope/multi-tenant deployment, a single table carrying a stale domain from another scope (or a partially-curated concepts/ catalog) makes getRelationGraph() throw, crashing the schema-gateway getGraphData endpoint and any join-path consumer for ALL assets — not just the offending one. It's an unhandled throw in a cached getter with no try/catch around the validation loop.
  - 修复: Skip the dangling domain entry (or the offending asset) with ctx.logger.warn and continue building the graph for the remaining assets. Collect dangling references into a separate validation report surfaced via a health-check endpoint, rather than aborting the whole graph on one bad reference.

- **packages/data/semantic-layer/src/enrichment.ts:118 [low/degraded]** mergeRefs decides whether an LLM/semantic derivation overrides the deterministic one by testing ex.derivation.startsWith('确定性') (the Chinese word for 'deterministic'). The deterministic round (enrichment.ts:79, 173) emits Chinese derivation text like '确定性：DWS 列 ...', so the prefix check works for K11.
  - 影响: If the deterministic derivation text is localized to English/Japanese (e.g. 'Deterministic: DWS column ...'), the prefix no longer matches, so the merge logic silently treats every deterministic derivation as human-curated and never lets the LLM derivation override it — merge semantics change with locale.
  - 修复: Replace the locale-coupled string prefix with a structured marker — a derivation_source field ('deterministic'\|'llm'\|'curated') on DimensionRef, or a separate boolean — and branch on that instead of on the Chinese prefix.

- **packages/data/semantic-layer/src/io.ts:559 [low/degraded]** generateDimYaml hardcodes freshness:'静态参考' (io.ts:559) and granularity:'维表(非分区,全量参考,无时间维度)' (io.ts:560) — Chinese strings emitted into every auto-generated DIM regardless of deployment locale.
  - 影响: On an English/Japanese deployment, every auto-generated DIM carries Chinese freshness+granularity into tableKindPlugin.toPromptContext and tool-load-table-definition's projectTable, so the LLM and the model-facing tool output Chinese metadata for non-Chinese assets.
  - 修复: Parameterize these strings via a locale config, or emit neutral defaults (freshness:'', granularity:'') and let the curator/enrichment fill them, so the auto-generated skeleton carries no locale assumption.

- **packages/data/semantic-layer/src/enrichment.ts:234 [low/degraded]** buildDimInventory sets description = r.data.description \|\| r.data.table_comment, both of which default to '' (types.ts:268-269) and are empty on a bare Hive/PG information_schema import (no comments). tableKindPlugin.toCorpusItem (table-kind.ts:25-26) indexes only col.name when col.comment is empty.
  - 影响: On a bare metastore import the LLM relation-discovery prompt has empty descriptions for both DWS and DIM (buildLlmPrompt feeds description\|\|table_comment\|\|''), so the semantic round has no context to infer non-exact-name joins. BM25 retrieval indexes only bare table/column names, dropping recall for synonym/abbreviation queries. No crash — purely degraded enrichment+retrieval quality.
  - 修复: When comments are absent, let the connector pass a synthetic description (derived from table/column-name heuristics) in TableMeta.comment, or skip the LLM enrichment round with a log when description is empty rather than running it on null context. Optionally index a name-normalized token in toCorpusItem to recover some recall.

### d4-language-culture — 16 条

> The semantic layer is effectively Chinese-only: the NL2SQL generation prompt, the production BM25 query-expansion prompt, and the SQL semantic judge prompt are all hardcoded entirely in Chinese with game-domain personas and no i18n/templating seam. Trend-intent detection and the phase-gate honest-decline/route protocol use Chinese-only keyword lists and CJK-bracket tokens parsed by hardcoded regexes. The BM25 tokenizer and alias-term extractor cover CJK ideographs but silently drop Japanese hiragana/katakana. Deploying to an English or Japanese enterprise degrades retrieval recall, disables granularity reranking, and risks a broken decline/routing gate if any marker is localized without updating both prompt and parser.

- **packages/data/nl2sql-engine/src/prompt.ts:84 [critical/broken]** buildPrompt() returns the GENERATION-phase SQL-generation prompt entirely in Chinese: persona '你是游戏埋点数据分析 Agent', the staged SOP (§3), honest-deject rules (§5), eight rules (§6), and tool catalog are all Chinese with the game埋点 domain baked in. buildEvalPrompt (line ~131) is likewise all-Chinese. No i18n/templating layer; the dialect section is the only externalized slice (via conventions.ts).
  - 影响: For an English or Japanese enterprise the core NL2SQL instruction set is in a foreign language. The LLM receives game-domain Chinese instructions (角色→role_id, 埋点~10min, 千分位) that do not match the deployment's domain or query language, degrading SQL quality and instruction-following. The game-domain persona ('game event-tracking Agent') is wrong for non-game verticals.
  - 修复: Introduce a prompt-template registry keyed by locale (zh/en/ja) + domain, with {{persona}}, {{rules}}, {{tool_catalog}} interpolation groups mirroring the conventions seam. Externalize the SOP/rules/tool-catalog as locale-neutral structured data rendered through locale bundles.

- **packages/data/tool-search-data-sources/src/expand-query.ts:11 [critical/broken]** EXPANSION_SYSTEM_PROMPT is hardcoded entirely in Chinese and game-specific: '你是一个游戏数据分析数据仓库的搜索查询扩展器', instructs the LLM to add '中文同义词', and ships four game-only examples (ARPPU, PVP, 钻石产出, 大R玩家). expandQuery() is wired into the production search_data_sources tool (index.ts:34, called at :600) and is ENABLED BY DEFAULT (config.queryExpansion !== false, index.ts:511).
  - 影响: BM25 retrieval recall — the first pipeline stage — depends on query expansion. For an English enterprise the expander is told it serves game analytics and must produce Chinese synonyms; it will emit irrelevant Chinese/game tokens, polluting the BM25 query and degrading candidate ranking. Disabling expansion (config.queryExpansion=false) recovers but loses the recall gains it was designed for.
  - 修复: Externalize the expansion system prompt as a configurable locale+domain template (e.g. ctx.config.expansionPromptTemplate) with pluggable few-shot examples, or make expansion locale-aware: detect query script and select a zh/en/ja prompt bundle. Default the prompt to locale-neutral English with domain examples injected from the semantic layer's own domains.

- **packages/data/nl2sql-engine/src/granularity.ts:25 [high/degraded]** TREND_PATTERN = /趋势\|变化\|逐日\|每天\|近\d+天\|日均\|环比\|同比\|每周\|每月\|增长\|下降\|走势/ is an all-Chinese keyword list. detectTrendIntent() returns false for any English or Japanese query (trend, growth, daily, day-over-day, 週次, 推移, 増減) because none of those substrings are in the regex.
  - 影响: When trend intent is missed, rule 9 (prefer _di daily-granularity tables) and the granularity reranker (rerankByGranularity, ×1.5 boost) never fire. Trend/time-series queries silently get snapshot (_df) tables instead of daily (_di) tables — a wrong-granularity result with no error signal.
  - 修复: Replace the keyword regex with a locale-aware lexicon (a map of locale→trend-synonym arrays) or an LLM-based intent classifier, and/or add English/Japanese trend terms (trend, change, daily, WoW, MoM, growth, decline, 推移, 変化, 週次, 増減).

- **packages/data/phase-gate/src/domain.ts:47 [high/degraded]** The honest-decline/routing protocol uses hardcoded Chinese marker tokens: DECOMPOSITION_MARKER='【拆解】' (line 47), INCOMPLETE_MARKER='【未完成】' (line 52), and ROUTE_MARKER_REGEX=/【route:(proceed\|clarify\|decline)】/ (line 71) which matches ONLY CJK full-width brackets 【】 (U+3010/U+3011). INCOMPLETE_MARKER is parsed by phase-gate.ts:862 (phaseOutput.includes(INCOMPLETE_MARKER)); ROUTE_MARKER_REGEX is parsed at domain.ts:82. The English BASE_PERSONA teaches the LLM to emit these Chinese tokens as literal strings.
  - 影响: The protocol is self-consistent today (prompt teaches the exact token, parser matches it), but there is NO i18n seam: localizing the markers (e.g. to [INCOMPLETE] or ASCII [route:proceed]) requires changing both the persona text and the parser constants/regex in lockstep. If a localizer changes only the prompt, the gate parser silently stops matching — the agent loses its honest-decline path (fabricates instead) or its route-gate (defaults to proceed blindly). The CJK-bracket-only regex also means a model that emits ASCII [route:decline] is treated as no-token.
  - 修复: Make markers locale-configurable constants loaded from a locale bundle, and broaden ROUTE_MARKER_REGEX to accept both 【route:...】 and [route:...] (and optionally <route:...>). Define markers as a locale-keyed config object so prompt and parser share one source of truth.

- **packages/eval/eval-runner/src/sql_semantic_judge.ts:70 [high/degraded]** buildJudgePrompt() returns the SQL semantic judge prompt entirely in Chinese: '你是一个 SQL 语义正确性评审 Judge', with all five scoring dimensions (table_selection, field_selection, filter_conditions, aggregation_logic, overall_semantics) described in Chinese and the output-format spec in Chinese. The judge is wired into the eval CLI (context.ts) as LlmSqlSemanticJudge and runs by default when no executor is mounted.
  - 影响: For an English/Japanese enterprise running eval, the LLM judge receives Chinese instructions. While the LLM may still score SQL (SQL is language-neutral), the dimension rationale and the '总量/趋势/分布/占比' aggregation semantics are Chinese-only, risking mis-scoring of English-query SQL and producing Chinese rationale text in English eval reports. Eval reliability for non-Chinese deployments is questionable.
  - 修复: Externalize the judge prompt as a locale template; the five dimension names are already English keys in the JSON output, so the prompt can be a locale-neutral English template with the dimension descriptions loaded from a bundle.

- **packages/data/semantic-layer/src/enrichment.ts:118 [medium/degraded]** mergeRefs() identifies the 'generic deterministic' derivation to be overridden by checking ex.derivation.startsWith('确定性') — a Chinese prefix baked into general merge logic. The deterministic derivations themselves are Chinese strings ('确定性：DWS 列 ... 与 ... 主键精确同名', lines 76 and 348).
  - 影响: If the deterministic derivation string is localized to English (e.g. 'Deterministic: DWS column ... matches ... primary key'), startsWith('确定性') returns false, so the merge logic no longer recognizes it as the generic derivation — the LLM/semantic derivation would NOT override it, and human-curated derivations could be clobbered. The merge precedence silently changes behavior under localization.
  - 修复: Replace the string-prefix sniff with a structured 'source' field on DimensionRef (e.g. source: 'deterministic'\|'llm'\|'curated') so merge precedence is type-driven, not string-driven. Localize the derivation display text separately from the source classification.

- **packages/data/nl2sql-engine/src/bm25-linking.ts:72 [medium/degraded]** tokenize() matches CJK via /[一-鿿]+/g (U+4E00–U+9FAF, CJK Unified Ideographs only). Japanese hiragana (U+3040–U+309F) and katakana (U+30A0–U+30FF) are NOT in this range and are not matched by the ASCII branch either, so kana tokens are silently dropped from both query and corpus indexing.
  - 影响: For a Japanese enterprise, queries like 'デイリーアクティブユーザー' lose all katakana/hiragana tokens; only the kanji portion (日/活/跃/用/户) is tokenized. BM25 recall degrades because Japanese business terms written in kana never match. English queries are unaffected (ASCII path). Chinese queries are unaffected (ideographs covered).
  - 修复: Broaden the CJK regex to include hiragana/katakana ranges (\u3040-\u309F\u30A0-\u30FF) and ideally use a real morphological tokenizer (nodejieba/kuromoji) per the module's own TODO, or pluggable via the P5 ctx.retrieval seam tokenizer.

- **packages/data/tool-search-data-sources/src/index.ts:303 [medium/degraded]** extractQueryTerms() uses cjkRe = /^[一-鿿㐀-䶿]+$/ (CJK Unified Ideographs + Extension A) and splits on CJK full-width punctuation (，。？！、；：（）【】). Same kana gap as bm25-linking.ts: Japanese hiragana/katakana tokens are not matched by cjkRe and fall to the else branch where the CJK sub-segment match /[一-鿿㐀-䶿]+/g also excludes kana, so kana-only terms are dropped from alias-fusion resolution.
  - 影响: For Japanese queries, alias resolution (applyAliasFusion/applyContinuousBlend) receives no kana terms, so graph-based alias boosting misses Japanese business vocabulary written in kana. English queries work (ASCII tokenization); Chinese works (ideographs).
  - 修复: Extend the CJK regex ranges to include hiragana/katakana, or route term extraction through the same pluggable tokenizer as bm25-linking.ts so both sites stay consistent.

- **packages/data/tool-resolve-term/src/index.ts:46 [medium/degraded]** The resolve_term tool description sent to the LLM is entirely Chinese ('将业务术语精确解析为数据资产...用于消歧'), the term parameter description is Chinese ('要解析的业务术语（如 "DAU"、"付费用户"、"活跃"）'), and the render output is Chinese ('未找到匹配...的数据资产', '解析到...个数据资产', '别名:', '关联:').
  - 影响: For an English/Japanese enterprise, the tool description the LLM reads is Chinese, creating an inconsistent multilingual tool catalog (most other tools have English descriptions). The LLM may still call it (multilingual models), but tool-selection quality and the rendered result text (shown to users) are in the wrong language.
  - 修复: Externalize tool description/parameter/render strings into a locale bundle (the other ~20 tools already use English descriptions — align this one). Keep the tool logic (graph.resolveAlias) locale-neutral as it already is.

- **packages/data/nl2sql-engine/src/conventions.ts:33 [medium/degraded]** renderConventionsPrompt() bakes Chinese section headers and table columns into the rendered dialect cheatsheet: '## 方言速查', '## 可用函数', '## 字段逻辑类型 → CAST 映射', '## 典型查询模板', and table headers '\| 逻辑类型 \| 含义 \| 写法 \|'. The placeholder for null conventions is '（无 conventions）'. This rendered text is injected into the NL2SQL prompt.
  - 影响: Even if the engine conventions YAML data is in English, the rendered section headers and table labels remain Chinese, so the dialect grounding section of an English-deployment prompt is a mix of English data under Chinese headers. The prompt becomes harder for an English-optimized LLM to parse.
  - 修复: Externalize the render template (headers, labels, placeholders) as a locale bundle; the conventions data (key_differences, functions, cast_map, sql_templates) is already engine-provided and locale-neutral.

- **packages/data/tool-suggest-followups/src/index.ts:63 [low/degraded]** The tool description tells the LLM the follow-up label must be 'of at most ~8 Chinese characters' (line 63) and the parameter schema description says '≤ 8 Chinese characters' (line 73). This is a Chinese-specific length constraint baked into a general tool.
  - 影响: For an English enterprise, '8 Chinese characters' is the wrong unit — English labels need ~3-6 words or a higher character budget. The LLM may produce over-truncated English labels. Japanese labels (mixed kanji/kana) may also not fit the 'Chinese characters' framing. The tool still functions; the guidance is just wrong.
  - 修复: Replace 'Chinese characters' with a locale-neutral 'short label (≤ ~20 chars / ≤ 4 words)' and let the UI enforce a display width rather than a character count.

- **packages/data/nl2sql-engine/src/prompt.ts:22 [low/degraded]** granularityTag() appends Chinese tags to candidate descriptions in the prompt: ' [日粒度]' for _di tables, ' [快照]' for _df tables. These Chinese labels appear inline in the candidate list rendered into the GENERATION prompt.
  - 影响: For an English/Japanese deployment, the candidate list in the prompt carries Chinese granularity labels, adding foreign-language noise to an otherwise (potentially) localized prompt. Cosmetic; does not break SQL generation.
  - 修复: Localize the tag strings via a locale bundle, or replace with locale-neutral symbols (e.g. [D], [S]) driven by the conventions/config.

- **packages/eval/eval/src/classify_failure.ts:40 [low/degraded]** PATIENCE_MARKERS are Chinese-only: ['耐心阈值', '放弃等待仍在运行的查询'] (line 40). The guard/timeout/syntax buckets are bilingual (English + Chinese substrings, lines 56-59), but the patience bucket has no English equivalent. PATIENCE_ABANDONED_MARKER is self-stamped by this codebase (self-consistent), but '耐心阈值' may arrive from an external source.
  - 影响: For a non-MaxCompute engine whose 'still running / patience exhausted' signal uses English (e.g. 'query still running', 'patience exhausted'), the patience bucket is missed and the error falls through to 'infrastructure' (the default) — a misclassification, but one that grants the fewest consequences (refuse+resubmit), so the blast radius is small. The bilingual patterns on the other buckets mitigate the rest.
  - 修复: Add English patience phrases ('patience', 'still running', 'abandoned', 'query pending') to PATIENCE_MARKERS, or make the marker list locale/config-driven.

- **packages/data/tool-load-event-definition/src/index.ts:354 [low/works]** The tool description is English but embeds a Chinese gloss parenthetically: 'Load a validated event (埋点) definition'. '埋点' (event tracking/instrumentation) is a Chinese-specific term.
  - 影响: For an English enterprise, the parenthetical '埋点' is unexplained foreign text in an otherwise English tool description. Minor confusion; the tool works because the rest of the description is English and clear.
  - 修复: Drop the Chinese gloss or replace with a locale-neutral term ('instrumented event' / 'tracking event'), or localize via a bundle.

- **packages/eval/eval-cli/src/context.ts:221 [low/degraded]** The eval CLI ships its own copy of the Chinese game-specific EXPANSION_SYSTEM_PROMPT (lines 221-230), duplicating expand-query.ts, and buildSchemaContext renders a Chinese '[粒度: ...]' label (line 375).
  - 影响: Eval runs for an English enterprise use the same Chinese game-domain expansion prompt as production, so eval retrieval measurements do not reflect an English deployment's actual recall. The [粒度] label adds Chinese noise to the SQL judge's schema context.
  - 修复: Import the expansion prompt from expand-query.ts (single source) once it is externalized per finding #2; localize the [粒度] label or drop it.

- **packages/data/phase-gate/src/phase-gate.ts:118 [low/degraded]** The INTERPRETATION-phase instruction string (English prose) embeds Chinese marker tokens 【发现】 and 【注意】 as required output markers: 'compute → 【发现】(once) → 【注意】(once, list assumptions)'. These Chinese tokens are taught as literal output markers in an otherwise English phase prompt.
  - 影响: For an English enterprise, the LLM is told (in English) to emit Chinese words '发现'/'注意' as literal markers in its delivery. It can comply, but the user-facing delivery contains unexplained Chinese tokens. If the markers are not parsed by code (they appear to be presentation-only), the risk is cosmetic; if a future parser matches them, they join the domain.ts marker-localization hazard.
  - 修复: Make these markers locale-configurable alongside INCOMPLETE_MARKER/DECOMPOSITION_MARKER, or replace with locale-neutral symbols (e.g. [insight], [caveats]) drawn from the same marker bundle.

### d5-eval-portability — 7 条

> The eval CORE is portable: the case schema (eval_case.ts) is dialect-agnostic (result_value + match_mode + answer, no expected_tables/expected_sql), scoring.ts/match_modes.ts judge result values not SQL strings, and the DELIVERY judge prompt (eval-runner-service index.ts:222) is English/generic. The breaks are in the framework AROUND the core: failure classification is ODPS+Chinese-bound, the SQL semantic judge prompt is Chinese with K11 intent terms, the trend tool buckets by k11v2_* case-id naming, and the production eval-runner-service hardcodes a k11_ filename regex + scopeId. The L1-L4/intent taxonomy is dead metadata (defined in cases, consumed nowhere in src), so it is not K11-shaped but also yields no trend breakdown.

- **packages/eval/eval/src/classify_failure.ts:56 [high/degraded]** classifyExecutionFailure hardcodes MaxCompute/ODPS error codes (odps-0010000 line 58, odps-0130131 line 60), the ODPS phrase 'semantic analysis exception' (line 59), and Chinese markers (缺少分区/必需谓词 line 56, 超时 line 58, 语法 line 59, 耐心阈值 line 40) to bucket engine errors into syntax_error/guard_rejected/timeout/patience/infrastructure.
  - 影响: On a non-MaxCompute engine (Snowflake/BigQuery/Postgres) genuine syntax errors carry different messages (e.g. 'syntax error at or near', 'relation does not exist') that match none of the ODPS patterns and fall through to the default 'infrastructure' class. Infrastructure means refuse/not-score/resubmittable, so real SQL defects on other engines are silently NOT scored as failures — the case reports unjudged/infra_failure instead of wrong. A non-Chinese engine also misses every Chinese marker. This is silent wrong scoring on any engine or language switch.
  - 修复: Externalize the error-pattern table per engine (a FailureClassifier interface with ODPS/Snowflake/BigQuery/Postgres implementations, or a config map of dialect→regex list). Add English/Postgres patterns ('syntax error at or near', 'relation .* does not exist', 'column .* does not exist', 'permission denied') so non-ODPS syntax errors classify as syntax_error, not infrastructure.

- **packages/eval/eval-runner/src/sql_semantic_judge.ts:70 [medium/degraded]** The SQL semantic judge prompt (buildJudgePrompt, line 69-103) is authored entirely in Chinese, and the aggregation_logic dimension (line 90) anchors correctness to the K11 intent vocabulary '总量/趋势/分布/占比' (total/trend/distribution/proportion) — the exact intents in generate-k11.mjs.
  - 影响: For an English-language scope (e-commerce/finance/SaaS in English) the judge prompt is in the wrong language, and the aggregation-logic dimension asks whether the SQL matches '总量/趋势/分布/占比' semantics that a finance scope (revenue/profit/variance) does not use, so dimension 4 mis-scores. In SQL-only mode (no executor) this judge IS the sole execution signal, so a non-K11/English scope gets a Chinese prompt with K11 intent terms as the only correctness gate. The 5 dimensions themselves are general; only the prompt text and intent cues are K11-bound. Note: the SQL judge is dialect-agnostic (no MaxCompute SQL assumptions) — the break is language + intent vocabulary, not engine dialect.
  - 修复: Parameterize the judge prompt (locale + intent-term list injected via constructor) and provide an English prompt variant. Drop the hardcoded '总量/趋势/分布/占比' enumeration from the aggregation_logic rubric; let the LLM infer aggregation intent from the question generically, or pass the case's query_intent dimension into the prompt instead of hardcoding K11 intents.

- **packages/eval/eval-cli/src/compare.ts:76 [medium/degraded]** The trend-comparison category breakdown is hardbound to k11-v2 case-id naming: classifyCase (line 75-82) returns 'Alias' for ids containing '_alias_' and 'Voice' for '_voice_', the Category union (line 38) is the K11-specific set {Original, Alias, Voice EXEC, Voice DELIVERY, Voice}, and defaultCasesDir (line 130) is hardcoded to 'packages/eval/eval/cases/k11-v2'.
  - 影响: For a non-K11 scope, case_ids carry no '_alias_'/'_voice_' substring, so every case buckets as 'Original' and the per-category delta table (the tool's stated purpose) collapses to a single row — category-level trends are invisible. loadDeliveryCaseIds reads the k11-v2 dir to split Voice, which is meaningless for a non-K11 run. Overall pass-rate delta and case-level flips still work, so the tool is degraded, not broken. There is no dimension-driven breakdown (by sql_complexity L1-L4 or query_intent) because the framework never reads those dimensions.
  - 修复: Drive categories from case dimensions (e.g. group by dimensions.query_intent or dimensions.sql_complexity) loaded from whatever case dir the runs reference, instead of substring-matching k11v2_* ids. Make the cases-dir a required parameter (not a hardcoded k11-v2 default) and derive category keys from the actual case metadata.

- **packages/eval/eval-runner-service/src/index.ts:391 [high/broken]** The production eval-runner-service case loader filters filenames with the hardcoded regex /^k11_\d+\.yaml$/ (line 391), the default caseDir is 'packages/eval/eval/cases/k11' (line 379, a dir that does not exist — the live cases are k11-v2/ named k11v2_NNN.yaml), and scopeId is hardcoded to 'k11' (line 418) for every run.
  - 影响: The regex rejects any case file not named k11_NNN.yaml, so pointing caseDir at a non-K11 scope (ecom_001.yaml, fin_metric_005.yaml) yields zero matches -> getCaseCount()=0 -> runBatch throws 'no cases found'. Even the actual K11 cases (k11v2_*) are rejected by the regex, so the default config is stale. scopeId='k11' means every case runs against one fixed scope, making multi-scope/multi-tenant eval impossible through the service. (The standalone eval-cli uses a generic regex /^[a-z0-9]+(_[a-z0-9]+)*_\d+./ and is portable, so the CLI works where the service does not.)
  - 修复: Replace the k11_ regex with the generic glob used by eval-cli (or accept all *.yaml/*.yml/*.json). Make caseDir + scopeId required config (no k11 default). Read scope_id per-case from the case's input.scope_id rather than stamping a single 'k11'.

- **packages/eval/eval-runner/src/verdict_mapper.ts:94 [medium/degraded]** isInfraLikeError (line 94-104) and isDeclineError (line 108-114) match only English substrings ('timeout','connection','wall-clock timeout','decline','cannot answer','i cannot',"i can't"). There are no Chinese equivalents.
  - 影响: This is inconsistent with classify_failure.ts which has Chinese markers: the engine-layer classification understands Chinese infra/patience messages, but the runner-layer verdict mapper does not. For a Chinese-language agent that surfaces a Chinese decline or infra error string, isDeclineError/isInfraLikeError miss it -> declines are mislabeled 'wrong' instead of 'declined' and Chinese infra errors may not map to 'infra_failure'. The engine responder today emits English 'Declined: ...' so K11 happens to pass, but any non-English agent or harness variant breaks the verdict taxonomy.
  - 修复: Reuse the classify_failure engine-pattern set (or call classifyExecutionFailure) at this layer too, and add Chinese decline phrases ('无法回答','不能回答','无法提供','拒绝'). Better: have the engine stamp a structured FailureClass/decline flag rather than relying on substring heuristics in two places with divergent vocabularies.

- **packages/eval/eval/src/text_sim.ts:23 [medium/degraded]** Both similarity sites use character 3-grams with threshold 0.35: DERAILMENT_THRESHOLD=0.35 (line 23, non-tunable) and DELIVERY_THRESHOLD=0.35 (line 29). charNgrams (line 39) grams over raw characters; token-containment (deliveryFuzzyMatch) splits on /\s+/ which yields one whole-string token for unspaced CJK.
  - 影响: The 0.35 char-trigram threshold is calibrated for CJK (3-char Chinese windows are discriminative) and is deliberately lenient for derailment. For an English/whitespace-delimited scope, 0.35 char-trigram overlap is far too lenient: antonym pairs like 'revenue increased' vs 'revenue decreased' share enough trigrams to clear 0.35 in the DELIVERY fuzzy layer, so a wrong-direction prose answer can pass a terminal assertion (silent false-positive). The derailment threshold is not injectable (no opts), so it cannot be tightened per language without editing source.
  - 修复: Make DERAILMENT_THRESHOLD injectable (thread an opts param like DeliveryFuzzyOpts). Add a language-aware threshold preset (higher, e.g. 0.55, for whitespace-delimited languages) and consider word-level token overlap for English rather than char-trigrams, while keeping char-trigrams for CJK.

- **packages/eval/eval/cases/generate-k11.mjs:8 [low/degraded]** The case-authoring generator is K11-bound: TABLES_DIR hardcodes 'examples/k11-semantic-layer/tables' (line 8), desc() strips the K11 project id '10000251' (line 56), table selection assumes MaxCompute DWS/DIM naming (dws_/dim_ filters, lines 13/17), and all question templates are Chinese (INTENTS, line 21+).
  - 影响: This is a one-shot case-template tool, not core framework, and cases being scope-specific test data is legitimate (the schema itself is portable). But there is no portable case generator: to bootstrap cases for e-commerce/finance/SaaS you must rewrite this script from scratch (new table dir, new project id, new intent vocabulary, new language). The generated cases also stamp placeholder result_values ({total:12345}) that must be hand-corrected per scope. covered_assets in dimensions carry K11 table names but the framework consumes them nowhere, so they are inert metadata.
  - 修复: Either document generate-k11.mjs as a K11-only throwaway (and provide a scope-agnostic template/generator that takes a semantic-layer dir + locale + intent list as config), or remove it from the portable surface and ship only the schema + a case-loader. At minimum, externalize the project-id regex, table-prefix filters, and question-language into parameters.

### d6-single-scope-tenant — 7 条

> The architecture assumes a single globally-active scope: ScopeRegistry holds one `active` pointer in a shared YAML file (read fresh from disk on every call, so it is shared across processes, not just one), and every SemanticLayerService read (definitions, relation graph, retrieval corpus) routes through that active scope's root with no per-request/per-tenant scope context — concurrent multi-tenant or concurrent multi-scope requests interleave on the global pointer and cross-contaminate table data. Caches keyed by corpusVersion() (graphCache, SchemaGateway linker, tool-search-data-sources enriched linker) DO invalidate on switch, but tool-retrieve's BM25 linker cache has no version check and serves the prior scope's corpus after a switch; InProcRetrieval likewise holds a frozen corpus with no invalidation. The eval-result store and the scope-awareness system-prompt section are not scope/tenant-filtered, so eval coverage answers and scope metadata leak across scopes/tenants.

- **packages/data/scope-registry/src/index.ts:142 [critical/broken]** The active scope is a per-process (actually per-shared-YAML) singleton. setActive(id) writes one global `active` field; active()/activeId() read it fresh from the registry file on every call (load() at ~206 does readFileSync with no cache). The header comment (line 13) explicitly declares 'Active scope is a per-process singleton'. There is no tenant, session, or request scoping — grep for tenant/sessionId/AsyncLocalStorage/requestContext across packages/data returns zero matches.
  - 影响: In a multi-tenant SaaS (or any concurrent multi-scope deployment), tenant A switching to scopeA and tenant B switching to scopeB race on the single `active` field; because load() re-reads the file every call, even separate processes share the last writer's scope — tenant A's next read returns scopeB's semantic root, leaking another tenant's table data. Sequential single-tenant multi-scope works (switch then query), but 'multiple scopes coexisting' is impossible: only one scope can be active at a time.
  - 修复: Make scope selection per-request, not global: pass an explicit scopeId through the call chain (or use AsyncLocalStorage/request context keyed by tenant+session) so each request addresses its own scope. The registry should resolve scope definitions by id without a single mutable `active` pointer; if a default is needed, keep it per-session/per-tenant, not in a shared cross-process file.

- **packages/data/semantic-layer/src/index.ts:530 [critical/broken]** semanticRoot (line 530-531) and scopeId (line 539) getters delegate unconditionally to ctx.scopes.active() — the single global active scope. loadTableDefinition/loadEventDefinition/loadMetricDefinition/getRelationGraph/acquireSnapshot all read this.semanticRoot with no scopeId parameter, so a read cannot address a non-active scope without first mutating the global active pointer.
  - 影响: This is the load-bearing delegation that turns the global active scope into an actual data leak: a concurrent request for tenant A can return scope B's table/event definitions and relation graph because the active pointer was flipped by tenant B's request mid-flight. There is no per-request scope context to pin a read to its own scope.
  - 修复: Add an optional scopeId (or request-context scope) to the load/getRelationGraph/acquireSnapshot methods and resolve the semanticRoot from ctx.scopes.get(scopeId) rather than ctx.scopes.active(). Until reads can be pinned per-request, multi-tenant concurrency is unsafe.

- **packages/data/tool-scope-routing/src/scope-hint.ts:66 [high/degraded]** buildSummaries() calls scopes.list() and returns ALL registered scopes with no tenant/filter; the summaries are injected into the agent system prompt (scope-awareness section, line 82) and the scope-alias-hint (line 94) for every session. list-scopes.ts:42 does the same in the model-facing list_scopes tool. There is no tenant isolation anywhere in the registry or these tools.
  - 影响: In a multi-tenant SaaS, tenant A's agent sees tenant B's scope names, descriptions, and aliases in its system prompt and in list_scopes output — a cross-tenant metadata leak. The alias-hint can even auto-suggest switching to another tenant's scope. (Single-tenant multi-domain is unaffected — seeing all your own domains is correct.)
  - 修复: Filter scopes.list() by the requesting tenant before building summaries/system-prompt text; carry tenant context on the tool call and enforce it server-side. Add a tenant field to ScopeDefinition metadata and gate list/get/setActive by tenant.

- **packages/data/tool-retrieve/src/index.ts:134 [medium/degraded]** The enrichedLinkers WeakMap is keyed ONLY by the schema instance (the singleton ctx.schema) with NO corpusVersion() check: getEnrichedLinker (line 141-146) builds the Bm25Linker once and never rebuilds. The SchemaCorpusSource interface (line 124) lacks corpusVersion()/loadRetrievalCorpusAll() that the sibling tool-search-data-sources added (D2f, search-data-sources:403,411-417). So after a scope switch the cached linker still holds the prior scope's corpus.
  - 影响: When retrieve is mounted and the active scope switches, the tool silently returns the OLD scope's data-source candidates (a cross-scope data leak / wrong results). This is the exact stale-linker bug tool-search-data-sources fixed via corpusVersion; retrieve was intended to mirror it (its header says so) but the version check was dropped. Calibrated medium because the tool ships dormant (not in any preset/bundle whitelist) — it only bites when a user mounts it for multi-scope.
  - 修复: Port the D2f version check from tool-search-data-sources: change enrichedLinkers to WeakMap<SchemaCorpusSource, {linker, version}>, call schema.corpusVersion?.() in getEnrichedLinker, rebuild on mismatch, and prefer loadRetrievalCorpusAll?.() over loadRetrievalCorpus().

- **packages/data/evidence-query/src/index.ts:245 [high/degraded]** EvidenceQueryService constructs ONE eval store from a single static resultsDir (line 245-248); FileBackedEvalResultStore (line 150-151) loads ALL JSONL files from that dir into one in-memory list. EvalResultRecord has no scope field, and query()/hasResultsFor() (line 101) filter only by assetId/status/domain/runId — never by scope.
  - 影响: In multi-scope, eval results from scope A and scope B co-mingle in one store. gapAnalysis (line 338) and assetHealth (line 543/560/575) call hasResultsFor(targetId) which returns true if ANY scope has eval coverage for that asset id — so scope B's coverage can mask scope A's gaps, yielding silently wrong gap-analysis and asset-health results across scopes. The resultsDir is not re-resolved when the active scope changes.
  - 修复: Key the eval store per scope (construct/refresh from the active scope's resultsDir, or stamp each record with a scope_id and filter by it). Re-resolve the directory on scope switch (listen to scopes/active-changed, which this service currently does not).

- **packages/retrieval/retrieval-inproc/src/index.ts:57 [medium/degraded]** InProcRetrieval builds the HybridRetriever once in the constructor from config.dataSources (line 57-59) and never rebuilds it. HybridRetriever embeds the corpus (BM25 idf + embedded vectors) with no corpusVersion/scope awareness and no invalidation hook. The search/retrieve tools PREFER ctx.retrieval over ctx.schema, so when mounted this stale retriever shadows the (correct, version-aware) ctx.schema path.
  - 影响: If wired with a real corpus snapshot (the intended P6b wiring 'corpus arrives from ctx.schema'), a scope switch leaves the retriever serving the prior scope's candidates — silent wrong-scope results. The corpus is frozen at mount time. Calibrated medium because the provider is optional and not currently mounted in any bundle/preset (the tools fall back to ctx.schema, which is correct).
  - 修复: Give InProcRetrieval a corpus source it can re-probe (e.g., accept a SchemaCorpusSource and call corpusVersion() to decide whether to rebuild the HybridRetriever), mirroring tool-search-data-sources' version-gated rebuild. Avoid snapshotting the corpus at construction.

- **packages/data/semantic-layer/src/snapshot.ts:173 [low/works]** _snapshotCache is a module-level Map<string, CachedSnapshot> keyed by semanticRoot path. Entries are added on every captureSnapshot for a new path but never evicted; clearSnapshotCache() (line 211) is documented as test-only.
  - 影响: Not a correctness/cross-contamination issue — the cache is keyed by (semanticRoot, version) and corpusVersion bumps its epoch on every scope switch, so a stale entry is never served to the wrong scope. But as scopes are added/removed over a long-lived process, the tables/events/corpus arrays for every previously-visited scope accumulate in memory indefinitely (unbounded growth / leak).
  - 修复: Bound the cache (LRU) or clear entries for a scope when it is removed from the registry (listen to scopes/changed). Low priority since it is a leak, not a data-integrity issue.

### d7-enrichment-pipeline — 9 条

> The enrichment pipeline is hard-wired to the DWS/DIM star-schema model: buildDimInventory scans only kind='dim' tables, discoverRelationsDeterministic requires exact PK-column-name equality, and the LLM prompt asks only for joins to DIM primary keys. For a non-star schema (flat wide tables, event-sourced, denormalized OLTP) the dim inventory is empty, so both rounds return [] and enrichAllDwsTables silently writes dimension_refs:[] to every table (wiping curated refs in replace mode) while reporting enriched:0 — a silent no-op. Minimal shape to function: >=1 kind='dim' table whose primary_key column name appears verbatim on a kind='dws' table.

- **packages/data/semantic-layer/src/enrichment.ts:226 [high/degraded]** buildDimInventory builds the relation-discovery inventory exclusively from tables where kind==='dim' (line 230: 'if (!r.success \|\| r.data.kind !== "dim") continue'). Any table that is not explicitly a DIM is excluded from the inventory that drives all relation discovery.
  - 影响: On a flat-wide-table / event-sourced / denormalized-OLTP scope with no kind='dim' tables, the inventory is empty, so discoverRelationsFor and the LLM round both yield [] for every table — silent empty enrichment with no error and no signal that the schema model is wrong.
  - 修复: Generalize the inventory to any table with a non-empty primary_key (not only kind='dim'), or accept a configurable predicate defining 'joinable' tables, so non-star schemas can still discover inter-table joins.

- **packages/data/semantic-layer/src/enrichment.ts:316 [high/degraded]** enrichAllDwsTables processes only kind!=='dim' tables (line 311) and, with the default mergeExisting=false, writes dimension_refs: refs (== []) to each table when discovery returns nothing (line 316), replacing any existing curated refs. The explicit discover_relations tool path (SemanticLayerService.discoverRelations) calls this with mergeExisting unset => false (replace).
  - 影响: Running the discover_relations agent tool on a non-star scope wipes every table's existing dimension_refs with [] and returns enriched:0/written:N — a silent no-op that also destroys human-curated joins, with no indication that the schema model doesn't fit.
  - 修复: When the dim inventory is empty, short-circuit with a clear message ('no joinable dimension tables found; skipping relation discovery') instead of writing empty refs; and default mergeExisting=true so discovery can never wipe curated joins it does not rediscover.

- **packages/data/semantic-layer/src/enrichment.ts:71 [high/degraded]** discoverRelationsDeterministic only emits a DimensionRef when a DIM primary_key column name EXACTLY equals a column on the target DWS (line 71: 'dim.primary_key.filter(pk => colNames.has(pk))'). No FK-naming heuristic, no suffix/prefix/semantic match in the deterministic round.
  - 影响: Even in a valid star schema, surrogate/FK columns named differently from the referenced PK (fact.user_id -> dim_user.id; fact.buyer_id -> dim_user.user_id — the common real-world case) get zero deterministic relations. Only the optional LLM round can recover them, and only when a llmCall is injected AND a dim inventory exists; in deterministic-only deployments these joins are silently missing.
  - 修复: Also match common FK conventions (column ends in _id/_key and equals a dim PK; or column equals <dim_singular>_id); or accept a configured FK->PK map as a deterministic seed alongside exact-name match.

- **packages/data/semantic-layer/src/enrichment.ts:144 [high/degraded]** buildLlmPrompt hardcodes 'Discover dimension (DIM) join relations for the DWS fact table <name>' (line 144) and 'DIM inventory (find joins where a DWS column is a foreign key to a DIM primary_key ...)' (line 151). The supposedly-general LLM prompt is structurally limited to fact->dim star joins.
  - 影响: On a non-star schema (no dim tables) the DIM inventory section is empty and the LLM is constrained to return []; it cannot discover fact->fact, self-joins, bridge/many-to-many tables, or any non-star relation. The LLM round cannot salvage a non-star scope the way it can补救 differently-named FKs in a star scope.
  - 修复: Make the prompt schema-model-agnostic: 'discover join relations between this table and the other tables listed below' with a generic table inventory (name + PK + columns), letting the LLM propose any join — not only fact->dim.

- **packages/data/semantic-layer/src/types.ts:278 [medium/degraded]** TableDefinition.kind is a closed enum ['dws','dim'] defaulting to 'dws' (line 278), and superRefine (lines 286-291) requires kind='dim' tables to declare primary_key + label_columns. There is no kind for a flat wide / denormalized / entity table.
  - 影响: Non-star tables are forced into the 'dws' (fact) role by default, which then feeds the empty enrichment above; there is no schema-level way to express 'this table is neither a fact nor a dimension', so enrichment cannot distinguish a genuine fact from a flat wide table.
  - 修复: Add a third kind (e.g. 'entity'/'flat'/'other') or make kind an open string so non-star tables aren't forced into the dws/dim dichotomy and can be excluded from (or differently handled by) relation enrichment.

- **packages/data/tool-discover-relations/src/index.ts:221 [medium/degraded]** The discover_relations tool description (lines 221-227) and result formatter (line 184: 'enriched N DWS table(s)') are framed exclusively as 'Discover DWS->DIM dimension join relations'.
  - 影响: On a non-DWS/DIM scope the tool still runs but is semantically misleading to the calling model and silently no-ops; the agent gets 'enriched 0 DWS table(s)' with no indication the schema model doesn't match, so it cannot tell a successful no-relation scope from a model mismatch.
  - 修复: Generalize the description to 'discover join relations between tables in the semantic layer' and the formatter to report enriched table(s) generically; note it operates on whatever joinable tables exist.

- **packages/data/semantic-layer/src/enrichment.ts:336 [medium/degraded]** discoverEventRelationsDeterministic (line 336; exact-name match line 343) and buildEventLlmPrompt (line 362; 'DIM inventory (... a foreign key to a DIM primary_key)' line 377) mirror the DWS path: they depend on the same kind='dim'-only inventory and exact PK-name matching.
  - 影响: Event-sourced-first deployments (events as the primary asset, no dim tables) get zero external_refs enrichment — the same silent empty as the DWS path, on a separate code path; event->event or event->table joins cannot be discovered.
  - 修复: Apply the same generalization as the DWS path (generic joinable inventory + model-agnostic prompt); consider event->table and event->event joins, not only event->dim.

- **packages/data/semantic-layer/src/llm-wiring-plugin.ts:36 [low/works]** The wiring plugin defaults provider to 'aga' (in-house China LLM gateway) and model to 'qwen3.7-max' (a China-focused model) when config is absent (lines 36-37).
  - 影响: Out-of-the-box the enrichment LLM round targets a China-specific gateway/model; a non-China deployment (different engine/language) silently uses the wrong defaults unless config is overridden in the bundle, with no fail-loud signal.
  - 修复: Default provider/model to empty and fail-loud ('enrichment-llm-wiring: no provider/model configured') rather than silently falling back to a region-specific gateway.

- **packages/data/semantic-layer/src/enrichment.ts:76 [low/degraded]** Deterministic derivation strings are hardcoded Chinese ('确定性：DWS 列 ... 与 ... 主键精确同名' line 76; '确定性：事件字段 ...' line 348) and the event prompt injects the Chinese token '（无）' (line 375) when there are no param fields.
  - 影响: On an English/other-language deployment, dimension_refs.derivation metadata is written in Chinese and a Chinese token leaks into the otherwise-English LLM prompt — a language-portability smell (the function still works).
  - 修复: Make derivation text a neutral template (e.g. 'deterministic: column {pks} exact-matches PK of {dim_table}') and replace '（无）' with '(none)' so enrichment output is language-agnostic.

### d8-mgmt-preset — 6 条

> The management persona and its per-phase instructions are hardcoded K11/game/ODPS content baked into the phase-gate plugin (the A/C default preset) with no config field to override the persona text, so a non-game deployment gets a wrong, non-overridable agent identity plus wrong SQL dialect/table conventions. The B variant ships the same 'per-game' persona as a config value (overridable but wrong-by-default). The eval-trigger policy thresholds (K/N), goal-tool blocked-threshold, and hint-escalation threshold ARE configurable and domain-neutral (verified, not findings), but the shipped bundle wires the eval case set, semantic root, and ODPS project to K11 paths, so the no-progress backstop silently measures against K11 cases for any deployment that does not override them. The B->A layout auto-flip default of 3 is a hook option that no host config exposes, leaving the K11-tuned threshold effectively hardcoded.

- **packages/data/phase-gate/src/phase-gate.ts:85 [critical/broken]** BASE_PERSONA is a hardcoded const: 'You are a data agent for a per-game analytics platform...' and is registered verbatim at line 958 (text: BASE_PERSONA). The phase-gate Config schema (index.ts) exposes scopeId + budget knobs but NO persona-text field, so the management persona for the default A/C preset is non-overridable without forking the package. The agent.cordis.yml comment confirms phase-gate 'owns the persona' and the preset mounts NO separate persona row.
  - 影响: A non-game deployment (e.g. finance, retail) gets a management agent whose core identity tells the model it serves a 'per-game analytics platform' — wrong domain framing the model carries into every question, with no deployment knob to fix it.
  - 修复: Add a `personaText` (or `basePersona`) field to PhaseGateConfig/Config defaulting to BASE_PERSONA, and read config.personaText in register() line 958. Alternatively, drop phase-gate's persona ownership and mount the dsh-persona row (text already config-supplied) in agent.cordis.yml so deployments override text without forking.

- **packages/data/phase-gate/src/phase-gate.ts:93 [high/broken]** PHASE_INSTRUCTIONS and buildSqlConventions hardcode K11/ODPS specifics into the system-prompt assembly: UNDERSTANDING (line 89/93) bakes `ods_*`/`dws_*` table patterns, `game.role.online` event names, and `DAU/MAU/pay_amt` metrics; buildSqlConventions (line 136) hardcodes the string 'SQL conventions (MaxCompute/hive dialect): partition predicate ds=yyyyMMdd ... GET_JSON_OBJECT ... event_params'. These consts are not config-driven (only event_view.full_name/params_extract_template are read from the semantic-layer config; the dialect and partition conventions are not).
  - 影响: For a non-ODPS engine (Snowflake/BigQuery/Postgres) the persona teaches the wrong SQL dialect and partition predicate syntax, and for a non-game domain the ods_*/dws_*/game.role.online naming conventions do not match the schema — the model silently follows wrong conventions producing bad or non-executable SQL.
  - 修复: Drive SQL conventions from an engine profile (engineType -> dialect/partition-syntax map) sourced from the query provider, and make table-prefix/event-name conventions data-driven from the semantic-layer schema rather than hardcoded literals in PHASE_INSTRUCTIONS.

- **apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24 [medium/degraded]** The B variant persona row ships config.text = 'You are a data agent for a per-game analytics platform...' (the same game-domain identity as the A/C hardcoded persona). Unlike A/C this IS config-supplied and overridable, but the shipped value is K11/game-specific, so a deployment copying this preset inherits the wrong persona unless it edits the text.
  - 影响: A non-game deployment that selects the B (free-ReAct + planning) variant gets a 'per-game analytics platform' persona by default; the model is mis-framed until an operator notices and overrides the text field.
  - 修复: Replace the shipped persona text with a domain-neutral template parameterized by a {{domain}} prompt variable (resolved from scope/deployment config), or document that deployments must override `text`.

- **packages/data/phase-gate/src/index.ts:70 [medium/degraded]** The scopeId config field defaults to 'game-1' (a game scope id): index.ts:70 `z.string().default('game-1')`, phase-gate.ts:152 `config.scopeId ?? 'game-1'`, domain.ts:231 `freshPhaseGateState(scopeId = 'game-1')`, and agent.cordis.yml sets `scopeId: game-1`. The field is configurable, but the default and the docstring ('e.g. game id') bake in the game assumption.
  - 影响: A deployment that does not set scopeId gets 'game-1' as the per-agent phase-gate state root and the scope id surfaced to scope routing/multi-scope logic, leaking a game-specific id into a non-game or multi-tenant deployment where it may collide with real scope ids or mislabel the active scope.
  - 修复: Default scopeId to a neutral value ('default' or 'primary') or make it required; update the docstring to a domain-neutral example.

- **packages/bundle/data-agent/cordis.patch.yml:178 [high/degraded]** The shipped data-agent bundle patch hardcodes K11 paths: caseDir: ./packages/eval/eval/cases/k11 (line 178), defaultProject: ieu_cdm (line 125, the K11 ODPS project), semanticRoot: ./examples/k11-semantic-layer (line 162). The autonomous-loop eval-trigger policy (goal-eval-policy) calls evalRunner.runBatch() which runs the case set at caseDir, so the no-progress backstop (block after N=3 no-improvement) judges improvement against the K11 game case set for ANY deployment that does not override these. The K/N thresholds themselves are configurable and domain-neutral (not the problem); the case set they gate against is K11.
  - 影响: A non-K11 deployment that mounts the bundle as-shipped runs its eval against the K11 game case set, so the no-progress backstop blocks/unblocks goals based on K11 case flips that are meaningless for the real domain — silent wrong autonomous-loop behavior.
  - 修复: Make caseDir/defaultProject/semanticRoot required deployment-time fields with no K11 default (fail-loud when unset), or default them to empty and refuse eval until configured; ship a non-K11 example case set.

- **packages/client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:47 [low/degraded]** The B->A layout auto-flip uses `evalRunCount >= threshold` with autoFlipThreshold defaulting to 3 (lines 23, 47, 51). The threshold is a hook option, but NO host config ever passes it: the SemanticLayerShell wiring (client/index.ts:139) hardcodes `layoutMode: 'auto'` and injects only openOrCreateSession/evidenceClient, so autoFlipThreshold is stuck at the K11-tuned default of 3 (3 eval runs). There is no plugin-level config knob to tune or disable the flip.
  - 影响: A non-K11 deployment cannot tune when the semantic-layer UI flips from workspace-first (B) to dashboard-first (A); the K11-tuned threshold of 3 eval runs is effectively a hardcoded magic number in practice (UI presentation only, not correctness).
  - 修复: Expose `autoFlipThreshold` and `layoutMode` as config fields on the ui-semantic-layer host plugin and pass them through the `injected()` props at client/index.ts:139.
