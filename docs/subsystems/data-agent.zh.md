# 数据代理

中文 | [English](data-agent.md)

data-agent 叠加层挂载五个 Cordis 服务——`ctx.audit`（只追加的审计/tier-2 写入存储）、`ctx.embedder`（嵌入/重排 seam）、`ctx.identity`（调用方身份）、`ctx.nl2sql`（自然语言→SQL 引擎）、`ctx.schema`（语义层：发现/描述/采样数据源）——它们共同实现自然语言数据访问。

来源：[`packages/data`](../../packages/data/README.md)

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

Source: [`packages/identity/identity/src/index.ts:52`](../../packages/identity/identity/src/index.ts)

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

Source: [`packages/data/nl2sql-engine/src/index.ts:65`](../../packages/data/nl2sql-engine/src/index.ts)

<a id="ctxschema--semanticlayerservice"></a>

### `ctx.schema` — `SemanticLayerService`

The semantic-layer Cordis `Service`. Owns the `ctx.schema` seam: substrate definitions (load_*, sync-read) + live-ODPS schema (discover/describe/sample, delegated to an injectable `SchemaProvider` — P6b Q3 deferred). Tier-2 writes (syncWrite/updateTableMeta) route through `ctx.audit.recordTier2Write`.

```ts cordis-catalog
/**
 * Mount a live-ODPS schema provider (P6b Q3 deferred; follow-up mounts the real one).
 * @param provider - the provider to delegate discover/describe/sample to, or undefined to clear.
 */
setSchemaProvider(provider: SchemaProvider | undefined): void

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
 * `ctx.audit` (D5 non-disableable). Routes to `syncWriteDefinitions`.
 * @param tableMetas - the table metas to write (from discover/describe).
 * @param opts - optional dim-table-name set, existing-table map for merge, and scope id override.
 * @returns counts of written/skipped tables plus per-table error messages.
 */
async syncWrite( tableMetas: readonly TableMeta[], opts: { readonly dimTableNames?: Set<string> readonly existingTables?: Map<string, Record<string, unknown>> readonly scopeId?: string } = {}, ): Promise<{ written: number; skipped: number; errors: string[] }>

/**
 * Tier-2 per-scope write: read-merge-validate-write a single table's meta
 * updates, recording the write via `ctx.audit` (D5 non-disableable).
 * @param name - the table `table_name` to update.
 * @param updates - the field overrides merged over the existing table YAML.
 * @param opts - optional scope id override (default scope id is used when omitted).
 * @returns `{ ok: true, table_name }` on success, or `{ ok: false, error }` when the table is missing/malformed or validation fails.
 */
async updateTableMeta( name: string, updates: Record<string, unknown>, opts: { readonly scopeId?: string } = {}, ): Promise<{ ok: true; table_name: string } | { ok: false; error: string }>
```

Source: [`packages/data/semantic-layer/src/index.ts:113`](../../packages/data/semantic-layer/src/index.ts)
<!-- END GENERATED cordis-surface -->
