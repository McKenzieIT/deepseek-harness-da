# Data Agent

English | [中文](data-agent.zh.md)

The data-agent overlay mounts five Cordis services — `ctx.audit` (append-only audit/tier-2-write store), `ctx.embedder` (embedding/rerank seam), `ctx.identity` (caller identity), `ctx.nl2sql` (NL→SQL engine), `ctx.schema` (semantic-layer: discover/describe/sample data sources) — that together implement natural-language data access.

Source: [`packages/data`](../../packages/data/README.md)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxaudit--audit"></a>

### `ctx.audit` — `Audit`

Per-user audit service. Owns a SQLiteAuditStore (opened synchronously in the constructor) and registers observe-only `tools/post-execute` + `session/event` listeners. The store is a sibling seam (`ctx.audit`), NOT routed through `ctx.storage` (KV-only — no relational tables/indexes).

```ts cordis-catalog
/**
 * Record one tool call from `tools/post-execute` (allowed or denied). A
 * `qoder_call` tag is emitted when the delegating tool surfaced G3 Credits
 * (`result.value.costs`); a denied call is captured as `isError` with the
 * deny reason in `result.error.message` (the real API has no `decision`
 * param, so a distinct `guard_deny` tag is not auto-emitted here — record
 * one explicitly via {@link record} from the P10 intranet tool-gate).
 *
 * @param exec - the post-execute tool view (name, arguments, calling agent's session id).
 * @param result - the tool result view (isError, value/content, error); a deny surfaces as `isError` with the reason in `error.message`.
 */
recordTool(exec: ToolExecView, result: ToolResultView): void

/**
 * Record one `session/event` (emit; observe-only).
 *
 * @param session - the Cordis session that emitted the event (its `id` threads `session_id`).
 * @param event - the session event (`type` + `data`), captured into `extra.event_type`/`extra.details`.
 */
recordSessionEvent(session: Session, event: SessionEvent): void

/**
 * Tier-2 persistent-write 留痕 (mirror RBI record_tier2_write). Hash, NOT
 * body — answers "who/when/which scope/which version", not the content
 * (intranet-security-first). Fail-silent: a 留痕 failure never breaks the
 * business write. Called by P6 semantic-layer etc.
 *
 * @param toolName - the name of the tier-2 tool performing the persistent write.
 * @param payload - the write body (string or JSON-serializable); hashed, never stored as plaintext.
 * @param opts - optional identity override (scope/tenant/user/session ids); absent fields fall back to the resolved caller identity.
 * @returns the appended record's `log_id` (returned even when fail-silent logs the error, so the business write proceeds).
 */
recordTier2Write(toolName: string, payload: unknown, opts: Tier2WriteOpts = {}): string

/**
 * Direct record (test hook + explicit `guard_deny`/correction tagging).
 *
 * @param rec - the audit record payload (or a partial payload normalized via `fromPayload`).
 * @returns the appended record's `log_id`.
 */
record(rec: AuditRecord | Record<string, unknown>): string
```

Types: [Session](session.md) · [SessionEvent](session.md)

Source: [`packages/data/audit/src/index.ts:109`](../../packages/data/audit/src/index.ts)

<a id="ctxcriticctx--criticctxservice"></a>

### `ctx.criticCtx` — `CriticCtxService`

Cordis `Service` exposing the per-agent critic guard context as `ctx.criticCtx`. The critique_sql_tool + evaluate_sql_quality tools probe `ctx.get('criticCtx')` and call `forAgent(agentId)` to get the `CriticCtx` ({candidateTables, eventParams, partitionCols}) for the current agent's phase-gate state. The service registers in whatever isolate realm the composing context carries — the `phase-gating` group isolates `criticCtx` so it lands in that entry-local realm, not root.

```ts cordis-catalog
/**
 * Get the per-agent critic guard context (candidate tables, event params,
 * partition cols) for the given agent. Returns `undefined` when the agent
 * has no phase-gate state (the tool degrades to empty sets + a low
 * confidence — the honest "cannot verify table grounding" state).
 * @param agentId - the harness agent id (stringified) to look up.
 * @returns the `CriticCtx` for this agent, or `undefined` when none exists.
 */
forAgent(agentId: string): CriticCtx | undefined
```

Source: [`packages/data/phase-gate/src/phase-gate.ts:1022`](../../packages/data/phase-gate/src/phase-gate.ts)

<a id="ctxembedder--embedderservice-abstract-seam"></a>

### `ctx.embedder` — `EmbedderService` (abstract seam)

Abstract embedder service. Providers implement `embed` (async — HTTP inference must not block the event loop). `dim` is informational and MAY be `undefined` until the first embed discovers it (HTTP embedder); consumers infer the working dimension from the embedded vectors' length rather than reading `dim` upfront.

```ts cordis-catalog
/**
 * Embed a batch of texts. The result aligns to the input order. A thrown
 * {@link InferenceError} signals the retrieval provider to degrade to
 * BM25-only.
 * @param texts - the texts to embed.
 * @returns one L2-normalized vector per text, aligned to `texts`.
 */
abstract embed(texts: readonly string[]): Promise<EmbedResult>
```

Source: [`packages/embedder/embedder/src/index.ts:89`](../../packages/embedder/embedder/src/index.ts)

<a id="ctxevidencequery--evidencequeryservice"></a>

### `ctx.evidenceQuery` — `EvidenceQueryService`

The evidence-query Cordis Service. Owns the `ctx.evidenceQuery` seam. Requires `ctx.schema` (SemanticLayerService) to be mounted.

```ts cordis-catalog
/**
 * Expose the eval store for W3 wiring and testing.
 * @returns the service's eval result store.
 */
getEvalStore(): EvalResultStore

/**
 * Coverage query: delegates to the same logic as SchemaGateway.getCoverageStats()
 * but enriches with confirmation.status breakdown across all assets.
 * @returns aggregated table/event/metric counts plus per-domain and confirmation-status tallies.
 */
coverageQuery(): EnrichedCoverageStats

/**
 * Gap analysis: given an asset, compute which other assets are reachable via
 * RelationGraph joins but have no eval case coverage.
 * @param assetId - the source asset to compute reachable-but-uncovered gaps from.
 * @returns the source asset plus the list of reachable assets lacking eval coverage (with join paths).
 */
gapAnalysis(assetId: string): GapAnalysisResult

/**
 * Reachability delta: "if we add this relation, which asset pairs become
 * newly reachable via joins?" Clones the current graph, adds the proposed
 * relation, and compares BFS reachability before/after.
 * @param newRelation - the proposed relation to add before recomputing reachability.
 * @returns the proposed relation plus the asset pairs newly reachable via joins after adding it.
 */
reachabilityDelta(newRelation: ProposedRelation): ReachabilityDeltaResult

/**
 * Eval result query: query persisted eval run results.
 * @param filters - the asset/status/domain/limit filters to apply.
 * @returns the matching eval result records plus the total count before limiting.
 */
evalResultQuery(filters: EvalResultFilters): EvalResultQueryResult

/**
 * Before/after delta: compare two runs and return which cases flipped.
 * "Improved" = moved from fail/error → pass; "regressed" = moved from pass → fail/error.
 * @param runIdA - the baseline (before) run id.
 * @param runIdB - the comparison (after) run id.
 * @returns the run ids, the flipped cases, and improved/regressed/unchanged counts.
 */
beforeAfterDelta(runIdA: string, runIdB: string): EvalDeltaReport

/**
 * Asset health: aggregate report for a single asset — confirmation status,
 * has_eval_coverage, relation_count, last_modified.
 * @param assetId - the table, event, or metric asset to report on.
 * @returns the aggregate health report, or null when no table/event/metric matches assetId.
 */
assetHealth(assetId: string): AssetHealthReport | null
```

Source: [`packages/data/evidence-query/src/index.ts:229`](../../packages/data/evidence-query/src/index.ts)

<a id="ctxidentity--identityservice"></a>

### `ctx.identity` — `IdentityService`

Per-user caller identity service. The default implementation returns `undefined` (the T1 fallback: no per-user login state yet); P9's admin package overrides current to return the logged-in caller's identity, after which per-user PAT resolution and audit attribute to that principal.

```ts cordis-catalog
/**
 * The current caller's identity, or `undefined` while no per-user login state
 * is populated (the T1 fallback). P9 populates this from the web-login
 * `Tenant` and the access-link-resolved scope.
 * @returns the caller identity, or `undefined` for an anonymous/global caller.
 */
current(): CallerIdentity | undefined
```

Source: [`packages/identity/identity/src/index.ts:59`](../../packages/identity/identity/src/index.ts)

<a id="ctxnl2sql--nl2sqlengineservice"></a>

### `ctx.nl2sql` — `Nl2sqlEngineService`

The nl2sql-engine Cordis `Service`. Owns no `ctx.on` hooks (P7b owns the phase-gate hooks); holds the loaded conventions + exposes them for the preset / phase-gate. The logic functions are standalone exports (above); this service is the mount point + `ctx.nl2sql` seam. The `search_data_sources` model-facing tool registration is deferred (see module doc).

```ts cordis-catalog
/**
 * The loaded per-engine conventions (prompt dialect grounding).
 *
 * @returns The loaded per-engine conventions.
 */
getConventions(): EngineConventions
```

Source: [`packages/data/nl2sql-engine/src/index.ts:74`](../../packages/data/nl2sql-engine/src/index.ts)

<a id="ctxquery--queryengine-abstract-seam"></a>

### `ctx.query` — `QueryEngine` (abstract seam)

Abstract query engine. Providers implement the four seam operations — P4 decision B: `execute` / `attach` / `cancel` / `getProgress`. `estimate_cost` is CostGuard-internal and deliberately NOT on this seam; a provider exposes it as its own internal method the future engine-wrapper calls, never as a model-facing operation.

```ts cordis-catalog
/**
 * Execute one query; resolves with a 3-state outcome. The optional
 * `signal` carries outbound cancel: the engine-wrapper's TimeoutGuard
 * (deferred) threads it to the SDK `request()`, which sends
 * `notifications/cancelled` and rejects (G4 HOLE-D).
 *
 * @param request The NL->SQL query request to execute against the provider engine.
 * @param signal Optional abort signal carrying outbound cancel; threaded to the SDK request to emit `notifications/cancelled` and reject.
 * @returns A 3-state query outcome (success / pending / failure) resolved when the query finishes or yields control.
 */
abstract execute(request: QueryRequest, signal?: AbortSignal): Promise<QueryOutcome>

/**
 * Resume a pending instance — NOT through the guard chain (P4 decision B).
 *
 * @param instanceId The opaque id of the pending query instance to resume.
 * @returns A 3-state query outcome for the resumed instance.
 */
abstract attach(instanceId: InstanceId): Promise<QueryOutcome>

/**
 * Cancel a pending instance — the explicit user cancel tool (A1-split).
 *
 * @param instanceId The opaque id of the pending query instance to cancel.
 */
abstract cancel(instanceId: InstanceId): Promise<void>

/**
 * Poll progress of a pending instance (P4 polling; no push notifications — G4 HOLE-D).
 *
 * @param instanceId The opaque id of the pending query instance to poll.
 * @returns A 3-state query outcome reflecting the pending instance's current progress.
 */
abstract getProgress(instanceId: InstanceId): Promise<QueryOutcome>

/**
 * Qualify a bare table name with its project prefix (C: engine-agnostic).
 *
 * Moved off `SemanticLayerService.qualifyTableName` (which misread
 * `config.yaml project.name` — a game scope id, NOT an ODPS project) to the
 * query provider, whose `Config.defaultProject` (cordis.patch.yml fills
 * `ieu_cdm`) is the single source of truth for the engine's project. A
 * per-table `override` (Task 3: `SearchHit.project` / `update_table_config`)
 * takes precedence over the configured default. When both are absent (empty
 * default + no override), the bare table name is returned unchanged —
 * graceful degradation so a misconfigured engine still surfaces the bare
 * name rather than `undefined.table`.
 *
 * Optional: a provider that does not need project qualification (e.g. a
 * single-project engine) may omit this; callers probe with `?.`.
 *
 * @param tableName The bare table name to qualify.
 * @param override Optional per-table project override (wins over defaultProject).
 * @returns The qualified `<project>.<tableName>`, or the bare `tableName`
 * when no project resolves.
 */
qualifyTable?(tableName: string, override?: string): string
```

Source: [`packages/query/query/src/index.ts:35`](../../packages/query/query/src/index.ts)

<a id="ctxschema--semanticlayerservice"></a>

### `ctx.schema` — `SemanticLayerService`

The semantic-layer Cordis `Service`. Owns the `ctx.schema` seam: substrate definitions (load_*, sync-read) + live-ODPS schema (discover/describe/sample, delegated to an injectable `SchemaProvider` — P6b Q3 deferred). Tier-2 writes (syncWrite/updateTableMeta) route through `ctx.audit.recordTier2Write`.

```ts cordis-catalog
/**
 * The live data-source-kind registry (events/tables/metrics plugins registered at construction).
 * @returns the live data-source-kind registry.
 */
getRegistry(): DataSourceRegistry

/**
 * The live relation graph: bidirectional adjacency over every table's
 * `dimension_refs` (joins), every event's `external_refs` (joins), and every
 * metric's `relations` (derived_from). Cached; rebuilt when the layer's
 * corpus-version counter advances (a write bumps it via `invalidateCaches`).
 * Events only enter the graph once `enrichAllEvents` has written their
 * `external_refs` (Part B).
 * @returns the cached `RelationGraph`, rebuilt when stale.
 */
getRelationGraph(): RelationGraph

/**
 * Registry-driven full retrieval corpus: every registered kind's definitions
 * projected via its `toCorpusItem` (events + tables + metrics). Supersedes
 * the events-only `loadRetrievalCorpus()` for P3/P4 — tables + metrics MUST
 * be indexable so BM25 can hit a DIM table (join recall) or a metric
 * (Level 2 context injection). `loadRetrievalCorpus()` is unchanged (preserves the
 * D2e events-only measured behavior + its 445-item K11 test).
 * @returns the full corpus (events + tables + metrics) ready for Bm25Linker.
 */
loadRetrievalCorpusAll(): CorpusItem[]

/**
 * Mount a live-ODPS schema provider (P6b Q3 deferred; follow-up mounts the real one).
 * @param provider - the provider to delegate discover/describe/sample to, or undefined to clear.
 */
setSchemaProvider(provider: SchemaProvider | undefined): void

/**
 * G3: inject (or clear) the one-shot LLM call used by the semantic relation
 * round. When undefined, `discoverRelations` + the on-write hook run the
 * deterministic PK-name round only. Production wires this to `ctx.llm`
 * (BlockAssembler-assembled text); the substrate itself stays free of the
 * LLM dependency.
 * @param fn - the llmCall to use, or undefined to run deterministic-only.
 */
setLlmCall(fn?: LlmCall): void

/**
 * G3: discover DWS→DIM dimension relations for the layer (or a subset when
 * `tables` is given) and write them back into each DWS table's
 * `dimension_refs`. Delegates to the substrate `enrichAllDwsTables` (two-round
 * strategy; deterministic round always runs, LLM round runs only when a
 * `llmCall` is injected via `setLlmCall`). No Tier-2 audit — this is the
 * explicit enrichment entry (used by the `discover_relations` agent tool +
 * batch seeding); the on-write hook is the auto path.
 * @param opts - optional `tables` filter (table_names to limit enrichment to).
 * @returns `enriched` (DWS gaining >=1 ref) + `written` (DWS updated) + per-table `errors`.
 */
async discoverRelations( opts: { readonly tables?: readonly string[] } = {}, ): Promise<{ enriched: number; written: number; errors: string[] }>

/**
 * Discover event→DIM relations (parallel to `discoverRelations` for DWS
 * tables) and write them into each event's `external_refs`. Delegates to the
 * substrate `enrichAllEvents` (two-round; deterministic always runs, LLM
 * round runs only when a `llmCall` is injected via `setLlmCall`). No Tier-2
 * audit — explicit enrichment entry.
 *
 * NOTE: an on-write hook for events (parallel to `enrichOnWrite` for tables)
 * is deferred: there is no Service-level event-write path today (events are
 * written via the substrate `writeEventYaml` raw-edit surface, not a Service
 * method). The hook lands with a future `syncWriteEvents`/`updateEventMeta`
 * Service method.
 * @param opts - optional `events` filter (event names to limit enrichment to).
 * @returns `enriched` (events gaining >=1 ref) + `written` (events updated) + per-event `errors`.
 */
async discoverEventRelations( opts: { readonly events?: readonly string[] } = {}, ): Promise<{ enriched: number; written: number; errors: string[] }>

/**
 * Load a validated event definition by name from the substrate.
 * @param name - the event `name` key to match.
 * @returns the parsed `EventDefinition`, or null when no event matches.
 */
loadEventDefinition(name: string): EventDefinition | null

/**
 * Load a validated table definition by name from the substrate.
 * @param name - the table `table_name` key to match.
 * @returns the parsed `TableDefinition`, or null when no table matches.
 */
loadTableDefinition(name: string): TableDefinition | null

/**
 * Load a validated metric definition by name from the substrate.
 * @param name - the metric `name` key to match (`<host>__<key>`).
 * @returns the parsed `MetricDefinition`, or null when no host table/event defines a metric with this name.
 */
loadMetricDefinition(name: string): MetricDefinition | null

/**
 * D2e (2026-08-21): build an enriched retrieval corpus from the substrate —
 * each event's `params_fields` (field name + description) + `terminology`
 * slang packed into the indexed `description`; `domain` is NOT indexed
 * (probe refuted it). D2h: the `corpusVariant` mount-time config selects the
 * slices — 'params+term' (default, shipped) packs params_fields + slang;
 * 'term-only' (D2g verdict (A) higher-recall) packs slang only, dropping
 * params_fields. This is the corpus feed the real-default prefetch path
 * (`Bm25Linker` in `search_data_sources`) probes `ctx.schema` for; when
 * `ctx.schema` is unmounted (bundle opt-in), the tool's corpus stays empty
 * (current behavior) — enrichment activates on mount. Empty `semanticRoot`
 * yields an empty corpus.
 * @returns enriched corpus items ready for `Bm25Linker` / `HybridRetriever` indexing.
 */
loadRetrievalCorpus(): readonly EventCorpusItem[]

/**
 * D2f (2026-08-21): the corpus-version counter for this layer - a monotonic
 * signal bumped by every writer via `invalidateCaches` (writeEventYaml /
 * writeTable / updateTableMeta / syncWriteDefinitions). Probed structurally
 * by `tool-search-data-sources` (no static dep) so its cached enriched
 * Bm25Linker rebuilds after a mid-session event edit instead of staying stale
 * until reboot (D2e-deferred cache-invalidation). Reads the per-path counter
 * for `this.semanticRoot` (0 until the first write).
 * @returns the current corpus-version counter.
 */
corpusVersion(): number

/**
 * List tables in a scope (optionally filtered by kind) via the mounted provider.
 * @param scopeId - the scope to discover tables in.
 * @param kind - optional kind filter forwarded to the provider.
 * @returns a readonly array of table metas, or throws when no provider is mounted.
 */
async discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]>

/**
 * Describe one table's columns/partitions/comment via the mounted provider.
 * @param tableName - the table name to describe.
 * @returns the table's meta, or null when the table is unknown / no provider is mounted.
 */
async describe(tableName: string): Promise<TableMeta | null>

/**
 * Sample N rows of a table as formatted text via the mounted provider.
 * @param tableName - the table name to sample.
 * @param n - optional row count to sample (provider default applies when omitted).
 * @returns the formatted sample text, or throws when no provider is mounted.
 */
async sample(tableName: string, n?: number): Promise<string>

/**
 * Tier-2 persistent write: batch-generate/merge table YAML from pre-fetched
 * schema metas and write them to the substrate, recording each write via
 * `ctx.audit` (D5 non-disableable). Routes to `syncWriteDefinitions`. G3:
 * after the batch, the on-write hook re-runs DWS→DIM discovery for the
 * written tables (gated by `autoEnrich`).
 * @param tableMetas - the table metas to write (from discover/describe).
 * @param opts - optional dim-table-name set, existing-table map for merge, and scope id override.
 * @returns counts of written/skipped tables plus per-table error messages.
 */
async syncWrite( tableMetas: readonly TableMeta[], opts: { readonly dimTableNames?: Set<string> readonly existingTables?: Map<string, Record<string, unknown>> readonly scopeId?: string } = {}, ): Promise<{ written: number; skipped: number; errors: string[] }>

/**
 * Tier-2 per-scope write: read-merge-validate-write a single table's meta
 * updates, recording the write via `ctx.audit` (D5 non-disableable). G3:
 * after the write, the on-write hook re-runs DWS→DIM discovery for the table
 * (gated by `autoEnrich`).
 * @param name - the table `table_name` to update.
 * @param updates - the field overrides merged over the existing table YAML.
 * @param opts - optional scope id override (default scope id is used when omitted).
 * @returns `{ ok: true, table_name }` on success, or `{ ok: false, error }` when the table is missing/malformed or validation fails.
 */
async updateTableMeta( name: string, updates: Record<string, unknown>, opts: { readonly scopeId?: string } = {}, ): Promise<{ ok: true; table_name: string } | { ok: false; error: string }>
```

Source: [`packages/data/semantic-layer/src/index.ts:193`](../../packages/data/semantic-layer/src/index.ts)

<a id="ctxscopes--scoperegistryservice"></a>

### `ctx.scopes` — `ScopeRegistryService`

Scope registry Cordis service. Reads and writes a YAML file at `registryPath` containing scope definitions and the active scope id. All mutations are atomic (cross-process safe via file lock + atomic write).

```ts cordis-catalog
/**
 * All registered scopes. Returns empty array when registryPath is unset or file missing.
 * @returns all registered scope definitions (empty when the registry is unset or missing).
 */
list(): readonly ScopeDefinition[]

/**
 * Get a scope by id. Returns undefined when not found.
 * @param id - the scope identifier to look up.
 * @returns the matching scope definition, or undefined when no scope has this id.
 */
get(id: string): ScopeDefinition | undefined

/**
 * The currently active scope definition, or undefined if none is active.
 * @returns the active scope definition, or undefined when no scope is active.
 */
active(): ScopeDefinition | undefined

/**
 * The currently active scope id, or undefined if none is active.
 * @returns the active scope id, or undefined when no scope is active.
 */
activeId(): string | undefined

/**
 * Set the active scope by id. Throws if the scope does not exist in the registry.
 * @param id - the scope id to make active (must already be registered).
 */
async setActive(id: string): Promise<void>

/** Clear the active scope (no scope is active). */
async clearActive(): Promise<void>

/**
 * Register (or update) a scope definition. If this is the first scope, it becomes active.
 * @param scope - the scope definition to register or update.
 */
async register(scope: ScopeDefinition): Promise<void>

/**
 * Remove a scope from the registry. If it was active, active becomes undefined.
 * @param id - the scope id to remove.
 */
async remove(id: string): Promise<void>
```

Source: [`packages/data/scope-registry/src/index.ts:85`](../../packages/data/scope-registry/src/index.ts)

<a id="scopes-events"></a>

### `scopes/*` events

<a id="scopesactive-changed--emit"></a>

#### `scopes/active-changed` — emit

Emitted after the active scope id changes — via setActive(), clearActive(), register() making the first scope active, or remove() deactivating the previously active scope. Listeners may re-read ctx.scopes.active() to react to the new selection.

```ts cordis-catalog
/**
 * Emitted after the active scope id changes — via setActive(),
 * clearActive(), register() making the first scope active, or remove()
 * deactivating the previously active scope. Listeners may re-read
 * ctx.scopes.active() to react to the new selection.
 * @param scopeId - the new active scope id, or undefined when no scope is now active.
 * @mode emit
 */
'scopes/active-changed': (scopeId: string | undefined) => void
```

Source: [`packages/data/scope-registry/src/index.ts:74`](../../packages/data/scope-registry/src/index.ts)

<a id="scopeschanged--emit"></a>

#### `scopes/changed` — emit

Emitted after the set of registered scopes changes — a scope was added or updated via register(), or removed via remove(). A pure active-scope switch (setActive/clearActive) does not fire this event. Listeners may re-read ctx.scopes.list() to refresh any cached view of the registry.

```ts cordis-catalog
/**
 * Emitted after the set of registered scopes changes — a scope was added or
 * updated via register(), or removed via remove(). A pure active-scope
 * switch (setActive/clearActive) does not fire this event. Listeners may
 * re-read ctx.scopes.list() to refresh any cached view of the registry.
 * @mode emit
 */
'scopes/changed': () => void
```

Source: [`packages/data/scope-registry/src/index.ts:65`](../../packages/data/scope-registry/src/index.ts)
<!-- END GENERATED cordis-surface -->
