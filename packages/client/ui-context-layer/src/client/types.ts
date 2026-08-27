/**
 * Shared types for the context layer graph component.
 * These mirror the server-side getGraphData response shape
 * (SchemaGateway.getGraphData).
 */

export interface GraphDataOpts {
  /** Filter to nodes in a specific domain. */
  domain?: string
  /** Center the graph on a specific node id. */
  focus?: string
  /** BFS depth from focus node (default: unlimited). */
  depth?: number
  /** Include metric nodes in the graph. */
  includeMetrics?: boolean
}

export interface GraphNode {
  /** Unique identifier (table_name, event name, or metric name). */
  id: string
  /** Kind of data source. */
  kind: 'dws' | 'dim' | 'event' | 'metric'
  /** Display label. */
  label: string
  /** Domain(s) the node belongs to. */
  domains: string[]
  /** Eval pass rate (0–1), undefined if no eval data. */
  evalPassRate?: number
}

export interface GraphEdge {
  /** Source node id. */
  source: string
  /** Target node id. */
  target: string
  /** Relation type (joins | derived_from | related_to). */
  type: string
  /** Join condition expression (for 'joins' type). */
  on?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
