/**
 * P6b semantic-layer — package entry. A Cordis `Service` shell (mounts via the
 * bundle patch as a capability-plugin row; declares the `ctx.schema` seam) +
 * the substrate exports consumers (P13b swap, sync-write, BasicIndex) use.
 *
 * P6b grilling (5 decisions, all = A):
 *  - Q1 package form: `packages/data/semantic-layer/` single package
 *    (@deepseek-ai/dsh-semantic-layer), group=data (mirrors audit/phase-gate/
 *    nl2sql-engine). load_* model-facing tools are DEFERRED separate tool
 *    packages (mirror tool-search-data-sources; preset already names them
 *    dsh-tool-load-table-definition / dsh-tool-load-event-definition).
 *  - Q2 seam scope: `ctx.schema` covers BOTH live-ODPS (discover/describe/sample)
 *    AND substrate definitions (loadEventDefinition/loadTableDefinition). P13b
 *    CriticGuardData swaps to `ctx.schema.load_*` (params_fields/partitions).
 *  - Q3 live-ODPS implementation: DEFERRED — P6b ships the Service Definition +
 *    substrate + a stand-in provider for sync demo/tests; the real MaxCompute
 *    provider (query-maxcompute sidecar adding schema tools, or an independent
 *    schema-maxcompute provider) is a follow-up. discover/describe/sample throw
 *    "no provider" until mounted; the P13b swap only needs substrate definitions
 *    (no live ODPS), so it is unblocked.
 *  - Q4 Tier-2 audit: routes through `ctx.audit.recordTier2Write` (P8b real
 *    sqlite audit), NOT the prototype's flat JSON log (intranet-security-first
 *    unified audit trail). The substrate `Tier2Recorder` interface is satisfied
 *    by `ctx.audit`; Tier-2 writes fail-loud if audit is not mounted (D5
 *    "不可关").
 *  - grounded: zod (mirrors pydantic; schemastery has no .passthrough) + js-yaml
 *    substrate deps; reuse `@deepseek-ai/dsh-atomic-write` for atomic writes.
 *
 * G3 (AI-Native Enrichment, resolved 2026-08-22) implementation:
 *  - `discoverRelations(opts)` Service method: delegates to the substrate
 *    `enrichAllDwsTables` (two-round DWS→DIM discovery; `llmCall` injected via
 *    `setLlmCall`, optional — absent => deterministic round only).
 *  - on-write hook: after `syncWrite`/`updateTableMeta` write a DWS, re-run
 *    discovery + persist `dimension_refs` (best-effort, unaudited — auto-derived;
 *    gated by `autoEnrich`, default true). Substrate `writeTable` is used to
 *    persist, so the hook does NOT re-enter the Service write path (no recursion).
 *
 * @module @deepseek-ai/dsh-semantic-layer
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: makes `ctx.get('audit')` resolve to the Audit augmentation. The
// seam stays optional at runtime (Tier-2 writes fail-loud without it).
import type {} from '@deepseek-ai/dsh-audit'
import {
  syncWriteDefinitions as syncWriteDefinitionsFromLayer,
  updateTableMeta as updateTableMetaFromLayer,
  loadEventDefinition as loadEventDefinitionFromLayer,
  loadTableDefinition as loadTableDefinitionFromLayer,
  loadRetrievalCorpus as loadRetrievalCorpusFromLayer,
  getCorpusVersion as getCorpusVersionFromLayer,
  type Tier2Recorder,
} from './io.ts'
import type { TableMeta, EventDefinition, TableDefinition, MetricDefinition } from './types.ts'
import { parseTerminology, type CorpusVariant, type EventCorpusItem, type EventTerminology } from './corpus.ts'
import {
  enrichAllDwsTables as enrichAllDwsTablesFromLayer,
  enrichAllEvents as enrichAllEventsFromLayer,
  type LlmCall,
} from './enrichment.ts'
import { DataSourceRegistry, type CorpusItem } from './registry.ts'
import { eventKindPlugin } from './kinds/event-kind.ts'
import { tableKindPlugin } from './kinds/table-kind.ts'
import { RelationGraph } from './relation-graph.ts'
import { projectMetricCorpusItem, deriveMetricRelations, toMetricDefinition, extractMetricsFromTable, extractMetricsFromEvent } from './metrics.ts'
import { loadConfig, loadEvents, loadTables, loadTerminology } from './io.ts'
import { EventDefinitionSchema, TableDefinitionSchema } from './types.ts'

// ── logic exports (substrate; consumers + tests use directly) ───────────
export * from './types.ts'
export {
  dumpYaml,
  resolveSemanticLayer,
  loadConfig,
  loadDomains,
  loadTerminology,
  loadEvents,
  loadTables,
  loadEventDefinition,
  loadTableDefinition,
  loadRetrievalCorpus,
  writeTable,
  writeEventYaml,
  updateTableMeta,
  inferRole,
  generateTableYaml,
  generateDimYaml,
  mergeColumns,
  mergeChangedYaml,
  syncWriteDefinitions,
  WriteValidationError,
  type RawEvent,
  type RawTable,
  type Tier2Recorder,
  type Tier2Opts,
  type WriteEventYamlResult,
  type UpdateTableMetaResult,
} from './io.ts'
export { BasicIndex, type EventIndexEntry, type TableIndexEntry } from './basic-index.ts'
export { submit, load as loadPending, listing, discard, isValidId, type PendingSuggestion, type SubmitArgs } from './pending.ts'
export {
  buildRetrievalCorpus,
  parseTerminology,
  type CorpusVariant,
  type EventCorpusItem,
  type EventCorpusInput,
  type EventTerminology,
} from './corpus.ts'
// G3: AI-Native enrichment substrate (B1/B2) + mechanical metrics extraction (B5).
export {
  discoverRelationsDeterministic,
  mergeRefs,
  buildLlmPrompt,
  parseLlmRefs,
  discoverRelationsFor,
  buildDimInventory,
  enrichAllDwsTables,
  discoverEventRelationsDeterministic,
  buildEventLlmPrompt,
  discoverEventRelationsFor,
  enrichAllEvents,
  type DimInventoryEntry,
  type LlmCall,
} from './enrichment.ts'
export {
  extractMetricsFromTable,
  extractMetricsFromEvent,
  extractMetricsFromTables,
  toMetricDefinition,
  metricName,
  inferAggregation,
  loadMetricDefinitions,
} from './metrics.ts'

// ── SchemaProvider: live-ODPS schema source (P6b Q3 deferred) ───────────
// The real provider (query-maxcompute sidecar adding list/describe/sample
// tools, or an independent schema-maxcompute provider) is a follow-up. P6b
// ships this interface + a stand-in for sync demo/tests. discover/describe/
// sample on the Service throw "no provider" until one is mounted.
/** Live-ODPS schema source: discover/describe/sample tables for sync-write (P6b Q3 deferred; production mounts a real provider). */
export interface SchemaProvider {
  /** List tables in a scope (optionally filtered by kind). Real impl: maxc list + per-table describe. */
  discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]>
  /** Describe one table's columns/partitions/comment. */
  describe(tableName: string): Promise<TableMeta | null>
  /** Sample N rows as formatted text. */
  sample(tableName: string, n?: number): Promise<string>
}

// ── ctx.schema Service Definition (Q2: covers live-ODPS + substrate) ───
/** Configuration for the `ctx.schema` Cordis Service (semantic-layer root + default scope id). */
export interface SemanticLayerConfig {
  /** Semantic-layer scope root (the dir with config.yaml/events/tables). */
  readonly semanticRoot?: string
  /** Default scope id for Tier-2 audit + schema discovery. */
  readonly scopeId?: string
  /** D2h: enrichment variant — 'params+term' (default, D2e-shipped) or
   * 'term-only' (D2g verdict (A) higher-recall). Mount-time config; switching
   * it remounts the Service (new WeakMap key -> fresh enriched linker), so it
   * is NOT part of the D2f corpusVersion cache key. */
  readonly corpusVariant?: CorpusVariant
  /** G3: auto-run DWS→DIM relation discovery after a Service write
   * (syncWrite/updateTableMeta). Default true (G3: core capability, not an
   * optional hook). Set false to suppress (e.g. during bulk sync). */
  readonly autoEnrich?: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    schema: SemanticLayerService
  }
}

/**
 * The semantic-layer Cordis `Service`. Owns the `ctx.schema` seam: substrate
 * definitions (load_*, sync-read) + live-ODPS schema (discover/describe/sample,
 * delegated to an injectable `SchemaProvider` — P6b Q3 deferred). Tier-2 writes
 * (syncWrite/updateTableMeta) route through `ctx.audit.recordTier2Write`.
 */
export class SemanticLayerService extends Service {
  static Config: z<SemanticLayerConfig> = z.object({
    semanticRoot: z.string().default(''),
    scopeId: z.string().default(''),
    corpusVariant: z.union(['params+term', 'term-only'] as const).default('params+term'),
    autoEnrich: z.boolean().default(true),
  })

  private readonly cfg: SemanticLayerConfig
  private provider: SchemaProvider | undefined
  /** G3: injected one-shot LLM call for the semantic relation round (undefined => deterministic round only). */
  private llmCall: LlmCall | undefined

  private readonly registry = new DataSourceRegistry()

  constructor(ctx: Context, config: SemanticLayerConfig) {
    super(ctx, 'schema')
    this.cfg = config
    for (const p of [eventKindPlugin, tableKindPlugin]) this.registry.register(p)
  }

  /** The live data-source-kind registry (events/tables/metrics plugins registered at construction). */
  getRegistry(): DataSourceRegistry {
    return this.registry
  }

  private graphCache: RelationGraph | undefined
  private graphVersion = -1

  /**
   * The live relation graph: bidirectional adjacency over every table's
   * `dimension_refs` (joins), every event's `external_refs` (joins), and every
   * metric's `relations` (derived_from). Cached; rebuilt when the layer's
   * corpus-version counter advances (a write bumps it via `invalidateCaches`).
   * Events only enter the graph once `enrichAllEvents` has written their
   * `external_refs` (Part B).
   * @returns the cached `RelationGraph`, rebuilt when stale.
   */
  getRelationGraph(): RelationGraph {
    if (this.graphCache !== undefined && this.graphVersion === this.corpusVersion()) {
      return this.graphCache
    }
    const g = new RelationGraph()
    const entries: { sourceId: string; relations: import('./registry.ts').RelationDef[] }[] = []
    // M1: each host table/event parsed ONCE — registered-kind relations +
    // derived metric relations pushed in the same iteration (loadTables/
    // loadEvents are uncached readdirSync+readYaml+safeParse, so the prior
    // double scan was redundant work).
    for (const t of loadTables(this.semanticRoot)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      entries.push({ sourceId: r.data.table_name, relations: tableKindPlugin.relations(r.data) })
      for (const m of extractMetricsFromTable(r.data)) {
        entries.push({ sourceId: m.name, relations: deriveMetricRelations(m) })
      }
    }
    for (const e of loadEvents(this.semanticRoot)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      entries.push({ sourceId: r.data.name, relations: eventKindPlugin.relations(r.data) })
      for (const m of extractMetricsFromEvent(r.data)) {
        entries.push({ sourceId: m.name, relations: deriveMetricRelations(m) })
      }
    }
    g.build(entries)
    this.graphCache = g
    this.graphVersion = this.corpusVersion()
    return g
  }

  /**
   * Registry-driven full retrieval corpus: every registered kind's definitions
   * projected via its `toCorpusItem` (events + tables + metrics). Supersedes
   * the events-only `loadRetrievalCorpus()` for P3/P4 — tables + metrics MUST
   * be indexable so BM25 can hit a DIM table (join recall) or a metric
   * (Level 2.5 routing). `loadRetrievalCorpus()` is unchanged (preserves the
   * D2e events-only measured behavior + its 445-item K11 test).
   * @returns the full corpus (events + tables + metrics) ready for Bm25Linker.
   */
  loadRetrievalCorpusAll(): CorpusItem[] {
    const out: CorpusItem[] = []
    const term: EventTerminology = parseTerminology(loadTerminology(this.semanticRoot))
    // M1 virtual projection: derive kind:metric CorpusItems from each host
    // table/event `metrics:` block (metrics are no longer a registered kind
    // with a storage dir — they are projected here for BM25 indexing). Each
    // host def is parsed ONCE via loadByStorageDir (uncached readdirSync+
    // readYaml+safeParse), so the host corpus item + the derived metric
    // items are pushed in the same iteration.
    for (const plugin of this.registry.allPlugins()) {
      for (const def of this.loadByStorageDir(plugin.storageDir)) {
        const item = plugin.toCorpusItem(def, term)
        if (item) out.push(item)
        const metrics = plugin.kind === 'table'
          ? extractMetricsFromTable(def as TableDefinition)
          : plugin.kind === 'event'
            ? extractMetricsFromEvent(def as EventDefinition)
            : []
        for (const m of metrics) {
          const metricItem = projectMetricCorpusItem(m)
          if (metricItem) out.push(metricItem)
        }
      }
    }
    return out
  }

  /** Dispatch a storage-dir name to its loader + schema-parse projection. */
  private loadByStorageDir(dir: string): readonly unknown[] {
    if (dir === 'events') {
      const out: unknown[] = []
      for (const e of loadEvents(this.semanticRoot)) {
        const r = EventDefinitionSchema.safeParse(e.raw)
        if (r.success) out.push(r.data)
      }
      return out
    }
    if (dir === 'tables') {
      const out: unknown[] = []
      for (const t of loadTables(this.semanticRoot)) {
        const r = TableDefinitionSchema.safeParse(t.raw)
        if (r.success) out.push(r.data)
      }
      return out
    }
    // M1: 'metrics' is no longer a storage dir — metrics are derived virtually
    // from host table/event `metrics:` blocks (see loadRetrievalCorpusAll +
    // getRelationGraph derivation passes). Unknown dirs yield an empty list.
    return []
  }

  /**
   * Mount a live-ODPS schema provider (P6b Q3 deferred; follow-up mounts the real one).
   * @param provider - the provider to delegate discover/describe/sample to, or undefined to clear.
   */
  setSchemaProvider(provider: SchemaProvider | undefined): void {
    this.provider = provider
  }

  /**
   * G3: inject (or clear) the one-shot LLM call used by the semantic relation
   * round. When undefined, `discoverRelations` + the on-write hook run the
   * deterministic PK-name round only. Production wires this to `ctx.llm`
   * (BlockAssembler-assembled text); the substrate itself stays free of the
   * LLM dependency.
   * @param fn - the llmCall to use, or undefined to run deterministic-only.
   */
  setLlmCall(fn?: LlmCall): void {
    this.llmCall = fn
  }

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
  async discoverRelations(
    opts: { readonly tables?: readonly string[] } = {},
  ): Promise<{ enriched: number; written: number; errors: string[] }> {
    return enrichAllDwsTablesFromLayer(this.semanticRoot, this.llmCall, opts.tables)
  }

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
  async discoverEventRelations(
    opts: { readonly events?: readonly string[] } = {},
  ): Promise<{ enriched: number; written: number; errors: string[] }> {
    return enrichAllEventsFromLayer(this.semanticRoot, this.llmCall, opts.events)
  }

  /**
   * G3 on-write hook: after a Service write, re-run DWS→DIM discovery for the
   * just-written tables and persist `dimension_refs` (best-effort: a failure
   * is logged, never propagated — it must not fail the originating write).
   * Uses the substrate `enrichAllDwsTables` (which writes via substrate
   * `writeTable`), so the hook does NOT re-enter the Service write path. DIM
   * tables are skipped by `enrichAllDwsTables`. Gated by `autoEnrich`.
   * @param names - the table_names just written via syncWrite/updateTableMeta.
   */
  private async enrichOnWrite(names: readonly string[]): Promise<void> {
    if (!(this.cfg.autoEnrich ?? true) || names.length === 0) return
    try {
      // mergeExisting=true: the auto on-write hook MERGES discovered refs with
      // any existing dimension_refs (curated joins preserved) rather than
      // replacing — so auto-trigger can never wipe human-curated joins the
      // deterministic round does not rediscover (code-review B2).
      await enrichAllDwsTablesFromLayer(this.semanticRoot, this.llmCall, names, true)
    } catch (e) {
      this.ctx.logger.warn(`ctx.schema on-write enrichment failed: ${(e as Error).message}`)
    }
  }

  /** The semantic-layer scope root (the dir with config.yaml/events/tables), or empty string when unset. */
  get semanticRoot(): string {
    return this.cfg.semanticRoot ?? ''
  }

  /** The default scope id for Tier-2 audit + schema discovery, or empty string when unset. */
  get scopeId(): string {
    return this.cfg.scopeId ?? ''
  }

  /** D2h: the enrichment variant (mount-time config); 'params+term' (D2e-shipped) by default. */
  get corpusVariant(): CorpusVariant {
    return this.cfg.corpusVariant ?? 'params+term'
  }

  // ── table qualification (project prefix for engine-specific SQL) ──────────

  private defaultProjectCache: string | undefined
  private defaultProjectVersion = -1

  private getDefaultProject(): string | undefined {
    const v = this.corpusVersion()
    if (this.defaultProjectVersion === v) return this.defaultProjectCache
    this.defaultProjectVersion = v
    if (!this.semanticRoot) { this.defaultProjectCache = undefined; return undefined }
    const config = loadConfig(this.semanticRoot)
    const project = config['project']
    this.defaultProjectCache = typeof project === 'object' && project !== null
      ? (project as { name?: unknown }).name as string | undefined
      : undefined
    return this.defaultProjectCache
  }

  private findTable(tableName: string): { found: true; project?: string } | { found: false } {
    if (!this.semanticRoot) return { found: false }
    for (const t of loadTables(this.semanticRoot)) {
      if (t.table_name === tableName) {
        const p = t.raw['project']
        const project = typeof p === 'string' && p.length > 0 ? p : undefined
        return project === undefined ? { found: true } : { found: true, project }
      }
    }
    return { found: false }
  }

  /**
   * Qualify a bare table name with its project prefix.
   * Only qualifies names that exist as actual tables in the layer (metrics,
   * events, and unknown names are returned unchanged).
   * Resolution: per-table `project` override → config.yaml `project.name` → bare name.
   */
  qualifyTableName(tableName: string): string {
    const t = this.findTable(tableName)
    if (!t.found) return tableName
    const project = t.project ?? this.getDefaultProject()
    return project ? `${project}.${tableName}` : tableName
  }

  // ── substrate definitions (P13b swap target: params_fields / partitions) ──
  /**
   * Load a validated event definition by name from the substrate.
   * @param name - the event `name` key to match.
   * @returns the parsed `EventDefinition`, or null when no event matches.
   */
  loadEventDefinition(name: string): EventDefinition | null {
    return loadEventDefinitionFromLayer(this.semanticRoot, name)
  }

  /**
   * Load a validated table definition by name from the substrate.
   * @param name - the table `table_name` key to match.
   * @returns the parsed `TableDefinition`, or null when no table matches.
   */
  loadTableDefinition(name: string): TableDefinition | null {
    return loadTableDefinitionFromLayer(this.semanticRoot, name)
  }

  loadMetricDefinition(name: string): MetricDefinition | null {
    // M1 virtual projection: derive a metric on demand from its host table or
    // event `metrics:` block. The metric name is `<host>__<key>` (see
    // `metricName`); split on the last `__` to recover the host + key, then
    // look the key up in the host's inline metrics block. No standalone
    // `metrics/*.yaml` files are read.
    const sep = name.lastIndexOf('__')
    if (sep <= 0) return null
    const host = name.slice(0, sep)
    const key = name.slice(sep + 2)
    const table = loadTableDefinitionFromLayer(this.semanticRoot, host)
    if (table !== null) {
      const m = table.metrics[key]
      if (m !== undefined) return toMetricDefinition(host, key, m, table.domains)
    }
    const event = loadEventDefinitionFromLayer(this.semanticRoot, host)
    if (event !== null) {
      const m = event.metrics[key]
      if (m !== undefined) return toMetricDefinition(host, key, m, event.domains)
    }
    return null
  }

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
  loadRetrievalCorpus(): readonly EventCorpusItem[] {
    return loadRetrievalCorpusFromLayer(this.semanticRoot, this.corpusVariant)
  }

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
  corpusVersion(): number {
    return getCorpusVersionFromLayer(this.semanticRoot)
  }

  // ── live-ODPS schema (deferred; throws until a provider is mounted) ──
  /**
   * List tables in a scope (optionally filtered by kind) via the mounted provider.
   * @param scopeId - the scope to discover tables in.
   * @param kind - optional kind filter forwarded to the provider.
   * @returns a readonly array of table metas, or throws when no provider is mounted.
   */
  async discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]> {
    if (this.provider === undefined) {
      throw new Error('ctx.schema.discover: no live-ODPS schema provider mounted (P6b Q3 deferred; mount query-maxcompute schema provider or setSchemaProvider)')
    }
    return this.provider.discover(scopeId, kind)
  }

  /**
   * Describe one table's columns/partitions/comment via the mounted provider.
   * @param tableName - the table name to describe.
   * @returns the table's meta, or null when the table is unknown / no provider is mounted.
   */
  async describe(tableName: string): Promise<TableMeta | null> {
    if (this.provider === undefined) {
      throw new Error('ctx.schema.describe: no live-ODPS schema provider mounted (P6b Q3 deferred)')
    }
    return this.provider.describe(tableName)
  }

  /**
   * Sample N rows of a table as formatted text via the mounted provider.
   * @param tableName - the table name to sample.
   * @param n - optional row count to sample (provider default applies when omitted).
   * @returns the formatted sample text, or throws when no provider is mounted.
   */
  async sample(tableName: string, n?: number): Promise<string> {
    if (this.provider === undefined) {
      throw new Error('ctx.schema.sample: no live-ODPS schema provider mounted (P6b Q3 deferred)')
    }
    return this.provider.sample(tableName, n)
  }

  // ── Tier-2 persistent writes (via ctx.audit; D5 non-disableable) ──
  private recorder(): Tier2Recorder {
    const audit = this.ctx.get('audit')
    if (audit === undefined) {
      throw new Error('ctx.schema Tier-2 write requires ctx.audit (Tier-2 audit is non-disableable, D5; mount @deepseek-ai/dsh-audit)')
    }
    return audit
  }

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
  async syncWrite(
    tableMetas: readonly TableMeta[],
    opts: {
      readonly dimTableNames?: Set<string>
      readonly existingTables?: Map<string, Record<string, unknown>>
      readonly scopeId?: string
    } = {},
  ): Promise<{ written: number; skipped: number; errors: string[] }> {
    const res = await syncWriteDefinitionsFromLayer(this.semanticRoot, tableMetas, {
      recorder: this.recorder(),
      scope_id: opts.scopeId ?? this.scopeId,
      ...opts.dimTableNames !== undefined ? { dimTableNames: opts.dimTableNames } : {},
      ...opts.existingTables !== undefined ? { existingTables: opts.existingTables } : {},
    })
    if ((this.cfg.autoEnrich ?? true)) {
      const written = tableMetas.filter(m => m.table_name).map(m => m.table_name)
      await this.enrichOnWrite(written)
    }
    return res
  }

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
  async updateTableMeta(
    name: string,
    updates: Record<string, unknown>,
    opts: { readonly scopeId?: string } = {},
  ): Promise<{ ok: true; table_name: string } | { ok: false; error: string }> {
    const res = await updateTableMetaFromLayer(this.semanticRoot, name, updates, {
      recorder: this.recorder(),
      scope_id: opts.scopeId ?? this.scopeId,
    })
    if (res.ok && (this.cfg.autoEnrich ?? true)) {
      await this.enrichOnWrite([name])
    }
    return res
  }
}

/**
 * Stand-in live-ODPS schema provider (P6b Q3 deferred). Mirrors the P6
 * prototype's `schema-stub.mjs` fake tables so the decoupled sync flow
 * (discover -> TableMeta[] -> generate/merge YAML -> write) is demoable +
 * testable without ODPS. Production mounts a real provider (follow-up).
 */
export class StandInSchemaProvider implements SchemaProvider {
  private readonly tables: Readonly<Record<string, TableMeta>>

  constructor(tables: Readonly<Record<string, TableMeta>>) {
    this.tables = tables
  }

  discover(_scopeId: string, kind?: string): Promise<readonly TableMeta[]> {
    const all = Object.values(this.tables)
    const filtered = kind === undefined ? all : all.filter(t => (t.comment ?? '').includes(kind))
    return Promise.resolve(filtered)
  }

  describe(tableName: string): Promise<TableMeta | null> {
    return Promise.resolve(this.tables[tableName] ?? null)
  }

  sample(tableName: string, n = 5): Promise<string> {
    return Promise.resolve(`(stand-in sample of ${tableName}, ${n} rows)`)
  }
}

/**
 * A text-only LLM seam: `text(prompt) -> string`. Production `ctx.llm`
 * (BlockAssembler-assembled text) satisfies this once mounted. Declared here
 * so the substrate + the wiring adapter stay free of the LLM dependency.
 */
export interface TextLlm {
  text(prompt: string): Promise<string>
}

/**
 * Wire a text-LLM into a schema service's enrichment `llmCall` seam. After
 * this, `discoverRelations` / `discoverEventRelations` / the on-write hook
 * run the LLM semantic round (absent => deterministic round only).
 *
 * Production (once the bundle mounts `ctx.schema` + `ctx.llm`):
 *   `wireEnrichmentLlm(ctx.schema, ctx.llm)`
 * The adapter wraps `llm.text` as the substrate's `LlmCall = (prompt) => Promise<string>`.
 * @param schema - the `SemanticLayerService` (or a structural `{ setLlmCall }` test double).
 * @param llm - the text-LLM to adapt.
 */
export function wireEnrichmentLlm(schema: { setLlmCall(fn?: (prompt: string) => Promise<string>): void }, llm: TextLlm): void {
  schema.setLlmCall(prompt => llm.text(prompt))
}

export default SemanticLayerService
