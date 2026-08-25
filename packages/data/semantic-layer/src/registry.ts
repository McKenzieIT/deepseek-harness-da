/**
 * DataSourceRegistry — a typed plugin registry for semantic-layer data-source
 * kinds (G1 Decision B: DataSourceKindPlugin<T>). Each kind plugin declares how
 * to identify, index, format, and relate definitions of its type.
 *
 * Aligned with G1 §D2 interface design + G2 ontology decisions.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/registry
 */
import type { EventTerminology } from './corpus.ts'

// ── Shared types (G1 §D2) ──────────────────────────────────────────────

/** A unified corpus item for retrieval indexing (G1: type-agnostic). */
export interface CorpusItem {
  readonly id: string
  readonly description?: string
  readonly metrics?: Readonly<Record<string, unknown>>
  readonly payload?: unknown
}

/**
 * Aggregated critic-context fields from one or more definitions (G1 §D2).
 * Fields are optional — not all kinds provide all axes.
 */
export interface CriticFields {
  readonly eventParams?: Readonly<Record<string, unknown>>
  readonly partitionCols?: readonly string[]
}

/**
 * A relation declared by a data source (G1 §D2 + G2: three base types).
 * Returned by plugin.relations(def); source is the definition that declared it.
 */
export interface RelationDef {
  /** Relation type (G2: three base types). */
  readonly type: 'joins' | 'derived_from' | 'related_to'
  /** Target data-source id. */
  readonly target: string
  /** Join condition expression (e.g. "charm_id = charm_id"). */
  readonly on?: string
  /** Human-readable description of the relationship. */
  readonly description?: string
}

// ── DataSourceKindPlugin<T> (G1 §D2) ───────────────────────────────────

/** Minimal schema interface (structurally matches zod schemas without hard dep). */
export interface SchemaLike<T> {
  parse(raw: unknown): T
  safeParse(raw: unknown): { success: boolean; data?: T; error?: unknown }
}

/**
 * A plugin that teaches the registry how to handle one kind of data source.
 * Generic over T (the definition shape — EventDefinition, TableDefinition, etc.).
 * G1 §D2 aligned: schema, terminology-aware toCorpusItem, raw-based getId.
 */
export interface DataSourceKindPlugin<T = unknown> {
  /** Unique kind identifier (e.g. 'event', 'table', 'metric'). */
  readonly kind: string

  /** Zod validation schema for this kind's definitions (G1 §D2). */
  readonly schema: SchemaLike<T>

  /** YAML storage subdirectory name (e.g. 'events', 'tables', 'metrics'). */
  readonly storageDir: string

  /**
   * Extract the canonical id from a raw (unparsed) YAML object (G1 §D2).
   * Returns undefined if the raw object doesn't have a valid id for this kind.
   */
  getId(raw: Record<string, unknown>): string | undefined

  /**
   * Project a definition to a corpus item for retrieval indexing (G1 §D2).
   * Terminology is injected as a global resource for enrichment.
   * Returns null to skip indexing for this definition.
   */
  toCorpusItem(def: T, terminology?: EventTerminology): CorpusItem | null

  /** Format a definition into prompt context (for model-facing tools). */
  toPromptContext(def: T): string

  /** Extract critic-relevant fields from a definition (optional; not all kinds have critic logic). */
  toCriticContext?(def: T): CriticFields

  /**
   * Declare relations this definition has to other data sources (G2: required).
   * Return empty array when no relations exist.
   */
  relations(def: T): RelationDef[]

  /**
   * Return an executable rule/SQL template (G2, MetricPlugin only — removed in M1b; retained as optional interface for backward-compat).
   * Optional — only metric-type plugins implement this.
   */
  toExecutableRule?(def: T): string | null
}

// ── DataSourceRegistry ──────────────────────────────────────────────────

/**
 * Registry of data-source kind plugins. Allows registration and lookup by kind string.
 */
export class DataSourceRegistry {
  private readonly plugins = new Map<string, DataSourceKindPlugin>()

  /** Register a kind plugin. Throws if the kind is already registered. */
  register(plugin: DataSourceKindPlugin): void {
    if (this.plugins.has(plugin.kind)) {
      throw new Error(`DataSourceRegistry: kind "${plugin.kind}" is already registered`)
    }
    this.plugins.set(plugin.kind, plugin)
  }

  /** Get a registered plugin by kind, or undefined if not registered. */
  getKind(kind: string): DataSourceKindPlugin | undefined {
    return this.plugins.get(kind)
  }

  /** Return all registered kind strings. */
  allKinds(): string[] {
    return [...this.plugins.keys()]
  }

  /** Return all registered plugins. */
  allPlugins(): DataSourceKindPlugin[] {
    return [...this.plugins.values()]
  }
}
