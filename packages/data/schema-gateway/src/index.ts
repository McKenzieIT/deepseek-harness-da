/**
 * SchemaGateway — read-only Remote projection of `ctx.schema`
 * (SemanticLayerService) for client UI consumption. Pattern follows
 * `PluginInventoryGateway` (TypertRemoteService + @Remote).
 *
 * W1 ticket: projects asset listing, single-asset get, BM25 search, coverage
 * stats, and domain navigation. All methods are read-only; no writes flow
 * through this gateway.
 *
 * @module @deepseek-ai/dsh-schema-gateway
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-semantic-layer'
import {
  loadTables,
  loadEvents,
  loadMetricDefinitions,
  TableDefinitionSchema,
  EventDefinitionSchema,
} from '@deepseek-ai/dsh-semantic-layer'
import { Bm25Linker, type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import type {
  TableSummary,
  EventSummary,
  MetricSummary,
  SchemaSearchHit,
  CoverageStats,
  DomainEntry,
  Json,
  GraphDataOpts,
  GraphData,
  GraphNode,
  GraphEdge,
} from './types.ts'

export type * from './types.ts'

export class SchemaGateway extends TypertRemoteService {
  static inject = ['schema']

  private linkerCache: { linker: Bm25Linker; version: number } | undefined

  constructor(ctx: Context) {
    super(ctx, 'schemaGateway')
  }

  private getLinker(): Bm25Linker {
    const version = this.ctx.schema.corpusVersion()
    if (this.linkerCache !== undefined && this.linkerCache.version === version) {
      return this.linkerCache.linker
    }
    const corpus = this.ctx.schema.loadRetrievalCorpusAll() as readonly DataSourceDoc[]
    const linker = new Bm25Linker(corpus)
    this.linkerCache = { linker, version }
    return linker
  }

  @Remote('listTables')
  listTables(): TableSummary[] {
    const results: TableSummary[] = []
    for (const t of loadTables(this.ctx.schema.semanticRoot)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      const def = r.data
      results.push({
        table_name: def.table_name,
        kind: def.kind,
        domains: def.domains,
        description: def.description || def.table_comment,
        column_count: def.columns.length,
        metric_count: Object.keys(def.metrics).length,
      })
    }
    return results
  }

  @Remote('listEvents')
  listEvents(): EventSummary[] {
    const results: EventSummary[] = []
    for (const e of loadEvents(this.ctx.schema.semanticRoot)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      const def = r.data
      results.push({
        name: def.name,
        domains: def.domains,
        description: def.description,
        param_count: Object.keys(def.params_fields).length,
        metric_count: Object.keys(def.metrics).length,
      })
    }
    return results
  }

  @Remote('listMetrics')
  listMetrics(): MetricSummary[] {
    const results: MetricSummary[] = []
    for (const m of loadMetricDefinitions(this.ctx.schema.semanticRoot)) {
      results.push({
        name: m.name,
        domains: m.domains,
        description: m.description,
        source: m.computation.metadata.source,
        aggregation: m.computation.metadata.aggregation,
      })
    }
    return results
  }

  @Remote('getTableDefinition')
  getTableDefinition(name: string): Json | null {
    return this.ctx.schema.loadTableDefinition(name) as Json | null
  }

  @Remote('getEventDefinition')
  getEventDefinition(name: string): Json | null {
    return this.ctx.schema.loadEventDefinition(name) as Json | null
  }

  @Remote('getMetricDefinition')
  getMetricDefinition(name: string): Json | null {
    return this.ctx.schema.loadMetricDefinition(name) as Json | null
  }

  @Remote('search')
  search(query: string, topK?: number): SchemaSearchHit[] {
    const linker = this.getLinker()
    const hits = linker.retrieve(query, { topK: topK ?? 20, mode: 'bm25-only' })
    return hits.map(h => ({
      id: h.id,
      score: h.score,
      ...(h.payload?.description !== undefined ? { description: h.payload.description } : {}),
    }))
  }

  @Remote('listDomains')
  listDomains(): DomainEntry[] {
    const counts = new Map<string, { tables: number; events: number; metrics: number }>()
    const ensure = (d: string) => {
      if (!counts.has(d)) counts.set(d, { tables: 0, events: 0, metrics: 0 })
      return counts.get(d) as { tables: number; events: number; metrics: number }
    }

    for (const t of this.listTables()) {
      for (const d of t.domains) ensure(d).tables++
    }
    for (const e of this.listEvents()) {
      for (const d of e.domains) ensure(d).events++
    }
    for (const m of this.listMetrics()) {
      for (const d of m.domains) ensure(d).metrics++
    }

    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, c]) => ({
        name,
        table_count: c.tables,
        event_count: c.events,
        metric_count: c.metrics,
      }))
  }

  @Remote('getCoverageStats')
  getCoverageStats(): CoverageStats {
    const tables = this.listTables()
    const events = this.listEvents()
    const metrics = this.listMetrics()
    const domainCounts: Record<string, number> = {}
    for (const t of tables) for (const d of t.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
    for (const e of events) for (const d of e.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
    for (const m of metrics) for (const d of m.domains) domainCounts[d] = (domainCounts[d] ?? 0) + 1
    return {
      table_count: tables.length,
      event_count: events.length,
      metric_count: metrics.length,
      domain_counts: domainCounts,
    }
  }

  /**
   * W10: Get graph data for the context-layer interactive relation graph.
   * Returns nodes (tables, events, metrics) and edges (relations) from the
   * SemanticLayerService's RelationGraph. Supports domain filtering, focus
   * node with BFS depth, and optional metric inclusion.
   *
   * evalPassRate is left undefined in this base implementation — it will be
   * wired from the evidence-query service in a follow-up.
   */
  @Remote('getGraphData')
  getGraphData(opts?: GraphDataOpts): GraphData {
    const domain = opts?.domain
    const focus = opts?.focus
    const depth = opts?.depth
    const includeMetrics = opts?.includeMetrics ?? false

    // Collect all nodes from tables, events, and optionally metrics
    const allNodes: GraphNode[] = []
    const nodeIdSet = new Set<string>()

    for (const t of loadTables(this.ctx.schema.semanticRoot)) {
      const r = TableDefinitionSchema.safeParse(t.raw)
      if (!r.success) continue
      const def = r.data
      if (domain && !def.domains.includes(domain)) continue
      const node: GraphNode = {
        id: def.table_name,
        kind: def.kind as 'dws' | 'dim',
        label: def.table_name,
        domains: [...def.domains],
      }
      allNodes.push(node)
      nodeIdSet.add(node.id)
    }

    for (const e of loadEvents(this.ctx.schema.semanticRoot)) {
      const r = EventDefinitionSchema.safeParse(e.raw)
      if (!r.success) continue
      const def = r.data
      if (domain && !def.domains.includes(domain)) continue
      const node: GraphNode = {
        id: def.name,
        kind: 'event',
        label: def.name,
        domains: [...def.domains],
      }
      allNodes.push(node)
      nodeIdSet.add(node.id)
    }

    if (includeMetrics) {
      for (const m of loadMetricDefinitions(this.ctx.schema.semanticRoot)) {
        if (domain && !m.domains.includes(domain)) continue
        const node: GraphNode = {
          id: m.name,
          kind: 'metric',
          label: m.name,
          domains: [...m.domains],
        }
        allNodes.push(node)
        nodeIdSet.add(node.id)
      }
    }

    // Collect edges from the relation graph
    const relationGraph = this.ctx.schema.getRelationGraph()
    const allEdges: GraphEdge[] = []
    const edgeSet = new Set<string>() // dedupe "A->B" pairs

    for (const node of allNodes) {
      const related = relationGraph.getRelated(node.id)
      for (const edge of related) {
        if (!nodeIdSet.has(edge.targetId)) continue
        const edgeKey = `${node.id}->${edge.targetId}:${edge.type}`
        if (edgeSet.has(edgeKey)) continue
        edgeSet.add(edgeKey)
        allEdges.push({
          source: node.id,
          target: edge.targetId,
          type: edge.type,
          ...(edge.on ? { on: edge.on } : {}),
        })
      }
    }

    // If focus is specified, BFS from focus node to limit depth
    if (focus && depth !== undefined && depth > 0) {
      // Guard: if the focus node is not in the filtered node set, skip BFS
      // filtering entirely and return all nodes/edges as-is.
      if (!nodeIdSet.has(focus)) {
        return { nodes: allNodes, edges: allEdges }
      }
      const reachable = new Set<string>([focus])
      let frontier = [focus]
      for (let d = 0; d < depth && frontier.length > 0; d++) {
        const nextFrontier: string[] = []
        for (const nid of frontier) {
          const related = relationGraph.getRelated(nid)
          for (const edge of related) {
            if (!nodeIdSet.has(edge.targetId)) continue
            if (!reachable.has(edge.targetId)) {
              reachable.add(edge.targetId)
              nextFrontier.push(edge.targetId)
            }
          }
        }
        frontier = nextFrontier
      }

      const filteredNodes = allNodes.filter(n => reachable.has(n.id))
      const filteredEdges = allEdges.filter(
        e => reachable.has(e.source) && reachable.has(e.target),
      )
      return { nodes: filteredNodes, edges: filteredEdges }
    }

    return { nodes: allNodes, edges: allEdges }
  }
}

export default SchemaGateway
