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
      return counts.get(d)!
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
}

export default SchemaGateway
