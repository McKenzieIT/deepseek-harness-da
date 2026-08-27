/** Slim table summary for list views (not the full TableDefinition). */
export interface TableSummary {
  readonly table_name: string
  readonly kind: string
  readonly domains: readonly string[]
  readonly description: string
  readonly column_count: number
  readonly metric_count: number
}

/** Slim event summary for list views (not the full EventDefinition). */
export interface EventSummary {
  readonly name: string
  readonly domains: readonly string[]
  readonly description: string
  readonly param_count: number
  readonly metric_count: number
}

/** Slim metric summary for list views (not the full MetricDefinition). */
export interface MetricSummary {
  readonly name: string
  readonly domains: readonly string[]
  readonly description: string
  readonly source: string
  readonly aggregation: string
}

/** A ranked search hit returned by the gateway's search endpoint. */
export interface SchemaSearchHit {
  readonly id: string
  readonly score: number
  readonly description?: string
}

/** Coverage statistics for the semantic layer (W4 dependency). */
export interface CoverageStats {
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
  readonly domain_counts: Readonly<Record<string, number>>
}

/** All domains with their asset counts. */
export interface DomainEntry {
  readonly name: string
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
}

/**
 * Recursive JSON value — the full data-source definition snapshot (a YAML-
 * loaded plain object) projected across the Remote boundary. Concrete (no
 * `unknown` index signature, which the Typert analyzer rejects) yet permissive
 * enough to carry every definition field the UI detail panel renders.
 */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

// ── W10: Context Layer Graph types ──────────────────────────────────────

/** Options for the getGraphData RPC. */
export interface GraphDataOpts {
  /** Filter to nodes in a specific domain. */
  readonly domain?: string
  /** Center the graph on a specific node id (BFS root). */
  readonly focus?: string
  /** BFS depth from focus node (default: unlimited). */
  readonly depth?: number
  /** Include metric nodes in the graph (default: false). */
  readonly includeMetrics?: boolean
}

/** A node in the context-layer graph. */
export interface GraphNode {
  /** Unique identifier (table_name, event name, or metric name). */
  readonly id: string
  /** Kind of data source. */
  readonly kind: 'dws' | 'dim' | 'event' | 'metric'
  /** Display label. */
  readonly label: string
  /** Domain(s) the node belongs to. */
  readonly domains: readonly string[]
  /** Eval pass rate (0–1), undefined if no eval data available. */
  readonly evalPassRate?: number
}

/** An edge in the context-layer graph. */
export interface GraphEdge {
  /** Source node id. */
  readonly source: string
  /** Target node id. */
  readonly target: string
  /** Relation type (joins | derived_from | related_to). */
  readonly type: string
  /** Join condition expression (for 'joins' type). */
  readonly on?: string
}

/** Response from getGraphData: full node+edge set for the context layer. */
export interface GraphData {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
}
