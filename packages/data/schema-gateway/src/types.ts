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

// ── Semantic Graph projection types (W27) ───────────────────────────────
//
// The graph projection is OPEN: node and relation `kind` are `string`, not a
// closed union, so a Semantic-Layer kind registered after this package built
// (e.g. `concept`, or any future/test kind) reaches the client through the
// same RPC without editing this file. Node identity crosses the Remote wire,
// so it is branded (`SemanticGraphNodeId`) rather than a bare `string`; the
// Host mints branded ids at the projection boundary (see `getGraphData`).

import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * Opaque cross-process identity of a semantic-graph node (table_name, event
 * name, `metric` name, or `concept:<name>`). Branded so a caller cannot pass an
 * arbitrary string where the Host expects a node the projection minted.
 */
export type SemanticGraphNodeId = Branded<'SemanticGraphNodeId'>

/** Query fields for the getGraphData RPC. */
export interface SemanticGraphQuery {
  /** Filter to nodes in a specific domain/group. */
  readonly domain?: string
  /**
   * Center the graph on a node id (BFS root). A caller-provided selector, kept
   * as a plain `string`: the Host resolves it against the minted node ids and
   * returns an empty subgraph when it names no projected node.
   */
  readonly focus?: string
  /** BFS depth from the focus node (default: unlimited). */
  readonly depth?: number
  /** Include derived `metric` nodes in the graph (default: false). */
  readonly includeMetrics?: boolean
}

/**
 * A node in the semantic graph. `kind` is an OPEN string (e.g. `dws`, `dim`,
 * `event`, `metric`, `concept`, or a kind registered later) — the client
 * presentation registry renders known kinds and falls back to a generic form
 * for unknown ones.
 */
export interface SemanticGraphNode {
  /** Branded cross-process node identity. */
  readonly id: SemanticGraphNodeId
  /** Open node kind — a client-side presentation key, never a closed union. */
  readonly kind: string
  /** Display label. */
  readonly label: string
  /** Domain(s)/group(s) the node belongs to. */
  readonly domains: readonly string[]
  /** Eval pass rate (0–1), undefined when no eval data is available. */
  readonly evalPassRate?: number
}

/**
 * An edge in the semantic graph. `type` is an OPEN relation kind (e.g. `joins`,
 * `derived_from`, `related_to`, or a relation registered later).
 */
export interface SemanticGraphEdge {
  /** Source node id. */
  readonly source: SemanticGraphNodeId
  /** Target node id. */
  readonly target: SemanticGraphNodeId
  /** Open relation kind. */
  readonly type: string
  /** Join condition expression (for `joins`-type relations). */
  readonly on?: string
}

/** Response from getGraphData: the full node + edge set for the semantic graph. */
export interface SemanticGraphData {
  readonly nodes: readonly SemanticGraphNode[]
  readonly edges: readonly SemanticGraphEdge[]
}
