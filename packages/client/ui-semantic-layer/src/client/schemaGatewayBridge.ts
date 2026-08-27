export interface TableSummary {
  readonly table_name: string
  readonly kind: string
  readonly domains: readonly string[]
  readonly description: string
  readonly column_count: number
  readonly metric_count: number
}

export interface EventSummary {
  readonly name: string
  readonly domains: readonly string[]
  readonly description: string
  readonly param_count: number
  readonly metric_count: number
}

export interface MetricSummary {
  readonly name: string
  readonly domains: readonly string[]
  readonly description: string
  readonly source: string
  readonly aggregation: string
}

export interface SchemaSearchHit {
  readonly id: string
  readonly score: number
  readonly description?: string
}

export interface CoverageStats {
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
  readonly domain_counts: Readonly<Record<string, number>>
}

export interface DomainEntry {
  readonly name: string
  readonly table_count: number
  readonly event_count: number
  readonly metric_count: number
}

export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

export interface SchemaGatewayClient {
  listDomains(): Promise<DomainEntry[]>
  listTables(): Promise<TableSummary[]>
  listEvents(): Promise<EventSummary[]>
  listMetrics(): Promise<MetricSummary[]>
  getTableDefinition(name: string): Promise<Json | null>
  getEventDefinition(name: string): Promise<Json | null>
  getMetricDefinition(name: string): Promise<Json | null>
  search(query: string, topK?: number): Promise<SchemaSearchHit[]>
  getCoverageStats(): Promise<CoverageStats>
}

interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

interface SchemaGatewayRemoteNamespace {
  listDomains(): Promise<RemoteResult<DomainEntry[]>>
  listTables(): Promise<RemoteResult<TableSummary[]>>
  listEvents(): Promise<RemoteResult<EventSummary[]>>
  listMetrics(): Promise<RemoteResult<MetricSummary[]>>
  getTableDefinition(name: string): Promise<RemoteResult<Json | null>>
  getEventDefinition(name: string): Promise<RemoteResult<Json | null>>
  getMetricDefinition(name: string): Promise<RemoteResult<Json | null>>
  search(query: string, topK?: number): Promise<RemoteResult<SchemaSearchHit[]>>
  getCoverageStats(): Promise<RemoteResult<CoverageStats>>
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`schema-gateway RPC failed: ${String(result.error ?? 'unknown')}`)
  return result.value as T
}

export function buildSchemaGatewayClient(remote: SchemaGatewayRemoteNamespace): SchemaGatewayClient {
  return {
    async listDomains() { return unwrap(await remote.listDomains()) },
    async listTables() { return unwrap(await remote.listTables()) },
    async listEvents() { return unwrap(await remote.listEvents()) },
    async listMetrics() { return unwrap(await remote.listMetrics()) },
    async getTableDefinition(name) { return unwrap(await remote.getTableDefinition(name)) },
    async getEventDefinition(name) { return unwrap(await remote.getEventDefinition(name)) },
    async getMetricDefinition(name) { return unwrap(await remote.getMetricDefinition(name)) },
    async search(query, topK?) { return unwrap(await remote.search(query, topK)) },
    async getCoverageStats() { return unwrap(await remote.getCoverageStats()) },
  }
}
