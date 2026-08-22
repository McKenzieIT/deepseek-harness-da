/**
 * In-memory relation graph — adjacency list over DataSource definitions.
 * G2 aligned: three relation types (joins/derived_from/related_to),
 * BFS join-path discovery, getDerived for lineage traversal.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/relation-graph
 */
import type { RelationDef } from './registry.ts'

/** An edge in the relation graph (stored in adjacency list per node). */
export interface RelationEdge {
  readonly targetId: string
  readonly type: 'joins' | 'derived_from' | 'related_to'
  readonly on?: string
  readonly description?: string
}

/**
 * In-memory relation graph. Builds a bidirectional adjacency list from
 * RelationDef entries (plugin.relations() output + source id).
 */
export class RelationGraph {
  private adj = new Map<string, RelationEdge[]>()

  /**
   * Build the graph from source-tagged relation declarations.
   * Clears existing state. Stores bidirectional edges for traversal.
   */
  build(entries: { sourceId: string; relations: RelationDef[] }[]): void {
    this.adj.clear()
    for (const { sourceId, relations } of entries) {
      for (const rel of relations) {
        this.addEdge(sourceId, {
          targetId: rel.target,
          type: rel.type,
          ...(rel.on ? { on: rel.on } : {}),
          ...(rel.description ? { description: rel.description } : {}),
        })
        // Bidirectional: reverse edge for traversal
        this.addEdge(rel.target, {
          targetId: sourceId,
          type: rel.type,
          ...(rel.on ? { on: rel.on } : {}),
          ...(rel.description ? { description: rel.description } : {}),
        })
      }
    }
  }

  private addEdge(source: string, edge: RelationEdge): void {
    const list = this.adj.get(source)
    if (list) {
      list.push(edge)
    } else {
      this.adj.set(source, [edge])
    }
  }

  /**
   * BFS shortest path over 'joins'-type edges only.
   * Returns the node-id path [source, ..., target] or null if unreachable.
   */
  findJoinPath(sourceId: string, targetId: string): string[] | null {
    if (sourceId === targetId) return [sourceId]
    if (!this.adj.has(sourceId)) return null

    const visited = new Set<string>([sourceId])
    const queue: { node: string; path: string[] }[] = [{ node: sourceId, path: [sourceId] }]

    while (queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) break
      const { node, path } = next
      const edges = this.adj.get(node)
      if (!edges) continue
      for (const edge of edges) {
        if (edge.type !== 'joins') continue
        if (visited.has(edge.targetId)) continue
        const newPath = [...path, edge.targetId]
        if (edge.targetId === targetId) return newPath
        visited.add(edge.targetId)
        queue.push({ node: edge.targetId, path: newPath })
      }
    }
    return null
  }

  /**
   * Get directly related node ids (optionally filtered by relation type).
   */
  getRelated(sourceId: string, type?: 'joins' | 'derived_from' | 'related_to'): RelationEdge[] {
    const edges = this.adj.get(sourceId)
    if (!edges) return []
    if (type === undefined) return [...edges]
    return edges.filter(e => e.type === type)
  }

  /**
   * Get the join condition between two directly connected nodes, or null.
   */
  getJoinCondition(sourceId: string, targetId: string): string | null {
    const edges = this.adj.get(sourceId)
    if (!edges) return null
    const edge = edges.find(e => e.targetId === targetId && e.on)
    return edge?.on ?? null
  }

  /**
   * Get the derived-from chain: all nodes reachable via 'derived_from' edges
   * from the given source (G2 lineage traversal).
   */
  getDerived(sourceId: string): RelationEdge[] {
    const edges = this.adj.get(sourceId)
    if (!edges) return []
    return edges.filter(e => e.type === 'derived_from')
  }
}
