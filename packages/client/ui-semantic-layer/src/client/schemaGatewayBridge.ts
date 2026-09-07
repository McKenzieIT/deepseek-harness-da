import { unwrapRemoteResult } from './remoteResult.ts'
import type { RemoteResult } from './remoteResult.ts'

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
  listDomains: () => Promise<DomainEntry[]>
  listTables: () => Promise<TableSummary[]>
  listEvents: () => Promise<EventSummary[]>
  listMetrics: () => Promise<MetricSummary[]>
  getTableDefinition: (name: string) => Promise<Json | null>
  getEventDefinition: (name: string) => Promise<Json | null>
  getMetricDefinition: (name: string) => Promise<Json | null>
  search: (query: string, topK?: number) => Promise<SchemaSearchHit[]>
  getCoverageStats: () => Promise<CoverageStats>
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

export function buildSchemaGatewayClient(remote: SchemaGatewayRemoteNamespace): SchemaGatewayClient {
  return {
    async listDomains() { return unwrapRemoteResult(await remote.listDomains(), 'schema-gateway') },
    async listTables() { return unwrapRemoteResult(await remote.listTables(), 'schema-gateway') },
    async listEvents() { return unwrapRemoteResult(await remote.listEvents(), 'schema-gateway') },
    async listMetrics() { return unwrapRemoteResult(await remote.listMetrics(), 'schema-gateway') },
    async getTableDefinition(name) { return unwrapRemoteResult(await remote.getTableDefinition(name), 'schema-gateway') },
    async getEventDefinition(name) { return unwrapRemoteResult(await remote.getEventDefinition(name), 'schema-gateway') },
    async getMetricDefinition(name) { return unwrapRemoteResult(await remote.getMetricDefinition(name), 'schema-gateway') },
    async search(query, topK?) { return unwrapRemoteResult(await remote.search(query, topK), 'schema-gateway') },
    async getCoverageStats() { return unwrapRemoteResult(await remote.getCoverageStats(), 'schema-gateway') },
  }
}
