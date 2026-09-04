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

Source: [`packages/data/audit/src/index.ts:125`](../../packages/data/audit/src/index.ts)

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

Source: [`packages/data/phase-gate/src/phase-gate.ts:1208`](../../packages/data/phase-gate/src/phase-gate.ts)

<a id="ctxembedder--embedderservice-abstract-seam"></a>

### `ctx.embedder` — `EmbedderService` (abstract seam)

Abstract embedder service. Providers implement `embed` (async — HTTP inference must not block the event loop). Consumers infer the working dimension from the embedded vectors' length.

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

Source: [`packages/embedder/embedder/src/index.ts:87`](../../packages/embedder/embedder/src/index.ts)

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
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns aggregated table/event/metric counts plus per-domain and confirmation-status tallies.
 */
coverageQuery(scopeId?: string): EnrichedCoverageStats

/**
 * Gap analysis: given an asset, compute which other assets are reachable via
 * RelationGraph joins but have no eval case coverage.
 * @param assetId - the source asset to compute reachable-but-uncovered gaps from.
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns the source asset plus the list of reachable assets lacking eval coverage (with join paths).
 */
gapAnalysis(assetId: string, scopeId?: string): GapAnalysisResult

/**
 * Reachability delta: "if we add this relation, which asset pairs become
 * newly reachable via joins?" Clones the current graph, adds the proposed
 * relation, and compares BFS reachability before/after.
 * @param newRelation - the proposed relation to add before recomputing reachability.
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns the proposed relation plus the asset pairs newly reachable via joins after adding it.
 */
reachabilityDelta(newRelation: ProposedRelation, scopeId?: string): ReachabilityDeltaResult

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
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns the aggregate health report, or null when no table/event/metric matches assetId.
 */
assetHealth(assetId: string, scopeId?: string): AssetHealthReport | null
```

Source: [`packages/data/evidence-query/src/index.ts:308`](../../packages/data/evidence-query/src/index.ts)

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

<a id="ctxmanagementsession--managementsessionservice"></a>

### `ctx.managementSession` — `ManagementSessionService`

Management Session Service: creates dedicated agent sessions scoped to the `semantic-layer-management` preset for the full-screen graph management UI.

- `create()` — opens a new management session
- `destroy(sessionId)` — tears down a management session
- `getActive()` — returns the currently active management session (if any)

Tool gating is handled by the preset: the management session is composed from the `semantic-layer-management` agent preset which only exposes the management-relevant tools.

```ts cordis-catalog
/**
 * Create a new management session scoped to the semantic-layer-management
 * preset tools.
 *
 * When `parentSessionId` is provided, derives a read-only summary of the
 * parent session's recent conversation and includes it in the management
 * session's creation metadata. This is a one-time snapshot at creation, not
 * live-updating.
 *
 * @param opts - creation options.
 * @returns the management session descriptor.
 * Multiple management sessions may be active concurrently; this method does
 * not reject when one is already active (use {@link getActive} for the most
 * recent). When `parentSessionId` is provided but no such session exists in
 * the store, creation proceeds without a parent context summary (no throw).
 */
create(opts?: CreateManagementSessionOptions): ManagementSessionDescriptor

/**
 * Tear down a management session.
 *
 * @param sessionId - the management session to destroy.
 * @throws if the session id does not correspond to an active management session.
 */
destroy(sessionId: string): void

/**
 * Returns the currently active management session, or undefined if none.
 * When multiple management sessions are active, returns the most recently
 * created one.
 * @returns the most recently created active descriptor, or `undefined` when none is active.
 */
getActive(): ManagementSessionDescriptor | undefined

/**
 * Returns all active management sessions.
 * @returns the descriptors of every currently active management session.
 */
listActive(): ManagementSessionDescriptor[]

/**
 * Check if a given session id belongs to an active management session.
 * @param sessionId - the session id to test.
 * @returns whether `sessionId` is an active management session.
 */
isManagementSession(sessionId: string): boolean
```

Source: [`packages/data/management-session/src/index.ts:161`](../../packages/data/management-session/src/index.ts)

<a id="ctxnl2sql--nl2sqlengineservice"></a>

### `ctx.nl2sql` — `Nl2sqlEngineService`

The nl2sql-engine Cordis `Service`. Owns no `ctx.on` hooks (P7b owns the phase-gate hooks); holds no conventions state — `getConventions` resolves per-call from the injected query engine (`ctx.query.getConventions`) — and exposes them for the preset / phase-gate. The logic functions are standalone exports (above); this service is the mount point + `ctx.nl2sql` seam. The `search_data_sources` model-facing tool registration is deferred (see module doc).

```ts cordis-catalog
/**
 * The loaded per-engine conventions (prompt dialect grounding), resolved
 * per-call from the injected query engine — NOT construction-time cached.
 *
 * D2 (GA-GT1 Phase 6): the previous implementation cached
 * `ctx.query.getConventions()` in the constructor and returned the frozen
 * value here, so a singleton `ctx.query` made every tenant/scope share one
 * conventions set (cross-line coupling). This delegates to
 * `ctx.query.getConventions(scopeId)` on every call so a future per-scope
 * engine mapping is honored without a service rebuild. The `scopeId` is
 * threaded end-to-end from the caller but ignored by current concrete
 * providers (dormant seam — undefined yields the provider's single loaded
 * set; behavior unchanged today, just no longer frozen at construction).
 *
 * @param scopeId Optional per-request-scope key (dormant seam; forwarded to
 * `ctx.query.getConventions(scopeId)` — current providers ignore it).
 * @returns The resolved per-engine conventions for the active scope.
 */
getConventions(scopeId?: string): EngineConventions
```

Source: [`packages/data/nl2sql-engine/src/index.ts:75`](../../packages/data/nl2sql-engine/src/index.ts)

<a id="ctxpatrol--patrolservice"></a>

### `ctx.patrol` — `PatrolService`

Patrol Mode service — autonomous patrol loop for iterative semantic layer improvement. Registered at `ctx.patrol`.

The patrol loop: 1. Finds weakest assets via evidenceQuery (assetHealth / gapAnalysis) 2. For each weak asset (up to maxEditsPerRound): a. Diagnoses via management session b. Proposes fix and emits confirm request event c. Waits for user confirm (timeout 60s -> reject + pause) d. If confirmed: executes edit 3. After edits: triggers eval on modified assets (C3) 4. Emits round-complete event (for C2 batch rendering) 5. Waits for next round or continues if auto

```ts cordis-catalog
/**
 * Start the autonomous patrol loop.
 *
 * @param opts - optional patrol configuration overrides.
 * @throws if patrol is already running.
 */
start(opts?: PatrolConfig): void

/**
 * Stop the patrol loop. Cleans up pending confirms and resets state.
 *
 * Awaits the still-running runLoop so a rapid start() cannot spawn a second
 * concurrent loop whose in-flight continuations would mutate state after it
 * has been reset here. runLoop never rejects.
 */
async stop(): Promise<void>

/**
 * Returns whether the patrol loop is currently active (running, paused, or
 * awaiting confirmation).
 * @returns whether the patrol loop is in a non-idle state.
 */
isRunning(): boolean

/**
 * Returns the current patrol state.
 * @returns the current `PatrolState` (idle/running/paused/awaiting-confirm).
 */
getState(): PatrolState

/**
 * Process a "by the way" user message during an active patrol.
 *
 * Per S3: the message is handled as a one-off request via the management
 * session. The patrol context is preserved and the loop resumes after the
 * btw is handled.
 *
 * Only explicit "停止巡检"/"stop patrol" terminates the loop.
 *
 * @param message - the user's btw message.
 */
async handleBtw(message: string): Promise<void>

/**
 * Respond to a pending confirmation request.
 *
 * @param decision - 'confirmed' or 'rejected'.
 * @throws if there is no pending confirmation.
 */
respondToConfirm(decision: 'confirmed' | 'rejected'): void
```

Source: [`packages/data/patrol-mode/src/index.ts:176`](../../packages/data/patrol-mode/src/index.ts)

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
 * `config.yaml project.name` — a game scope id, NOT an engine project) to the
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

/**
 * The per-engine convention set for the nl2sql prompt dialect grounding
 * (key_differences / functions / cast_map / sql_templates) + the future
 * query-guard/cost/dialect consumer. D1 (GA-GT2-impl): the *types* live in
 * the abstract package (`./conventions.ts`); a concrete provider subclass
 * overrides this to return its locally-loaded convention set (the
 * YAML-loading runtime stays the provider's concern). Default throws so a
 * provider that does not ground a dialect surfaces the gap loudly rather
 * than silently injecting an empty conventions block.
 *
 * D2 (GA-GT1 Phase 6): the optional `scopeId` is a per-request-scope seam —
 * callers thread the active scope so a future per-scope engine mapping can
 * return a different convention set per tenant/scope without the consumer
 * (`Nl2sqlEngineService`) caching at construction. Concrete providers
 * TODAY ignore `scopeId` (return their single loaded dialect); the param is
 * a dormant forward-looking seam (additive, undefined → current behavior).
 * A provider that wants per-scope conventions overrides
 * `getConventions(scopeId)` and reads scope metadata; until then the
 * `scopeId` is threaded end-to-end but unused at the terminal.
 *
 * @param scopeId Optional per-request-scope key (dormant seam; ignored by
 * current concrete providers — undefined yields the provider's single
 * loaded convention set).
 * @returns The resolved per-engine convention set for this concrete provider.
 */
getConventions(scopeId?: string): EngineConventions
```

Source: [`packages/query/query/src/index.ts:37`](../../packages/query/query/src/index.ts)

<a id="ctxresultcache--resultcache-abstract-seam"></a>

### `ctx.resultCache` — `ResultCache` (abstract seam)

Abstract result cache service. Subclass, implement get/put/has, and load the subclass as a plugin — it registers as `ctx.resultCache`.

Semantics every implementation must honor:

- get returns the entry for `resultId`, or `undefined` if not found. The caller decides whether a missing id is an error.
- put stores an entry under `resultId`. Idempotent when the entry is identical; throws when a DIFFERENT entry is stored under an existing id (immutable-once-written).
- has returns whether an entry exists for `resultId`.

```ts cordis-catalog
/**
 * Read the cached entry for a result id.
 * @param resultId - the result id to read.
 * @returns the stored entry, or `undefined` when no entry is cached under `resultId`.
 */
abstract get(resultId: string): ResultEntry | undefined

/**
 * Store a result entry under its id. `cr_` (compute-derived) ids are
 * immutable-once-written: a different entry under an existing `cr_` id
 * throws; `qr_` (query-derived) ids overwrite with the latest entry.
 * @param resultId - the result id to store under.
 * @param entry - the result entry to cache.
 */
abstract put(resultId: string, entry: ResultEntry): void

/**
 * Test whether an entry is cached for a result id.
 * @param resultId - the result id to test.
 * @returns whether an entry is cached under `resultId`.
 */
abstract has(resultId: string): boolean
```

Source: [`packages/data/result-cache/src/index.ts:34`](../../packages/data/result-cache/src/index.ts)

<a id="ctxschema--semanticlayerservice"></a>

### `ctx.schema` — `SemanticLayerService`

The semantic-layer Cordis `Service`. Owns the `ctx.schema` seam: substrate definitions (load_*, sync-read) + live-engine schema (discover/describe/sample, delegated to an injectable `SchemaProvider` — P6b Q3 deferred). Tier-2 writes (syncWrite/updateTableMeta) route through `ctx.audit.recordTier2Write`.

```ts cordis-catalog
/**
 * GA-GT1 Phase 5a: PUBLIC per-scope root-resolution seam. Delegates to the
 * private `resolveRoot` (4-branch semantics unchanged) so consumer packages
 * (tool-retrieve/tool-search-data-sources/tool-search-schema enrichedLinkers
 * + retrieval-inproc scopedRetrievers) can resolve a scope's root for the
 * #19/#22 root-check fix (5b adds `root` to the per-scope cache entry +
 * checks `entry.root === root` — parity with the Phase 2 I-1
 * `graphCacheByScope` root guard). Dormant in 5a: no consumer calls it yet;
 * the method is exposed now so 5b can wire it through `SchemaCorpusSource`.
 *
 * 4 branches (same as `resolveRoot`):
 *  - scopeId undefined → active scope's root (backward-compatible).
 *  - scopeId provided + registry mounted + scope found → that scope's root.
 *  - scopeId provided + registry mounted + scope NOT found → throw
 *    (intranet-security: refuse silent fallback to active scope to prevent
 *    cross-tenant corpus leak).
 *  - scopeId provided + registry unmounted → active/cfg root (test stand-in).
 * @param scopeId - optional scope id; omit for the active scope.
 * @returns the resolved semantic-layer root path.
 */
resolveScopeRoot(scopeId?: string): string

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
 *
 * GA-GT1 Phase 2 (D4 β): an optional `scopeId` resolves a per-request scope's
 * root (via `resolveRoot`); the no-arg path is unchanged (active scope, single
 * instance cache — backward-compatible). The scopeId path uses a separate
 * per-scope cache (`graphCacheByScope` — plain Map, LRU eviction deferred to
 * Phase 3/4) keyed by scopeId + root + `corpusVersionForRoot(root)`. The root
 * is part of the cache key so re-registering the scope with a different
 * `semanticRoot` invalidates the entry even when the new root's content
 * counter is still 0 (I-1: cross-tenant corpus leak guard). It is acceptable
 * that `getRelationGraph()` and `getRelationGraph(activeId)` produce separate
 * cache entries for the same active scope (data is identical; duplicate entry
 * is harmless — Phase 3/4 cleanup unifies the two paths).
 * @param scopeId - optional scope id; omit to use the active scope (backward-compatible).
 * @returns the cached `RelationGraph`, rebuilt when stale.
 */
getRelationGraph(scopeId?: string): RelationGraph

/**
 * CL-2 D2: dangling domain→concept references collected during the last
 * `getRelationGraph()` build — assets whose `domains` reference a concept
 * name with no matching definition in concepts/. Such refs are skipped
 * (warned) rather than aborting the graph build, so valid assets still get
 * their edges. Empty when all domain refs resolve or no concepts are loaded.
 *
 * M-1: `danglingDomainRefs` is shared INSTANCE state — `buildGraph` is now
 * called by BOTH the no-arg + scopeId paths of `getRelationGraph`, so this
 * reflects the last build ACROSS ALL SCOPES (whichever `getRelationGraph`
 * call ran last), NOT a per-scope view. Per-scope keying of this health
 * surface is deferred to Phase 3/4 (scope count is small; the leak guard is
 * on the graph cache, not this health-check surface).
 * @returns a snapshot of the dangling refs (`asset="..." domain="..."`) from the last build (across all scopes).
 */
getDanglingDomainRefs(): string[]

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
 * Mount a live-engine schema provider (P6b Q3 deferred; follow-up mounts the real one).
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
 * CL-1 Phase 3: discover alt_labels (SKOS aliases) for definitions in the
 * layer. Two-round strategy: deterministic extraction from description/columns/
 * domains + optional LLM semantic suggestions. Merges with existing labels
 * (never removes curated aliases).
 *
 * @param opts - optional filters: `tables` (table_names) and/or `events` (event names).
 * @returns combined `enriched` + `written` + `errors` across tables and events.
 */
async discoverAltLabels( opts: { readonly tables?: readonly string[]; readonly events?: readonly string[] } = {}, ): Promise<{ enriched: number; written: number; errors: string[] }>

/**
 * Load a validated event definition by name from the substrate.
 * @param name - the event `name` key to match.
 * @returns the parsed `EventDefinition`, or null when no event matches.
 */
loadEventDefinition(name: string): EventDefinition | null

/**
 * Load a validated table definition by name from the substrate.
 * @param name - the table `table_name` key to match.
 * @param scopeId - GA-GT1 Phase 2: optional scope id; omit to use the active scope (backward-compatible).
 * @returns the parsed `TableDefinition`, or null when no table matches.
 */
loadTableDefinition(name: string, scopeId?: string): TableDefinition | null

/**
 * Load a validated metric definition by name from the substrate.
 * @param name - the metric `name` key to match (`<host>__<key>`).
 * @returns the parsed `MetricDefinition`, or null when no host table/event defines a metric with this name.
 */
loadMetricDefinition(name: string): MetricDefinition | null

/**
 * Load a validated concept definition by name from the substrate.
 * @param name - the concept `name` key to match.
 * @returns the parsed `ConceptDefinition`, or null when no concept matches.
 */
loadConceptDefinition(name: string): import('./types.ts').ConceptDefinition | null

/**
 * Build an enriched retrieval corpus from the substrate — each event's
 * `alt_labels` (SKOS aliases) + `params_fields` packed into the indexed
 * `description`. The `corpusVariant` config selects slices: 'params+term'
 * (default) packs both; 'term-only' packs aliases only.
 * @param scopeId - GA-GT1 Phase 2: optional scope id; omit to use the active scope (backward-compatible).
 * @returns enriched corpus items ready for `Bm25Linker` / `HybridRetriever` indexing.
 */
loadRetrievalCorpus(scopeId?: string): readonly EventCorpusItem[]

/**
 * W11 C1: Capture a point-in-time snapshot of the semantic layer definitions.
 * The returned `DefinitionSnapshot` provides the same read API
 * (`loadTableDefinition`, `loadEventDefinition`, `loadMetricDefinition`,
 * `loadRetrievalCorpus`) but the data is pinned at the version when captured.
 * Subsequent `invalidateCaches()` calls (from management-session writes) do
 * NOT affect the returned snapshot. The next call to `acquireSnapshot` after
 * a write sees the new data.
 *
 * Cheap: if the corpus version has not changed since the last call, the
 * cached data arrays are reused (no disk re-scan).
 *
 * GA-GT1 Phase 2: an optional `scopeId` resolves a per-request scope's root
 * + corpus version (via `resolveRoot`/`corpusVersion(scopeId)`); the no-arg
 * path is unchanged (active scope — backward-compatible).
 * @param scopeId - optional scope id; omit to use the active scope (backward-compatible).
 * @returns a frozen `DefinitionSnapshot` pinned at the current corpus version.
 */
acquireSnapshot(scopeId?: string): DefinitionSnapshot

/**
 * W11 C1: Execute `fn` with a consistent snapshot — definitions do not
 * reload mid-execution even if `invalidateCaches` fires concurrently (e.g.
 * from a management-session write). The snapshot is acquired before `fn` and
 * released after (release is a no-op in v1; reserved for future GC).
 *
 * Usage (in the NL2SQL query engine):
 * ```ts
 * const sql = await ctx.schema.withSnapshot(async (snap) => {
 *   const table = snap.loadTableDefinition('dws_pay_order_di')
 *   const event = snap.loadEventDefinition('game.pay.order')
 *   // ... generate SQL using pinned definitions ...
 *   return generatedSql
 * })
 * ```
 *
 * @param fn - the async function to execute with a pinned snapshot.
 * @returns the value returned by `fn`.
 */
async withSnapshot<T>(fn: (snap: DefinitionSnapshot) => Promise<T>): Promise<T>

/**
 * D2f (2026-08-21): the corpus-version counter for this layer - a monotonic
 * signal bumped by every writer via `invalidateCaches` (writeEventYaml /
 * writeTable / updateTableMeta / syncWriteDefinitions). Probed structurally
 * by `tool-search-data-sources` (no static dep) so its cached enriched
 * Bm25Linker rebuilds after a mid-session event edit instead of staying stale
 * until reboot (D2e-deferred cache-invalidation). Reads the per-path counter
 * for `this.semanticRoot` (0 until the first write).
 * @param scopeId - optional per-request scope; when omitted, the undefined (root) path's counter is read.
 * @returns the current corpus-version counter.
 */
corpusVersion(scopeId?: string): number

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

Source: [`packages/data/semantic-layer/src/index.ts:251`](../../packages/data/semantic-layer/src/index.ts)

<a id="ctxscopes--scoperegistryservice"></a>

### `ctx.scopes` — `ScopeRegistryService`

Scope registry Cordis service. Reads and writes a YAML file at `registryPath` containing scope definitions and the active scope id. All mutations are atomic (cross-process safe via file lock + atomic write).

```ts cordis-catalog
/**
 * All registered scopes, optionally filtered by tenant.
 *
 * Backward-compatible: an omitted `tenant` returns every scope (existing
 * no-arg callers are unaffected). A provided `tenant` returns only scopes
 * whose `tenant` equals it.
 *
 * @param tenant - optional tenant id to filter by; omit for all scopes.
 * @returns the matching scope definitions (empty when the registry is unset, missing, or has no match).
 */
list(tenant?: string): readonly ScopeDefinition[]

/**
 * Get a scope by id. Returns undefined when not found.
 * @param id - the scope identifier to look up.
 * @returns the matching scope definition, or undefined when no scope has this id.
 */
get(id: string): ScopeDefinition | undefined

/**
 * Look up a scope belonging to a specific tenant.
 *
 * - `scopeId` provided → return the scope with that `id` IF it exists AND its
 *   `tenant === tenant`; otherwise `undefined`. (D3: 1:N tenants must pass scopeId.)
 * - `scopeId` omitted → return the single scope belonging to `tenant`:
 *   exactly 1 → return it; 0 → `undefined`; >1 → throw (ambiguous — 1:N
 *   tenants must pass scopeId). (D3: 1:1 may omit scopeId; 1:N requires it.)
 *
 * @param tenant - the tenant id whose scopes to look in.
 * @param scopeId - optional scope id; required when the tenant owns >1 scope.
 * @returns the matching scope definition, or undefined when no match exists.
 */
forTenant(tenant: string, scopeId?: string): ScopeDefinition | undefined

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

Source: [`packages/data/scope-registry/src/index.ts:90`](../../packages/data/scope-registry/src/index.ts)

<a id="admin-events"></a>

### `admin/*` events

<a id="adminpat-miss--emit"></a>

#### `admin/pat-miss` — emit

Emitted when a per-user PAT resolve returns undefined (PAT-miss UX).

```ts cordis-catalog
/**
 * Emitted when a per-user PAT resolve returns undefined (PAT-miss UX).
 *
 * @mode emit
 * @param userId - the user whose PAT is missing.
 * @param ref - the credential ref that failed to resolve.
 */
'admin/pat-miss'(userId: string, ref: string): void
```

Source: [`packages/data/admin/src/index.ts:514`](../../packages/data/admin/src/index.ts)

<a id="evidence-events"></a>

### `evidence/*` events

<a id="evidenceeval-run-completed--emit"></a>

#### `evidence/eval-run-completed` — emit

Emitted when an eval run finishes and every case is persisted, so the evidence-query sidebar / dashboard can auto-refresh coverage and pass-rate views without polling. Carries no payload — a listener that needs the run id reads it from the eval store.

```ts cordis-catalog
/**
 * Emitted when an eval run finishes and every case is persisted, so the
 * evidence-query sidebar / dashboard can auto-refresh coverage and
 * pass-rate views without polling. Carries no payload — a listener that
 * needs the run id reads it from the eval store.
 *
 * @mode emit
 */
'evidence/eval-run-completed'(): void
```

Source: [`packages/api/remotes/src/types.ts:31`](../../packages/api/remotes/src/types.ts)

<a id="evidenceeval-run-completed--parallel"></a>

#### `evidence/eval-run-completed` — parallel

Emitted after an eval batch is persisted to JSONL. @mode parallel

```ts cordis-catalog
/** Emitted after an eval batch is persisted to JSONL. @mode parallel */
'evidence/eval-run-completed'(): void
```

Source: [`packages/eval/eval-runner-service/src/index.ts:28`](../../packages/eval/eval-runner-service/src/index.ts)

<a id="evidenceeval-run-completed--emit"></a>

#### `evidence/eval-run-completed` — emit

Emitted after an eval run completes; listeners may refresh the eval store.

```ts cordis-catalog
/**
 * Emitted after an eval run completes; listeners may refresh the eval store.
 *
 * @mode emit
 */
'evidence/eval-run-completed'(): void
```

Source: [`packages/data/evidence-query/src/index.ts:79`](../../packages/data/evidence-query/src/index.ts)

<a id="management-session-events"></a>

### `management-session/*` events

<a id="management-sessioncreated--emit"></a>

#### `management-session/created` — emit

Emitted when a management session is created.

```ts cordis-catalog
/**
 * Emitted when a management session is created.
 *
 * @mode emit
 * @param descriptor - the created management session descriptor.
 */
'management-session/created'(descriptor: ManagementSessionDescriptor): void
```

Source: [`packages/data/management-session/src/index.ts:75`](../../packages/data/management-session/src/index.ts)

<a id="management-sessiondestroyed--emit"></a>

#### `management-session/destroyed` — emit

Emitted when a management session is destroyed.

```ts cordis-catalog
/**
 * Emitted when a management session is destroyed.
 *
 * @mode emit
 * @param sessionId - the destroyed management session id.
 */
'management-session/destroyed'(sessionId: SessionId): void
```

Types: [SessionId](core.md)

Source: [`packages/data/management-session/src/index.ts:82`](../../packages/data/management-session/src/index.ts)

<a id="patrol-events"></a>

### `patrol/*` events

<a id="patrolbtw-received--parallel"></a>

#### `patrol/btw-received` — parallel

User sent a "btw" message during patrol.

```ts cordis-catalog
/**
 * User sent a "btw" message during patrol.
 *
 * @mode parallel
 * @param message - the btw message routed as a one-off request.
 */
'patrol/btw-received'(message: string): void
```

Source: [`packages/data/patrol-mode/src/index.ts:148`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolconfirm-request--parallel"></a>

#### `patrol/confirm-request` — parallel

Patrol is requesting user confirmation for a proposed edit.

```ts cordis-catalog
/**
 * Patrol is requesting user confirmation for a proposed edit.
 *
 * @mode parallel
 * @param edit - the proposed edit awaiting a confirm/reject decision.
 */
'patrol/confirm-request'(edit: PatrolProposedEdit): void
```

Source: [`packages/data/patrol-mode/src/index.ts:127`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolconfirm-timeout--parallel"></a>

#### `patrol/confirm-timeout` — parallel

User did not respond within the confirmation timeout.

```ts cordis-catalog
/**
 * User did not respond within the confirmation timeout.
 *
 * @mode parallel
 * @param edit - the edit whose confirmation timed out.
 */
'patrol/confirm-timeout'(edit: PatrolProposedEdit): void
```

Source: [`packages/data/patrol-mode/src/index.ts:141`](../../packages/data/patrol-mode/src/index.ts)

<a id="patroledit-executed--parallel"></a>

#### `patrol/edit-executed` — parallel

A confirmed patrol edit was executed (audit).

```ts cordis-catalog
/**
 * A confirmed patrol edit was executed (audit).
 *
 * @mode parallel
 * @param edit - the edit that was confirmed and audited.
 */
'patrol/edit-executed'(edit: PatrolProposedEdit): void
```

Source: [`packages/data/patrol-mode/src/index.ts:134`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolpaused--parallel"></a>

#### `patrol/paused` — parallel

Patrol has been paused (max edits reached or timeout).

```ts cordis-catalog
/**
 * Patrol has been paused (max edits reached or timeout).
 *
 * @mode parallel
 * @param reason - why the patrol paused.
 */
'patrol/paused'(reason: string): void
```

Source: [`packages/data/patrol-mode/src/index.ts:155`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolround-complete--parallel"></a>

#### `patrol/round-complete` — parallel

A patrol round has completed (triggers C2 batch rendering).

```ts cordis-catalog
/**
 * A patrol round has completed (triggers C2 batch rendering).
 *
 * @mode parallel
 * @param summary - the round's asset/edit tally.
 */
'patrol/round-complete'(summary: PatrolRoundSummary): void
```

Source: [`packages/data/patrol-mode/src/index.ts:120`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolround-start--parallel"></a>

#### `patrol/round-start` — parallel

A new patrol round is beginning.

```ts cordis-catalog
/**
 * A new patrol round is beginning.
 *
 * @mode parallel
 * @param roundNumber - the 1-indexed round number.
 */
'patrol/round-start'(roundNumber: number): void
```

Source: [`packages/data/patrol-mode/src/index.ts:113`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolstarted--parallel"></a>

#### `patrol/started` — parallel

Patrol loop has started.

```ts cordis-catalog
/**
 * Patrol loop has started.
 *
 * @mode parallel
 * @param config - the active patrol configuration.
 */
'patrol/started'(config: PatrolConfig): void
```

Source: [`packages/data/patrol-mode/src/index.ts:100`](../../packages/data/patrol-mode/src/index.ts)

<a id="patrolstopped--parallel"></a>

#### `patrol/stopped` — parallel

Patrol loop has stopped.

```ts cordis-catalog
/**
 * Patrol loop has stopped.
 *
 * @mode parallel
 */
'patrol/stopped'(): void
```

Source: [`packages/data/patrol-mode/src/index.ts:106`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/scope-registry/src/index.ts:79`](../../packages/data/scope-registry/src/index.ts)

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

Source: [`packages/data/scope-registry/src/index.ts:70`](../../packages/data/scope-registry/src/index.ts)
<!-- END GENERATED cordis-surface -->
