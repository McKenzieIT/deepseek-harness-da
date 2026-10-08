# Data Agent

English | [中文](data-agent.zh.md)

The data-agent overlay mounts five Cordis services — `ctx.audit` (append-only audit/tier-2-write store), `ctx.embedder` (embedding/rerank seam), `ctx.identity` (caller identity), `ctx.nl2sql` (NL→SQL engine), `ctx.schema` (semantic-layer: discover/describe/sample data sources) — that together implement natural-language data access.

Source: [`packages/data`](../../packages/data/README.md)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxaudit--audit"></a>

### `ctx.audit` — `Audit`

Per-user audit service. Owns a SQLiteAuditStore (opened synchronously in the constructor) and registers observe-only `tools/post-execute` + `session/event` listeners. The store is a sibling seam (`ctx.audit`), NOT routed through `ctx.storage` (KV-only — no relational tables/indexes).

```ts cordis-catalog
/**
 * Record one tool call from `tools/post-execute` (allowed or denied). A
 * denied call is captured as `isError` with the deny reason in
 * `result.error.message` (the real API has no `decision` param, so a
 * distinct `guard_deny` tag is not auto-emitted here — record one
 * explicitly via {@link record} from the P10 intranet tool-gate).
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

Source: [`packages/data/audit/src/index.ts`](../../packages/data/audit/src/index.ts)

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

Source: [`packages/data/phase-gate/src/phase-gate.ts`](../../packages/data/phase-gate/src/phase-gate.ts)

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

Source: [`packages/embedder/embedder/src/index.ts`](../../packages/embedder/embedder/src/index.ts)

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
 * and reports one normalized confirmation breakdown across all assets.
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
 * newly reachable via joins?" Computes the join-reachability of sourceId
 * and targetId on the before-graph (2 BFS, not 2*N) and reasons about the
 * one-edge difference — the new edge (when type=joins) merges sourceId's
 * and targetId's join-components, so every cross-component pair is newly
 * reachable. When sourceId and targetId are already in the same component
 * (or the relation type is not 'joins'), no new reachability appears.
 *
 * A10 (incremental BFS): previously this method ran `bfsJoinReachable` from
 * EVERY node (O(N²)) + rebuilt the entire `RelationGraph` from YAML twice
 * (`getAllAssetIds` + `buildAugmentedGraph`). The incremental approach does
 * 2 BFS on the cached before-graph and caches the parsed asset-id set, so a
 * delta call is O(N+E) with zero YAML reparse (the before-graph is already
 * cached in `SemanticLayerService.getRelationGraph`). LLM-triggerable via
 * the `reachabilityDelta` tool, so the O(N²) + 2-full-reparse-per-call was
 * a real cost on every delta query.
 *
 * Correctness: the `joins` subgraph stored by `RelationGraph.build` is
 * undirected (bidirectional edges), so "reachable from sourceId" === "can
 * reach sourceId". The new bidirectional `joins` edge merges the two
 * previously-disjoint components; every cross pair `(u, v)` with `u` in
 * sourceId's component and `v` in targetId's component is newly reachable
 * (they couldn't reach each other before — different components). Pairs
 * within a single component were already reachable, so they are excluded.
 * The `from` set is filtered by the cached asset-id set to match the old
 * allNodes-iteration (a proposed sourceId/targetId that doesn't correspond
 * to a semantic-layer asset is excluded from the `from` side, just as the
 * old `getAllAssetIds()` loop did).
 * @param newRelation - the proposed relation to add before recomputing reachability.
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns the proposed relation plus the asset pairs newly reachable via joins after adding it.
 */
reachabilityDelta(newRelation: ProposedRelation, scopeId?: string): ReachabilityDeltaResult

/**
 * Query persisted eval results. An asset filter is applied only when the store
 * has a complete case-to-asset mapping source for the candidate records; otherwise the result remains global
 * and reports that asset filtering is unavailable.
 * @param filters - The asset, status, domain, scope, and record-limit filters to request.
 * @returns Matching records, total count before limiting, and asset-filter status.
 */
evalResultQuery(filters: EvalResultFilters): EvalResultQueryResult

/**
 * Return bounded newest-first run summaries for dashboard and sidebar history.
 * @param filters - Asset, domain, scope, and required run-count bound.
 * @returns Aggregate run rows, matching run count, and asset-filter status.
 * @throws When limit is not a positive integer or exceeds the server maximum.
 */
evalRunHistory(filters: EvalRunHistoryFilters): EvalRunHistoryResult

/**
 * Before/after delta: compare two runs and return which cases flipped.
 * "Improved" = moved from fail/error → pass; "regressed" = moved from pass → fail/error.
 * @param runIdA - the baseline (before) run id.
 * @param runIdB - the comparison (after) run id.
 * @param filters - optional asset, domain, and scope filters preserved from the history query.
 * @throws When an asset is requested without a complete case-to-asset mapping.
 * @returns the run ids, the flipped cases, and improved/regressed/unchanged counts.
 */
beforeAfterDelta(runIdA: string, runIdB: string, filters: EvalDeltaFilters = {}): EvalDeltaReport

/**
 * Asset health: reports normalized confirmation status, eval coverage,
 * relation count, and a nullable owner-provided modification time.
 * @param assetId - the table, event, or metric asset to report on.
 * @param scopeId - GA-GT1 Phase 3b (D5.2): optional scope id; omit to use the active scope (backward-compatible).
 * @returns the aggregate health report, or null when no table/event/metric matches assetId.
 */
assetHealth(assetId: string, scopeId?: string): AssetHealthReport | null
```

Source: [`packages/data/evidence-query/src/index.ts`](../../packages/data/evidence-query/src/index.ts)

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

Source: [`packages/identity/identity/src/index.ts`](../../packages/identity/identity/src/index.ts)

<a id="ctxmanagementcontext--managementcontextservice"></a>

### `ctx.managementContext` — `ManagementContextService`

The `ctx.managementContext` service. Owns per-context single-flight, fail-loud validation, session creation pinned to `semantic-layer-management`, and the durable data-scope binding.

```ts cordis-catalog
/**
 * Resolve the Management Context to its Management Session, creating one only
 * when none exists yet. Single-flighted per `(workspaceId, dataScopeId)`:
 * concurrent default calls for the same context share one resolution and
 * return the same `sessionId`.
 * @param request - the Workspace and Data Scope identifying the context.
 * @returns the resolved session id and whether this call created it.
 * @throws when the Workspace or Data Scope is unknown, the
 *   `semantic-layer-management` preset is unavailable, or session creation fails.
 */
resolveOrCreate(request: ManagementContextRequest): Promise<ManagementContextResolution>

/**
 * Always create another Management Session for the context, independent of any
 * existing session. A subsequent default {@link resolveOrCreate} then selects
 * the newest matching session by `updatedAt`.
 * @param request - the Workspace and Data Scope identifying the context.
 * @returns the new session id, with `created: true`.
 * @throws when the Workspace or Data Scope is unknown, the
 *   `semantic-layer-management` preset is unavailable, or session creation fails.
 */
async createNew(request: ManagementContextRequest): Promise<ManagementContextResolution>
```

Source: [`packages/data/management-context/src/index.ts`](../../packages/data/management-context/src/index.ts)

<a id="ctxmanagementcontextgateway--managementcontextgateway"></a>

### `ctx.managementContextGateway` — `ManagementContextGateway`

Host Remote gateway over `ctx.managementContext`. Register as a Host plugin to expose the `managementContext/resolveOrCreate` and `managementContext/createNew` endpoints; the Typert Gateway routes incoming calls through the live `@Remote` markers or the generated strict descriptors.

```ts cordis-catalog
/**
 * Remote face of {@link ManagementContextService.resolveOrCreate}.
 * @param request - the Workspace and Data Scope identifying the context.
 * @returns the resolved session id and whether this call created it.
 */
@Remote('resolveOrCreate') resolveOrCreate(request: ManagementContextRequest): Promise<ManagementContextResolution>

/**
 * Remote face of {@link ManagementContextService.createNew}.
 * @param request - the Workspace and Data Scope identifying the context.
 * @returns the new session id, with `created: true`.
 */
@Remote('createNew') createNew(request: ManagementContextRequest): Promise<ManagementContextResolution>
```

Source: [`packages/data/management-context/src/remote.ts`](../../packages/data/management-context/src/remote.ts)

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

Source: [`packages/data/management-session/src/index.ts`](../../packages/data/management-session/src/index.ts)

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

Source: [`packages/data/nl2sql-engine/src/index.ts`](../../packages/data/nl2sql-engine/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/query/query/src/index.ts`](../../packages/query/query/src/index.ts)

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

Source: [`packages/data/result-cache/src/index.ts`](../../packages/data/result-cache/src/index.ts)

<a id="ctxresultgateway--resultsremotegateway"></a>

### `ctx.resultGateway` — `ResultsRemoteGateway`

Host Remote gateway over the optional `ctx.resultCache` store seam. Register as a Host plugin (`host.plugin(ResultsRemoteGateway)`) to expose the `result/get` endpoint; the Typert Gateway routes incoming calls through the live `@Remote('get')` marker (or the generated strict descriptor once `build:lib:host` emits `lib/typert.host.js` + `lib/typert.remote-client.js`).

```ts cordis-catalog
/**
 * Remote face of the result-cache `get`. Reads the optional `resultCache`
 * service: absent → `internal` (the carrier's `rpcFailure` catch-all maps a
 * thrown `Error` to `{ code: 'internal' }`); a missing id →
 * `result-not-found` (a `RemoteError` carries its `.details` payload
 * through the boundary unchanged, so the `code` survives to the Client).
 * @param resultId - opaque lookup token.
 * @returns the cached entry.
 */
@Remote('get') get(resultId: ResultId): ResultEntry
```

Source: [`packages/data/result-cache/src/remote.ts`](../../packages/data/result-cache/src/remote.ts)

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

Source: [`packages/data/scope-registry/src/index.ts`](../../packages/data/scope-registry/src/index.ts)

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

Source: [`packages/data/admin/src/index.ts`](../../packages/data/admin/src/index.ts)

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

Source: [`packages/api/remotes/src/types.ts`](../../packages/api/remotes/src/types.ts)

<a id="evidenceeval-run-completed--parallel"></a>

#### `evidence/eval-run-completed` — parallel

Emitted after an eval batch is persisted to JSONL. @mode parallel

```ts cordis-catalog
/** Emitted after an eval batch is persisted to JSONL. @mode parallel */
'evidence/eval-run-completed'(): void
```

Source: [`packages/eval/eval-runner-service/src/index.ts`](../../packages/eval/eval-runner-service/src/index.ts)

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

Source: [`packages/data/evidence-query/src/index.ts`](../../packages/data/evidence-query/src/index.ts)

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

Source: [`packages/data/management-session/src/index.ts`](../../packages/data/management-session/src/index.ts)

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

Source: [`packages/data/management-session/src/index.ts`](../../packages/data/management-session/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/patrol-mode/src/index.ts`](../../packages/data/patrol-mode/src/index.ts)

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

Source: [`packages/data/scope-registry/src/index.ts`](../../packages/data/scope-registry/src/index.ts)

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

Source: [`packages/data/scope-registry/src/index.ts`](../../packages/data/scope-registry/src/index.ts)
<!-- END GENERATED cordis-surface -->
