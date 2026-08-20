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
  type Tier2Recorder,
} from './io.ts'
import type { TableMeta, EventDefinition, TableDefinition } from './types.ts'

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

// ── SchemaProvider: live-ODPS schema source (P6b Q3 deferred) ───────────
// The real provider (query-maxcompute sidecar adding list/describe/sample
// tools, or an independent schema-maxcompute provider) is a follow-up. P6b
// ships this interface + a stand-in for sync demo/tests. discover/describe/
// sample on the Service throw "no provider" until one is mounted.
export interface SchemaProvider {
  /** List tables in a scope (optionally filtered by kind). Real impl: maxc list + per-table describe. */
  discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]>
  /** Describe one table's columns/partitions/comment. */
  describe(tableName: string): Promise<TableMeta | null>
  /** Sample N rows as formatted text. */
  sample(tableName: string, n?: number): Promise<string>
}

// ── ctx.schema Service Definition (Q2: covers live-ODPS + substrate) ───
export interface SemanticLayerConfig {
  /** Semantic-layer scope root (the dir with config.yaml/events/tables). */
  readonly semanticRoot?: string
  /** Default scope id for Tier-2 audit + schema discovery. */
  readonly scopeId?: string
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
  })

  private readonly cfg: SemanticLayerConfig
  private provider: SchemaProvider | undefined

  constructor(ctx: Context, config: SemanticLayerConfig) {
    super(ctx, 'schema')
    this.cfg = config
  }

  /** Mount a live-ODPS schema provider (P6b Q3 deferred; follow-up mounts the real one). */
  setSchemaProvider(provider: SchemaProvider | undefined): void {
    this.provider = provider
  }

  get semanticRoot(): string {
    return this.cfg.semanticRoot ?? ''
  }

  get scopeId(): string {
    return this.cfg.scopeId ?? ''
  }

  // ── substrate definitions (P13b swap target: params_fields / partitions) ──
  loadEventDefinition(name: string): EventDefinition | null {
    return loadEventDefinitionFromLayer(this.semanticRoot, name)
  }

  loadTableDefinition(name: string): TableDefinition | null {
    return loadTableDefinitionFromLayer(this.semanticRoot, name)
  }

  // ── live-ODPS schema (deferred; throws until a provider is mounted) ──
  async discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]> {
    if (this.provider === undefined) {
      throw new Error('ctx.schema.discover: no live-ODPS schema provider mounted (P6b Q3 deferred; mount query-maxcompute schema provider or setSchemaProvider)')
    }
    return this.provider.discover(scopeId, kind)
  }

  async describe(tableName: string): Promise<TableMeta | null> {
    if (this.provider === undefined) {
      throw new Error('ctx.schema.describe: no live-ODPS schema provider mounted (P6b Q3 deferred)')
    }
    return this.provider.describe(tableName)
  }

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

  async syncWrite(
    tableMetas: readonly TableMeta[],
    opts: {
      readonly dimTableNames?: Set<string>
      readonly existingTables?: Map<string, Record<string, unknown>>
      readonly scopeId?: string
    } = {},
  ): Promise<{ written: number; skipped: number; errors: string[] }> {
    return syncWriteDefinitionsFromLayer(this.semanticRoot, tableMetas, {
      recorder: this.recorder(),
      scope_id: opts.scopeId ?? this.scopeId,
      ...opts.dimTableNames !== undefined ? { dimTableNames: opts.dimTableNames } : {},
      ...opts.existingTables !== undefined ? { existingTables: opts.existingTables } : {},
    })
  }

  async updateTableMeta(
    name: string,
    updates: Record<string, unknown>,
    opts: { readonly scopeId?: string } = {},
  ): Promise<{ ok: true; table_name: string } | { ok: false; error: string }> {
    return updateTableMetaFromLayer(this.semanticRoot, name, updates, {
      recorder: this.recorder(),
      scope_id: opts.scopeId ?? this.scopeId,
    })
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

export default SemanticLayerService
