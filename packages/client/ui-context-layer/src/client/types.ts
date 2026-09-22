/**
 * Compatibility re-export of the semantic-graph RPC types (W27).
 *
 * The graph node/edge/query/data types are OWNED by
 * `@deepseek-ai/dsh-schema-gateway` (the Remote boundary that brands node ids).
 * This client package no longer re-declares them; it re-exports the owner's
 * types under the historical local names. New code imports the
 * `SemanticGraph*` names from `@deepseek-ai/dsh-schema-gateway` directly — this
 * shim exists only until the physical file is removed.
 */
export type {
  SemanticGraphData as GraphData,
  SemanticGraphNode as GraphNode,
  SemanticGraphEdge as GraphEdge,
  SemanticGraphQuery as GraphDataOpts,
} from '@deepseek-ai/dsh-schema-gateway'
