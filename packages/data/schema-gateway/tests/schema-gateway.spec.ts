import { afterEach, describe, expect, it } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import SchemaGateway from '../src/index.ts'

const dirs: string[] = []

afterEach(() => {
  dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true }))
})

function seedLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sg-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), 'project:\n  name: test\n  scope_id: test\n')
  mkdirSync(join(dir, 'tables'), { recursive: true })
  mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
  mkdirSync(join(dir, 'metrics'), { recursive: true })

  writeFileSync(join(dir, 'tables', 'dws_order_di.yaml'), yaml.dump({
    table_name: 'dws_order_di', kind: 'dws', description: '订单汇总表',
    table_comment: '', domains: ['付费经济'], granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'order_id', type: 'string', comment: '订单ID', role: 'dimension' },
      { name: 'amount', type: 'decimal', comment: '金额', role: 'measure' },
    ],
    metrics: { total_amount: { expression: 'SUM(amount)', description: '总金额' } },
    partitions: [{ name: 'ds', type: 'string' }],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: [], primary_key_unique: null, duplicate_sample: [],
    label_columns: [], freshness: '', dimension_refs: [],
  }))

  writeFileSync(join(dir, 'tables', 'dim_server.yaml'), yaml.dump({
    table_name: 'dim_server', kind: 'dim', description: '区服维表',
    table_comment: '', domains: ['基础数据'], granularity: '',
    engine: 'maxcompute',
    columns: [
      { name: 'server_id', type: 'string', comment: '', role: 'dimension' },
      { name: 'server_name', type: 'string', comment: '', role: 'dimension' },
    ],
    metrics: {}, partitions: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null, supersedes: [], disambiguation: null,
    primary_key: ['server_id'], primary_key_unique: null, duplicate_sample: [],
    label_columns: ['server_name'], freshness: '静态参考', dimension_refs: [],
  }))

  writeFileSync(join(dir, 'events', 'pay', 'game.pay.order.yaml'), yaml.dump({
    name: 'game.pay.order', description: '充值下单事件',
    domains: ['付费经济'],
    params_fields: {
      server_id: { type: 'string', description: '区服ID' },
      amount: { type: 'decimal', description: '金额' },
    },
    metrics: {}, external_refs: [], disambiguation: [],
    confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
    coverage: null,
  }))

  writeFileSync(join(dir, 'metrics', 'dws_order_di__total_amount.yaml'), yaml.dump({
    kind: 'metric', name: 'dws_order_di__total_amount',
    description: '总金额', domains: ['付费经济'],
    computation: {
      sql: 'SUM(amount)',
      metadata: { aggregation: 'sum', field: 'amount', source: 'dws_order_di', time_grain: '' },
    },
    relations: [{ type: 'derived_from', target: 'dws_order_di', description: '' }],
  }))

  return dir
}

async function makeGateway(): Promise<SchemaGateway> {
  const dir = seedLayer()
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  new SemanticLayerService(ctx, { semanticRoot: dir, scopeId: 'test' })
  return new SchemaGateway(ctx)
}

describe('SchemaGateway', () => {
  it('publishes Remote methods under the schemaGateway namespace', async () => {
    const gw = await makeGateway()
    expect(gw.typertRemote).toMatchObject({
      serviceKey: 'schemaGateway',
      namespace: 'schemaGateway',
    })
    const methods = remoteMethods(gw).map(m => m.method).sort()
    expect(methods).toEqual([
      'getCoverageStats',
      'getEventDefinition',
      'getGraphData',
      'getMetricDefinition',
      'getTableDefinition',
      'listDomains',
      'listEvents',
      'listMetrics',
      'listTables',
      'search',
    ])
  })

  it('listTables returns slim summaries with domains exposed', async () => {
    const gw = await makeGateway()
    const tables = gw.listTables()
    expect(tables).toHaveLength(2)
    const dws = tables.find(t => t.table_name === 'dws_order_di')
    expect(dws).toEqual({
      table_name: 'dws_order_di',
      kind: 'dws',
      domains: ['付费经济'],
      description: '订单汇总表',
      column_count: 2,
      metric_count: 1,
    })
    const dim = tables.find(t => t.table_name === 'dim_server')
    expect(dim?.kind).toBe('dim')
    expect(dim?.domains).toEqual(['基础数据'])
  })

  it('listEvents returns slim summaries with domains exposed', async () => {
    const gw = await makeGateway()
    const events = gw.listEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      name: 'game.pay.order',
      domains: ['付费经济'],
      description: '充值下单事件',
      param_count: 2,
      metric_count: 0,
    })
  })

  it('listMetrics returns slim summaries with source and aggregation', async () => {
    const gw = await makeGateway()
    const metrics = gw.listMetrics()
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toEqual({
      name: 'dws_order_di__total_amount',
      domains: ['付费经济'],
      description: '总金额',
      source: 'dws_order_di',
      aggregation: 'sum',
    })
  })

  it('getTableDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getTableDefinition('dws_order_di') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.table_name).toBe('dws_order_di')
    expect((def.columns as unknown[]).length).toBe(2)
  })

  it('getEventDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getEventDefinition('game.pay.order') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.name).toBe('game.pay.order')
    expect(Object.keys(def.params_fields as object)).toEqual(['server_id', 'amount'])
  })

  it('getMetricDefinition returns the full definition', async () => {
    const gw = await makeGateway()
    const def = gw.getMetricDefinition('dws_order_di__total_amount') as Record<string, unknown>
    expect(def).not.toBeNull()
    expect(def.name).toBe('dws_order_di__total_amount')
  })

  it('search returns ranked hits from BM25 over the full corpus', async () => {
    const gw = await makeGateway()
    const hits = gw.search('订单 金额')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toHaveProperty('id')
    expect(hits[0]).toHaveProperty('score')
  })

  it('listDomains aggregates asset counts by domain', async () => {
    const gw = await makeGateway()
    const domains = gw.listDomains()
    const pay = domains.find(d => d.name === '付费经济')
    expect(pay).toBeDefined()
    expect(pay!.table_count).toBe(1)
    expect(pay!.event_count).toBe(1)
    expect(pay!.metric_count).toBe(1)
    const base = domains.find(d => d.name === '基础数据')
    expect(base).toBeDefined()
    expect(base!.table_count).toBe(1)
  })

  it('getCoverageStats returns counts and domain breakdown', async () => {
    const gw = await makeGateway()
    const stats = gw.getCoverageStats()
    expect(stats.table_count).toBe(2)
    expect(stats.event_count).toBe(1)
    expect(stats.metric_count).toBe(1)
    expect(stats.domain_counts['付费经济']).toBe(3)
    expect(stats.domain_counts['基础数据']).toBe(1)
  })

  it('returns null for nonexistent definitions', async () => {
    const gw = await makeGateway()
    expect(gw.getTableDefinition('nonexistent')).toBeNull()
    expect(gw.getEventDefinition('nonexistent')).toBeNull()
    expect(gw.getMetricDefinition('nonexistent')).toBeNull()
  })
})
