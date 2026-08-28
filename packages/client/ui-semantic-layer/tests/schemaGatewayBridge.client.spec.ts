import { describe, expect, it, vi } from 'vitest'
import { buildSchemaGatewayClient, type DomainEntry, type TableSummary, type EventSummary, type MetricSummary, type SchemaSearchHit } from '../src/client/schemaGatewayBridge.ts'

function ok<T>(value: T) { return { ok: true, value } }
function fail(error: string) { return { ok: false, error } }

const DOMAINS: DomainEntry[] = [
  { name: '角色', table_count: 5, event_count: 2, metric_count: 3 },
  { name: '付费经济', table_count: 8, event_count: 4, metric_count: 6 },
]

const TABLES: TableSummary[] = [
  { table_name: 'dws_acc_summary_df', kind: 'dws', domains: ['角色'], description: '账号汇总', column_count: 69, metric_count: 6 },
]

const EVENTS: EventSummary[] = [
  { name: 'recharge_event', domains: ['付费经济'], description: '充值事件', param_count: 5, metric_count: 2 },
]

const METRICS: MetricSummary[] = [
  { name: 'daily_revenue', domains: ['付费经济'], description: '日收入', source: 'dws_payment_df', aggregation: 'sum' },
]

const HITS: SchemaSearchHit[] = [
  { id: 'dws_acc_summary_df', score: 0.85, description: '账号汇总' },
]

function makeRemoteStub() {
  return {
    listDomains: vi.fn().mockResolvedValue(ok(DOMAINS)),
    listTables: vi.fn().mockResolvedValue(ok(TABLES)),
    listEvents: vi.fn().mockResolvedValue(ok(EVENTS)),
    listMetrics: vi.fn().mockResolvedValue(ok(METRICS)),
    getTableDefinition: vi.fn().mockResolvedValue(ok({ table_name: 'dws_acc_summary_df', columns: [] })),
    getEventDefinition: vi.fn().mockResolvedValue(ok({ name: 'recharge_event', params_fields: {} })),
    getMetricDefinition: vi.fn().mockResolvedValue(ok({ name: 'daily_revenue', computation: {} })),
    search: vi.fn().mockResolvedValue(ok(HITS)),
    getCoverageStats: vi.fn().mockResolvedValue(ok({ table_count: 10, event_count: 5, metric_count: 3, domain_counts: {} })),
  }
}

describe('buildSchemaGatewayClient', () => {
  it('wraps listDomains and unwraps RemoteResult', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.listDomains()
    expect(result).toEqual(DOMAINS)
    expect(remote.listDomains).toHaveBeenCalledOnce()
  })

  it('wraps listTables', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.listTables()
    expect(result[0]?.table_name).toBe('dws_acc_summary_df')
  })

  it('wraps listEvents', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.listEvents()
    expect(result[0]?.name).toBe('recharge_event')
  })

  it('wraps listMetrics', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.listMetrics()
    expect(result[0]?.name).toBe('daily_revenue')
  })

  it('wraps getTableDefinition with name parameter', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.getTableDefinition('dws_acc_summary_df')
    expect(result).toEqual({ table_name: 'dws_acc_summary_df', columns: [] })
    expect(remote.getTableDefinition).toHaveBeenCalledWith('dws_acc_summary_df')
  })

  it('wraps getEventDefinition with name parameter', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.getEventDefinition('recharge_event')
    expect(result).toEqual({ name: 'recharge_event', params_fields: {} })
    expect(remote.getEventDefinition).toHaveBeenCalledWith('recharge_event')
  })

  it('wraps getMetricDefinition with name parameter', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    await client.getMetricDefinition('daily_revenue')
    expect(remote.getMetricDefinition).toHaveBeenCalledWith('daily_revenue')
  })

  it('wraps search with query and topK', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.search('充值', 10)
    expect(result).toEqual(HITS)
    expect(remote.search).toHaveBeenCalledWith('充值', 10)
  })

  it('wraps getCoverageStats', async () => {
    const remote = makeRemoteStub()
    const client = buildSchemaGatewayClient(remote)
    const result = await client.getCoverageStats()
    expect(result.table_count).toBe(10)
  })

  it('throws on Remote failure', async () => {
    const remote = makeRemoteStub()
    remote.listDomains.mockResolvedValue(fail('connection lost'))
    const client = buildSchemaGatewayClient(remote)
    await expect(client.listDomains()).rejects.toThrow('schema-gateway RPC failed: connection lost')
  })

  it('returns null for nonexistent definition', async () => {
    const remote = makeRemoteStub()
    remote.getTableDefinition.mockResolvedValue(ok(null))
    const client = buildSchemaGatewayClient(remote)
    const result = await client.getTableDefinition('nonexistent')
    expect(result).toBeNull()
  })
})
